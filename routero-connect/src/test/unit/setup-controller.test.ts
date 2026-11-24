import { strict as assert } from "node:assert";
import { test } from "node:test";
import { resolve } from "node:path";
import { SetupController, type SetupUi, type RecoveryRecord, type Choice } from "../../ui/controller";
import { type CliReply, type CliRunner } from "../../ui/cli-runner";
import { bundledCatalog } from "../../cli/codex";
import { fixtureCatalog } from "../fixtures/codex";

const changeId = "12345678-1234-4234-8234-123456789abc";
const secret = "sk-test-wizard-dummy-never-log-this";
class FakeUi implements SetupUi {
  notifications: string[] = [];
  logs: unknown[] = [];
  previews: string[] = [];
  inputs: { title: string; password: boolean }[] = [];
  picks: string[] = [];
  saved?: RecoveryRecord;
  confirmation: (message: string) => boolean = () => true;
  selection: (title: string, choices: readonly Choice[]) => string | undefined = (title, choices) => title.includes("environment") ? "custom" : title.includes("Existing managed") ? "replace" : choices[0]?.id;
  async pick(title: string, choices: readonly Choice[]) { this.picks.push(title); return this.selection(title, choices); }
  async input(title: string, value?: string, password = false) {
    this.inputs.push({ title, password });
    if (password) { return secret; }
    if (title.includes("HTTPS API")) { return "https://fixture.invalid"; }
    if (title.includes("recovery directory")) { return resolve("out/ui-private-history"); }
    if (title.includes("New private helper")) { return resolve("out/ui-new-helper"); }
    if (title.includes("owning profile") || title.includes("reference ID")) { return "fixture"; }
    return value;
  }
  async path(title: string) {
    return resolve("out", title.includes("Node") ? "node.exe" : title.includes("Codex CLI") ? "codex.exe" : title.includes("config.toml") ? "config.toml" : "helper");
  }
  async confirm(message: string) { return this.confirmation(message); }
  async preview(text: string) { this.previews.push(text); }
  notify(message: string) { this.notifications.push(message); }
  log(value: unknown) { this.logs.push(value); }
  async progress<T>(_title: string, _cancellable: boolean, action: (signal: AbortSignal) => Promise<T>) { return action(new AbortController().signal); }
  async saveRecovery(record: RecoveryRecord) { this.saved = record; }
  lastRecovery() { return this.saved; }
}
class FakeRunner implements CliRunner {
  calls: { args: readonly string[]; options: { secret?: string; signal?: AbortSignal } }[] = [];
  allowed = true;
  handler?: (args: readonly string[]) => CliReply;
  async run(_node: string, args: readonly string[], options = {}) {
    this.calls.push({ args, options });
    if (this.handler) { return this.handler(args); }
    if (args[0] === "models") { return { code: 0, messages: [{ scope: "key-visible-models", total: 1, displayed: 1, models: [{ modelId: "fixture/one", allowed: this.allowed, status: this.allowed ? "verified" : "unsupported", reason: this.allowed ? "verified" : "unsupported" }] }] }; }
    if (args[0] === "connect") { return args.includes("--apply") ? { code: 0, messages: [{ status: "applied", changeId }] } : { code: 0, messages: [{ scope: "connection-preview", plan: { files: [{ expectedRevision: "a".repeat(64), redactedDiff: "[REDACTED VALUE]" }], conflicts: [] } }] }; }
    if (args[0] === "doctor") { return { code: 1, messages: [{ scope: "local-only", codingCompatibility: "unverified" }] }; }
    if (args[0] === "disconnect") { return { code: 0, messages: [{ status: args.includes("--apply") ? "restored" : "confirmation" }] }; }
    return { code: 0, messages: [] };
  }
}
function fixture(real = false) { const ui = new FakeUi(); const runner = new FakeRunner(); return { ui, runner, controller: new SetupController(ui, runner, real ? bundledCatalog() : fixtureCatalog()) }; }

test("CLI rejection surfaces the redacted diagnostic instead of only a generic warning", async () => {
  const f = fixture();
  f.runner.handler = () => ({ code: 1, messages: [{ diagnostic: { code: "client-unavailable", message: `Client detection failed. ${secret}` } }] });
  await f.controller.perform("connect");
  assert.ok(f.ui.notifications.at(-1)?.includes("client-unavailable"));
  assert.ok(!JSON.stringify(f.ui.notifications).includes(secret));
  assert.equal(f.runner.calls.length, 1);
});

test("production wizard offers only explicit isolated validation; IDE support stays separate", async () => {
  const f = fixture(true);
  f.ui.selection = (title, choices) => {
    if (title === "Model support level") { assert.deepEqual(choices.map((choice) => choice.id), ["validation"]); return undefined; }
    return choices[0]?.id;
  };
  await f.controller.perform("connect");
  assert.equal(f.runner.calls.length, 0);
  assert.equal(f.ui.inputs.length, 0);
  assert.ok(f.ui.notifications[0].includes("cancelled"));
  f.ui.selection = () => "ide";
  await f.controller.perform("connect");
  assert.ok(f.ui.notifications.at(-1)?.includes("IDE adapter"));
  assert.equal(f.runner.calls.length, 0);
});

test("isolated validation uses only its dedicated home and explicit mode flags", async () => {
  const f = fixture(true);
  const root = resolve("out", "codex-plugin-validation");
  const originalPath = f.ui.path.bind(f.ui);
  f.ui.path = async (title) => title.includes("dedicated codex-plugin-validation") ? root : originalPath(title);
  f.ui.selection = (title, choices) => title.includes("environment") ? "uat" : title.includes("Existing managed") ? "replace" : choices[0]?.id;
  f.runner.handler = (args) => {
    if (args[0] === "models") { return { code: 0, messages: [{ scope: "key-visible-models", total: 1, displayed: 1, models: [{ modelId: "openai/gpt-6-luna", allowed: true, status: "experimental", reason: "isolated-validation-opt-in" }] }] }; }
    return args.includes("--apply") ? { code: 0, messages: [{ status: "applied", changeId }] } : { code: 0, messages: [{ scope: "connection-preview", plan: { files: [{ expectedRevision: "a".repeat(64) }], conflicts: [] } }] };
  };
  await f.controller.perform("connect");
  assert.equal(f.runner.calls.length, 3);
  for (const call of f.runner.calls) { assert.ok(call.args.includes("--isolated-validation")); assert.ok(call.args.includes(root)); }
  assert.ok(f.runner.calls[1].args.includes(resolve(root, "codex-home", "config.toml")));
  assert.ok(f.ui.notifications.at(-1)?.includes("Isolated validation settings"));
});

test("declining the isolated warning stops before paths, keys or CLI calls", async () => {
  const f = fixture(true);
  f.ui.confirmation = () => false;
  await f.controller.perform("connect");
  assert.equal(f.runner.calls.length, 0);
  assert.equal(f.ui.inputs.length, 0);
});

test("synthetic wizard reviews preview, applies its revision and saves a recovery shortcut", async () => {
  const f = fixture();
  await f.controller.perform("connect");
  assert.deepEqual(f.runner.calls.map((c) => c.args[0]), ["models", "connect", "connect"]);
  const apply = f.runner.calls.at(-1)!;
  assert.ok(apply.args.includes("--expected-revision"));
  assert.ok(apply.args.includes("a".repeat(64)));
  assert.equal(apply.options.signal, undefined);
  assert.equal(f.ui.saved?.changeId, changeId);
  assert.ok(f.ui.previews[0].includes("[REDACTED VALUE]"));
  assert.ok(f.ui.notifications.at(-1)?.includes("Restart"));
  assert.ok(f.ui.inputs.every((input) => !input.password));
});

test("declining apply and selecting an unsupported model never modify settings", async () => {
  const f = fixture();
  f.ui.confirmation = (message) => !message.startsWith("Apply the displayed");
  await f.controller.perform("connect");
  assert.ok(!f.runner.calls.some((call) => call.args.includes("--apply")));
  const blocked = fixture();
  blocked.runner.allowed = false;
  await blocked.controller.perform("connect");
  assert.deepEqual(blocked.runner.calls.map((call) => call.args[0]), ["models"]);
});

test("failed previews cannot produce a configured notification", async () => {
  const f = fixture();
  f.runner.handler = (args) => args[0] === "models" ? { code: 0, messages: [{ scope: "key-visible-models", total: 1, displayed: 1, models: [{ modelId: "fixture/one", allowed: true, status: "verified", reason: "verified" }] }] } : { code: 1, messages: [{ scope: "connection-preview", plan: { conflicts: ["model: requires replacement"], files: [] } }] };
  await f.controller.perform("connect");
  assert.ok(!f.runner.calls.some((call) => call.args.includes("--apply")));
  assert.ok(f.ui.notifications.at(-1)?.includes("rejected"));
});

test("key entry is masked, explicit and stdin-only, without logging or persistence in UI state", async () => {
  const f = fixture();
  await f.controller.perform("credential");
  assert.ok(f.ui.inputs.some((input) => input.password));
  assert.equal(f.runner.calls[0].options.secret, secret);
  assert.ok(!f.runner.calls[0].args.join(" ").includes(secret));
  assert.equal(f.runner.calls[0].options.signal, undefined);
  assert.equal(f.ui.saved, undefined);
  assert.ok(!JSON.stringify([f.ui.logs, f.ui.previews, f.ui.notifications]).includes(secret));
});

test("declining key storage leaves the OS store untouched", async () => {
  const f = fixture();
  f.ui.confirmation = () => false;
  await f.controller.perform("credential");
  assert.equal(f.runner.calls.length, 0);
});

test("text testing requires a separate credit confirmation and never promotes coding support", async () => {
  const denied = fixture();
  denied.ui.confirmation = (message) => !message.includes("consume credits");
  await denied.controller.perform("test");
  assert.deepEqual(denied.runner.calls.map((call) => call.args[0]), ["models"]);
  const accepted = fixture();
  await accepted.controller.perform("test");
  assert.ok(accepted.runner.calls.at(-1)?.args.includes("--confirm-cost"));
  assert.ok(accepted.runner.calls.at(-1)?.options.signal);
  assert.ok(accepted.ui.notifications.at(-1)?.includes("have not been verified"));
});

test("local doctor has no online flag or inference, and its report remains unverified", async () => {
  const f = fixture();
  await f.controller.perform("doctor");
  assert.equal(f.runner.calls.length, 1);
  assert.equal(f.runner.calls[0].args[0], "doctor");
  assert.ok(!f.runner.calls[0].args.includes("--online"));
  assert.ok(f.ui.previews[0].includes("unverified"));
});

test("disconnect uses a recovery ID without Codex/helper and reports conflicts", async () => {
  const f = fixture();
  f.ui.saved = { node: resolve("out/node.exe"), config: resolve("out/config.toml"), recovery: resolve("out/recovery"), changeId };
  await f.controller.perform("disconnect");
  assert.equal(f.runner.calls.length, 2);
  assert.ok(f.runner.calls[1].args.includes("--apply"));
  assert.ok(!f.runner.calls[1].args.includes("--codex"));
  assert.ok(!f.runner.calls[1].args.includes("--helper"));
  assert.equal(f.runner.calls[1].options.signal, undefined);
  f.runner.handler = () => ({ code: 1, messages: [{ status: "conflict", conflicts: ["model: later edit preserved"] }] });
  await f.controller.perform("disconnect");
  assert.ok(f.ui.notifications.at(-1)?.includes("rejected"));
});

test("cancelling a selection stops the flow and unexpected errors never expose key text", async () => {
  const cancelled = fixture();
  cancelled.ui.selection = () => undefined;
  await cancelled.controller.perform("connect");
  assert.equal(cancelled.runner.calls.length, 0);
  assert.ok(cancelled.ui.notifications[0].includes("cancelled"));
  const failed = fixture();
  failed.runner.handler = () => { throw new Error(secret); };
  await failed.controller.perform("credential");
  assert.ok(!JSON.stringify([failed.ui.logs, failed.ui.notifications]).includes(secret));
});

test("a concurrent command is rejected without starting another wizard", async () => {
  const f = fixture();
  let finish!: (value: string) => void;
  f.ui.pick = async () => new Promise((done) => { finish = done; });
  const active = f.controller.perform("connect");
  await f.controller.perform("doctor");
  assert.ok(f.ui.notifications[0].includes("still running"));
  finish("ide");
  await active;
  assert.equal(f.runner.calls.length, 0);
});

test("helper staging requires explicit confirmation and cannot be cancelled during mutation", async () => {
  const denied = fixture();
  denied.ui.confirmation = () => false;
  await denied.controller.perform("helper");
  assert.equal(denied.runner.calls.length, 0);
  const accepted = fixture();
  await accepted.controller.perform("helper");
  assert.deepEqual(accepted.runner.calls[0].args.slice(0, 3), ["helper", "stage", "--destination"]);
  assert.equal(accepted.runner.calls[0].options.signal, undefined);
});

test("a recovery shortcut failure still shows the actual change ID and recovery instructions", async () => {
  const f = fixture();
  f.ui.saveRecovery = async () => { throw new Error("state unavailable"); };
  await f.controller.perform("connect");
  assert.ok(f.ui.notifications.some((message) => message.includes("shortcut could not be saved")));
  assert.ok(f.ui.previews.some((text) => text.includes(changeId) && text.includes("reverse order")));
});

test("an uncertain apply preserves its recovery ID and never reports configuration success", async () => {
  const f = fixture();
  f.runner.handler = (args) => {
    if (args[0] === "models") { return { code: 0, messages: [{ scope: "key-visible-models", total: 1, displayed: 1, models: [{ modelId: "fixture/one", allowed: true, status: "verified", reason: "verified" }] }] }; }
    if (args.includes("--apply")) { return { code: 1, messages: [{ status: "recovery-required", changeId }] }; }
    return { code: 0, messages: [{ scope: "connection-preview", plan: { files: [{ expectedRevision: "a".repeat(64) }], conflicts: [] } }] };
  };
  await f.controller.perform("connect");
  assert.equal(f.ui.saved?.changeId, changeId);
  assert.ok(f.ui.previews.some((text) => text.includes(changeId)));
  assert.ok(!f.ui.notifications.some((message) => message.startsWith("Codex CLI settings are configured")));
  assert.ok(f.ui.notifications.at(-1)?.includes("rejected"));
});
