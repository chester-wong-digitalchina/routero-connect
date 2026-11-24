import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { NodeCliRunner, parseCliMessages, runnerEnvironment, ignoredRunnerOverrides, UiError } from "../../ui/cli-runner";
import { COST_NOTICE } from "../../cli/codex";

test("CLI framing parses separate pretty JSON messages and known status lines", () => {
  const first = { scope: "preview", text: 'literal { brace } and \\"quotes"', diff: "masked ".repeat(1000) };
  const result = parseCliMessages(JSON.stringify(first, null, 2) + '\n{"status":"applied"}\n');
  assert.equal(result.length, 2);
  assert.equal(result[0].text, first.text);
  assert.equal(result[0].diff, first.diff);
  assert.equal(parseCliMessages(COST_NOTICE + '\n{"completed":true}\n').length, 1);
  assert.deepEqual(parseCliMessages("Credential stored.\n"), []);
});

test("raw/token/malformed output is rejected and recognized output is redacted", () => {
  for (const value of ['sk-test-never-display-this\n', '{"status":', 'warning: private text\n', '[]']) { assert.throws(() => parseCliMessages(value), UiError); }
  const value = parseCliMessages('{"message":"private-dummy sk-test-dummy-secret"}', "private-dummy");
  assert.ok(!JSON.stringify(value).includes("private-dummy"));
  assert.ok(!JSON.stringify(value).includes("sk-test"));
});

test("GUI child environment excludes Electron, shell injection, global provider keys and profiles", () => {
  assert.deepEqual(runnerEnvironment({ SystemRoot: "C:\\Windows", PATH: "private", NODE_OPTIONS: "private", NODE_PATH: "private", ELECTRON_RUN_AS_NODE: "1", OPENAI_API_KEY: "private", CODEX_HOME: "private" }), { SystemRoot: "C:\\Windows" });
});

test("ignored environment diagnostics include only canonical names, never values or unknown keys", () => {
  const result = ignoredRunnerOverrides({ openai_api_key: "private-value", CODEX_HOME: "private-home", NODE_OPTIONS: "private-code", arbitrary_private_key: "private-value", CODEX_PROFILE: "" });
  assert.deepEqual(result, ["CODEX_HOME", "NODE_OPTIONS", "OPENAI_API_KEY"]);
  assert.ok(!JSON.stringify(result).includes("private"));
});

test("UI runner forbids token printing, key arguments, and cancellation of mutations before spawning", async () => {
  const runner = new NodeCliRunner(resolve("out/does-not-exist.cjs"), () => ({}));
  for (const [args, options] of [
    [["credential", "print"], {}], [["credential", "delete"], {}], [["connect", "--model", "sk-test-private"], {}],
    [["disconnect", "--apply"], { signal: new AbortController().signal }], [["models"], { secret: "sk-test-private" }],
  ] as const) { await assert.rejects(runner.run(resolve("out/node.exe"), args, options), UiError); }
});

test("explicit Node runner transfers a dummy secret over stdin and sanitizes the child reply", async () => {
  const root = await mkdtemp(resolve("out/gui-node-"));
  const bundle = join(root, "cli spaces.cjs");
  await writeFile(bundle, 'let input="";process.stdin.on("data",c=>input+=c);process.stdin.on("end",()=>{console.log(JSON.stringify({status:"stored",payload:input.trim(),args:process.argv.slice(2)}))});');
  const runner = new NodeCliRunner(bundle, () => ({ SystemRoot: process.env.SystemRoot }));
  const secret = "sk-test-private-ui-pipe-dummy";
  const reply = await runner.run(process.execPath, ["credential", "store", "--profile", "fixture"], { secret });
  assert.equal(reply.code, 0);
  assert.ok(!JSON.stringify(reply).includes(secret));
  assert.deepEqual(reply.messages[0].args, ["credential", "store", "--profile", "fixture"]);
});

test("host overrides do not block model listing and never reach the managed child", async () => {
  const root = await mkdtemp(resolve("out/gui-environment-"));
  const bundle = join(root, "cli.cjs");
  await writeFile(bundle, 'console.log(JSON.stringify({scope:"child-environment",names:Object.keys(process.env).map(k=>k.toUpperCase()).sort(),args:process.argv.slice(2)}));');
  const source = { SystemRoot: process.env.SystemRoot, CODEX_HOME: "private-existing-home", OPENAI_API_KEY: "sk-test-parent-only-never-forward", NODE_OPTIONS: "--require C:/nonexistent-private-module.cjs", NODE_PATH: "private-modules", ELECTRON_RUN_AS_NODE: "1" };
  const before = { ...source };
  const runner = new NodeCliRunner(bundle, () => source);
  const reply = await runner.run(process.execPath, ["models", "--profile", "fixture"]);
  assert.equal(reply.code, 0);
  const child = reply.messages.find((message) => message.scope === "child-environment")!;
  assert.deepEqual(child.args, ["models", "--profile", "fixture"]);
  for (const name of ["CODEX_HOME", "OPENAI_API_KEY", "NODE_OPTIONS", "NODE_PATH", "ELECTRON_RUN_AS_NODE"]) { assert.ok(!(child.names as string[]).includes(name)); }
  assert.deepEqual(source, before);
  const diagnostic = reply.messages.find((message) => message.scope === "managed-cli-environment")!;
  assert.ok((diagnostic.ignoredVariables as string[]).includes("CODEX_HOME"));
  for (const value of [source.CODEX_HOME, source.OPENAI_API_KEY, source.NODE_OPTIONS, source.NODE_PATH]) { assert.ok(!JSON.stringify(reply).includes(value)); }
});
