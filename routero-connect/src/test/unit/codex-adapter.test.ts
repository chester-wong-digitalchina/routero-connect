import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { CodexCliAdapter, type CodexDependencies, type CodexAdapterOptions } from "../../adapters/codex/adapter";
import { CodexWorkflowError } from "../../adapters/codex/errors";
import { createConnectionProfile, createCredentialReference } from "../../core/profiles";
import { fixtureCatalog } from "../fixtures/codex";
import { bundledCatalog } from "../../cli/codex";
import { parseDocument, fieldFingerprint, valueFingerprint } from "../../config/toml";
import { inspectHelper, assertCleanEnvironment } from "../../adapters/codex/runtime";
import { stageHelper } from "../../credentials/stage-helper";


const profile = createConnectionProfile({ id: "fixture", name: "Fixture", apiRoot: "https://fixture.invalid", credential: createCredentialReference("fixture", "https://fixture.invalid") });
const input = (modelId = "fixture/one") => ({ profile, modelId, compatibility: { allowed: true, status: "verified" as const, reason: "verified" as const } });
const original = '# retain\nmodel="personal"\nmodel_provider="personal"\n[windows]\nsandbox="elevated"\n[mcp_servers.docs]\nurl="https://docs.invalid"\n';
async function fixture(text = original) {
  const root = await mkdtemp(resolve("out/adapter-fixture-"));
  const home = join(root, "isolated home");
  await mkdir(home);
  const file = join(home, "config.toml");
  await writeFile(file, text);
  const options: CodexAdapterOptions = { engine: { configFile: file, allowedConfigDirectory: home, recoveryDirectory: join(root, "history"), allowInRepositoryForTests: true }, executable: join(root, "codex.exe"), helperDirectory: join(root, "helper"), replaceExisting: true };
  let visible = ["fixture/one", "fixture/two"];
  let env: NodeJS.ProcessEnv = {};
  let hash = "a".repeat(64);
  let listCalls = 0;
  const dependencies: CodexDependencies = { catalog: fixtureCatalog(), environment: () => env,
    gateway: { listModels: async () => { listCalls++; return visible; }, testModel: async () => ({ completed: true, codingCompatibility: "not-tested" }) },
    detect: async () => ({ client: "codex-cli", installed: true, version: "0.157.1", executablePath: options.executable }),
    helper: async () => ({ helperVersion: "0.0.3", helperScript: join(root, "helper with spaces", "routero-connect.cjs"), nodeExecutable: process.execPath, sha256: hash }),
  };
  return { root, home, file, options, dependencies, adapter: new CodexCliAdapter(options, dependencies), setVisible: (value: string[]) => { visible = value; }, setEnv: (value: NodeJS.ProcessEnv) => { env = value; }, setHash: (value: string) => { hash = value; }, calls: () => listCalls };
}

test("production catalog blocks forged approval before reading credentials or changing files", async () => {
  const f = await fixture();
  const adapter = new CodexCliAdapter(f.options, { ...f.dependencies, catalog: bundledCatalog() });
  await assert.rejects(adapter.plan(input()), (e: unknown) => e instanceof CodexWorkflowError && e.code === "compatibility-blocked");
  assert.equal(f.calls(), 0);
  assert.equal(await readFile(f.file, "utf8"), original);
  assert.deepEqual(await readdir(f.root), ["isolated home"]);
});

test("adapter connect, idempotency, model switching, and durable reverse-order disconnect", async () => {
  const f = await fixture();
  const plan = await f.adapter.plan(input());
  assert.ok(!JSON.stringify(plan).includes("fixture/one"));
  assert.equal(await readFile(f.file, "utf8"), original);
  const first = await f.adapter.apply(plan);
  assert.equal(first.status, "applied");
  assert.ok(first.changeId);
  const document = await parseDocument(await readFile(f.file, "utf8"));
  for (const [path, value] of [[ ["model"], "fixture/one" ], [["model_providers", "routero", "wire_api"], "responses"], [["model_providers", "routero", "supports_websockets"], false], [["model_providers", "routero", "request_max_retries"], 0]] as const) { assert.equal(fieldFingerprint(document, path), valueFingerprint(value)); }
  assert.ok(document.text.includes('[windows]\nsandbox="elevated"'));
  const authArgs = document.fields.get(JSON.stringify(["model_providers", "routero", "auth", "args"]))!.node.value;
  assert.equal(authArgs.type, "TOMLArray");
  assert.equal((await f.adapter.apply(await f.adapter.plan(input()))).status, "unchanged");
  const second = await f.adapter.apply(await f.adapter.plan(input("fixture/two")));
  assert.equal(second.status, "applied");
  const fresh = new CodexCliAdapter(f.options, { ...f.dependencies, detect: async () => { throw new Error("client removed"); }, helper: async () => { throw new Error("helper removed"); } });
  assert.equal((await fresh.rollback(second.changeId!)).status, "restored");
  assert.equal(fieldFingerprint(await parseDocument(await readFile(f.file, "utf8")), ["model"]), valueFingerprint("fixture/one"));
  assert.equal((await fresh.rollback(first.changeId!)).status, "restored");
  assert.equal(fieldFingerprint(await parseDocument(await readFile(f.file, "utf8")), ["model"]), valueFingerprint("personal"));
});

test("apply checks current permissions, helper, environment and single-use identity", async () => {
  for (const change of ["permissions", "helper", "environment"]) {
    const f = await fixture();
    const plan = await f.adapter.plan(input());
    if (change === "permissions") { f.setVisible([]); }
    if (change === "helper") { f.setHash("b".repeat(64)); }
    if (change === "environment") { f.setEnv({ OPENAI_API_KEY: "private-secret" }); }
    const result = await f.adapter.apply(plan);
    assert.equal(result.status, "failed");
    assert.ok(!JSON.stringify(result).includes("private-secret"));
    assert.equal((await f.adapter.apply(plan)).status, "failed");
    assert.equal(await readFile(f.file, "utf8"), original);
  }
});

test("unknown clients and invisible models are refused", async () => {
  const f = await fixture();
  f.setVisible([]);
  await assert.rejects(f.adapter.plan(input()), CodexWorkflowError);
  const adapter = new CodexCliAdapter(f.options, { ...f.dependencies, detect: async () => ({ client: "codex-cli", installed: true, version: "0.158.0" }) });
  await assert.rejects(adapter.plan(input()), (e: unknown) => e instanceof CodexWorkflowError && e.code === "client-version");
});

test("unsupported authentication/profile/feature overrides are preserved and refused", async () => {
  for (const text of ['[profiles.personal]\nmodel="x"\n', '[model_providers.routero]\nexperimental_bearer_token="sk-test-never-print-this"\n', '[model_providers.routero.auth]\nunrecognized="x"\n', '[features]\n', 'model_context_window=999\n']) {
    const f = await fixture(text);
    await assert.rejects(f.adapter.plan(input()), (e: unknown) => e instanceof CodexWorkflowError && e.code === "configuration-conflict" && !e.message.includes("sk-test"));
    assert.equal(await readFile(f.file, "utf8"), text);
  }
});

test("replacement consent is required and concurrent config edits survive apply", async () => {
  const f = await fixture();
  const strict = new CodexCliAdapter({ ...f.options, replaceExisting: false }, f.dependencies);
  const blocked = await strict.plan(input());
  assert.ok(blocked.conflicts.length > 0);
  assert.equal((await strict.apply(blocked)).status, "conflict");
  const plan = await f.adapter.plan(input());
  await writeFile(f.file, original + "# later\n");
  assert.equal((await f.adapter.apply(plan)).status, "conflict");
  assert.equal(await readFile(f.file, "utf8"), original + "# later\n");
});

test("configuration changes during prerequisite inspection cannot enter an approved plan", async () => {
  const f = await fixture();
  const adapter = new CodexCliAdapter(f.options, { ...f.dependencies, helper: async (path) => {
    await writeFile(f.file, original + '[profiles.later]\nmodel="x"\n');
    return f.dependencies.helper!(path);
  } });
  await assert.rejects(adapter.plan(input()));
  assert.ok((await readFile(f.file, "utf8")).includes("profiles.later"));
});

test("doctor isolates failed checks and never lists models or runs inference", async () => {
  const f = await fixture('model="unterminated');
  const adapter = new CodexCliAdapter(f.options, { ...f.dependencies, helper: async () => { throw new Error("sk-test-raw-error-secret"); } });
  const diagnostics = await adapter.diagnose();
  assert.ok(diagnostics.some((d) => d.code === "invalid-toml"));
  assert.ok(diagnostics.some((d) => d.code === "client-ready"));
  assert.ok(!JSON.stringify(diagnostics).includes("sk-test"));
  assert.equal(f.calls(), 0);
});

test("environment conflicts check names case-insensitively without printing values", () => {
  for (const key of ["OPENAI_API_KEY", "openai_base_url", "CODEX_HOME", "NODE_OPTIONS"]) { assert.throws(() => assertCleanEnvironment({ [key]: "private" }), CodexWorkflowError); }
  assert.doesNotThrow(() => assertCleanEnvironment({ PATH: "normal", OPENAI_API_KEY: "" }));
});

test("helper inspection verifies private manifest, pin, absolute runtime and script hash", async () => {
  const root = await mkdtemp(resolve("out/helper-inspection-"));
  const source = join(root, "source.cjs");
  await writeFile(source, '// synthetic helper; never executed\n');
  const target = join(root, "helper spaces");
  const staged = await stageHelper(source, target);
  assert.deepEqual(await inspectHelper(target), staged);
  await writeFile(staged.helperScript, '// tampered\n');
  await assert.rejects(inspectHelper(target), (e: unknown) => e instanceof CodexWorkflowError && e.code === "helper-unavailable");
});
