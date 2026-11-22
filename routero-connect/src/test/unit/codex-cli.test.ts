import { strict as assert } from "node:assert";
import { test } from "node:test";
import { resolve } from "node:path";
import { mkdtemp, mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { parseCodexCommand, executeCodexCommand, bundledCatalog, isCodexCommand } from "../../cli/codex";
import type { CodexDependencies } from "../../adapters/codex/adapter";
import { CodexWorkflowError } from "../../adapters/codex/errors";
import { fixtureCatalog } from "../fixtures/codex";

const codex = resolve("out/codex.exe");
const profile = ["--profile", "fixture", "--api-root", "https://fixture.invalid"];
const paths = ["--config", resolve("out/cli-home/config.toml"), "--recovery", resolve("out/private-history"), "--codex", codex, "--helper", resolve("out/helper")];

function dependencies() {
  let lists = 0;
  let probes = 0;
  const value: CodexDependencies = { catalog: bundledCatalog(), environment: () => ({}), detect: async () => ({ client: "codex-cli", installed: true, version: "0.157.1" }), gateway: {
    listModels: async () => { lists++; return ["fixture/one"]; },
    testModel: async () => { probes++; return { completed: true, codingCompatibility: "not-tested" }; },
  } };
  return { value, counts: () => ({ lists, probes }) };
}
function output() {
  const lines: string[] = [];
  return { lines, stdout: (line: string) => lines.push(line), stderr: (line: string) => lines.push(line) };
}

test("workflow parser accepts explicit paths but rejects duplicate, secret, unsupported and missing options", () => {
  assert.equal(parseCodexCommand(["connect", ...paths, ...profile, "--model", "fixture/one"]).name, "connect");
  for (const args of [
    ["connect", ...paths, ...profile, "--model", "fixture/one", "--model", "fixture/two"],
    ["connect", ...paths, ...profile, "--model", "sk-test-never-echo-this"],
    ["connect", ...paths, ...profile, "--model", "fixture/one", "--force"],
    ["doctor", ...paths, "--online"], ["models", ...profile, "--codex", "relative.exe"],
    ["disconnect", "--config", resolve("out/config.toml"), "--recovery", resolve("out/history"), "--change-id", "bad"],
    ["connect", ...paths, ...profile, "--model", "fixture/one", "--apply", "--apply"],
    ["connect", ...paths, ...profile, "--model", "fixture/one", "--apply"],
    ["connect", ...paths, ...profile, "--model", "fixture/one", "--apply", "--expected-revision", "wrong"],
    ["models", "--codex", codex, "--profile", "fixture", "--api-root", "https://private:password@fixture.invalid"],
    ["test-model", ...profile, "--model", "bad model", "--confirm-cost"],
  ]) { assert.throws(() => parseCodexCommand(args), CodexWorkflowError); }
  assert.equal(isCodexCommand(["doctor"]), false);
  assert.equal(isCodexCommand(["doctor", "--config"]), true);
  assert.ok(parseCodexCommand(["connect", ...paths, ...profile, "--model", "fixture/one", "--apply", "--expected-revision", "a".repeat(64)]).flags.has("--apply"));
});

test("test-model requires credit consent before any gateway operation", async () => {
  const d = dependencies();
  const o = output();
  await assert.rejects(executeCodexCommand(parseCodexCommand(["test-model", ...profile, "--model", "fixture/one"]), d.value, o), (e: unknown) => e instanceof CodexWorkflowError && e.code === "cost-consent");
  assert.deepEqual(d.counts(), { lists: 0, probes: 0 });
  assert.ok(o.lines[0].includes("consume credits"));
  assert.equal(await executeCodexCommand(parseCodexCommand(["test-model", ...profile, "--model", "fixture/one", "--confirm-cost"]), d.value, o), 0);
  assert.deepEqual(d.counts(), { lists: 0, probes: 1 });
  assert.ok(o.lines.join().includes("not-tested"));
});

test("models lists visibility and blocked compatibility without probing or writing config", async () => {
  const d = dependencies();
  const o = output();
  assert.equal(await executeCodexCommand(parseCodexCommand(["models", ...profile, "--codex", codex]), d.value, o), 0);
  const result = JSON.parse(o.lines[0]);
  assert.equal(result.models[0].allowed, false);
  assert.equal(result.models[0].reason, "no-matching-evidence");
  assert.deepEqual(d.counts(), { lists: 1, probes: 0 });
});

test("disconnect confirmation needs no client, helper, credential or model access", async () => {
  const d = dependencies();
  const o = output();
  assert.equal(await executeCodexCommand(parseCodexCommand(["disconnect", "--config", resolve("out/no-client/config.toml"), "--recovery", resolve("out/history"), "--change-id", "12345678-1234-4234-8234-123456789abc"]), d.value, o), 0);
  assert.ok(o.lines[0].includes("No changes made"));
  assert.deepEqual(d.counts(), { lists: 0, probes: 0 });
});

test("CLI preview is read-only and applying a different preview revision is refused", async () => {
  const root = await mkdtemp(resolve("out/cli-preview-"));
  const home = join(root, "home");
  await mkdir(home);
  const config = join(home, "config.toml");
  const text = 'model="personal"\n';
  await writeFile(config, text);
  const d = dependencies();
  const deps: CodexDependencies = { ...d.value, catalog: fixtureCatalog(), helper: async () => ({ helperVersion: "0.0.3", helperScript: join(root, "helper.cjs"), nodeExecutable: process.execPath, sha256: "a".repeat(64) }) };
  const args = ["connect", "--config", config, "--recovery", join(root, "history"), "--codex", codex, "--helper", join(root, "helper"), ...profile, "--model", "fixture/one", "--replace-existing"];
  const o = output();
  assert.equal(await executeCodexCommand(parseCodexCommand(args), deps, o), 0);
  const preview = JSON.parse(o.lines[0]);
  assert.equal(preview.plan.conflicts.length, 0);
  assert.equal(preview.selection.modelId, "fixture/one");
  assert.ok(!preview.plan.files[0].redactedDiff.includes("personal"));
  await assert.rejects(executeCodexCommand(parseCodexCommand([...args, "--apply", "--expected-revision", "a".repeat(64)]), deps, output()));
  assert.equal(await readFile(config, "utf8"), text);
  assert.deepEqual(await readdir(root), ["home"]);
});
