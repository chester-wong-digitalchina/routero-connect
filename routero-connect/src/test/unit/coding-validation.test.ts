import { strict as assert } from "node:assert";
import { test } from "node:test";
import { join, resolve } from "node:path";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { evaluateActivation } from "../../core/compatibility";
import { evaluateCodingValidation } from "../../core/coding-validation";
import { bundledCatalog, parseCodexCommand } from "../../cli/codex";
import { CodexCliAdapter } from "../../adapters/codex/adapter";
import { CodexWorkflowError } from "../../adapters/codex/errors";
import { fixtureCatalog } from "../fixtures/codex";
import { createConnectionProfile, createCredentialReference } from "../../core/profiles";
import { fieldFingerprint, parseDocument, valueFingerprint } from "../../config/toml";

const input = { modelId: "openai/gpt-6-luna", client: "codex-cli" as const, clientVersion: "0.172.0", protocol: "responses" as const, apiRoot: "https://api-uat.routero.ai", visibleModelIds: ["openai/gpt-6-luna"], allowExperimental: true };

test("isolated opt-in accepts recorded basic coding evidence without fabricating limits or normal approval", () => {
  const catalog = bundledCatalog();
  assert.equal(evaluateActivation(catalog, input).allowed, false);
  const decision = evaluateCodingValidation(catalog, input);
  assert.equal(decision.allowed, true);
  assert.equal(decision.status, "experimental");
  assert.equal(decision.reason, "isolated-validation-opt-in");
  const row = catalog.records.find((record) => record.id === decision.recordId)!;
  assert.equal(row.contextWindow, null);
  assert.equal(row.maxOutputTokens, null);
  assert.equal(row.compaction.mode, "unknown");
});

test("validation cannot enable another model, origin, version, interface, invisible model, or arbitrary verified row", () => {
  const catalog = bundledCatalog();
  for (const patch of [{ modelId: "deepseek/deepseek-v4-flash", visibleModelIds: ["deepseek/deepseek-v4-flash"] }, { apiRoot: "https://different.invalid" }, { clientVersion: "0.157.1" }, { clientVersion: "0.172.1" }, { client: "codex-vscode" as const }, { visibleModelIds: [] }]) { assert.equal(evaluateCodingValidation(catalog, { ...input, ...patch }).allowed, false); }
  assert.equal(evaluateCodingValidation(fixtureCatalog(), { ...input, modelId: "fixture/one", apiRoot: "https://fixture.invalid", clientVersion: "0.157.1", visibleModelIds: ["fixture/one"] }).allowed, false);
  const altered = { ...catalog, records: catalog.records.map((row) => row.modelId === input.modelId ? { ...row, validation: { ...row.validation, evidence: [] } } : row) };
  assert.equal(evaluateCodingValidation(altered, input).allowed, false);
});

test("validation flags require a dedicated root, and adapter rejects a normal config target", () => {
  const base = ["models", "--codex", resolve("out/codex.exe"), "--profile", "uat", "--api-root", input.apiRoot];
  assert.throws(() => parseCodexCommand([...base, "--isolated-validation"]), CodexWorkflowError);
  assert.throws(() => parseCodexCommand([...base, "--validation-root", resolve("out/codex-plugin-validation")]), CodexWorkflowError);
  assert.throws(() => parseCodexCommand([...base, "--isolated-validation", "--validation-root", resolve("out/normal-home")]), CodexWorkflowError);
  assert.ok(parseCodexCommand([...base, "--isolated-validation", "--validation-root", resolve("out/codex-plugin-validation")]).flags.has("--isolated-validation"));
  assert.throws(() => new CodexCliAdapter({ engine: { configFile: resolve("out/normal/config.toml"), allowedConfigDirectory: resolve("out/normal"), recoveryDirectory: resolve("out/history") }, executable: resolve("out/codex.exe"), helperDirectory: resolve("out/helper"), codingValidationRoot: resolve("out/codex-plugin-validation") }, { catalog: bundledCatalog(), environment: () => ({}), gateway: { listModels: async () => [], testModel: async () => ({ completed: true, codingCompatibility: "not-tested" }) } }), (error: unknown) => error instanceof CodexWorkflowError && error.code === "validation-isolation");
});

test("validation adapter applies the manual run's provider/model settings through sealed engine plans and restores them", async () => {
  const work = await mkdtemp(resolve("out/luna-parity-"));
  const root = join(work, "codex-plugin-validation");
  const home = join(root, "codex-home");
  await mkdir(home, { recursive: true });
  const file = join(home, "config.toml");
  const initial = '# isolated fixture\n[windows]\nsandbox="elevated"\n';
  await writeFile(file, initial);
  const login = join(home, "auth.json");
  await writeFile(login, '{"fixture":"unrelated-login-marker"}');
  const options = { engine: { configFile: file, allowedConfigDirectory: home, recoveryDirectory: join(work, "private-history"), allowInRepositoryForTests: true }, executable: join(work, "codex.exe"), helperDirectory: join(work, "helper"), codingValidationRoot: root };
  const dependencies = { catalog: bundledCatalog(), environment: () => ({}), detect: async () => ({ client: "codex-cli" as const, installed: true, version: "0.172.0" }), helper: async () => ({ helperVersion: "0.0.6", helperScript: join(work, "helper", "routero-connect.cjs"), nodeExecutable: process.execPath, sha256: "a".repeat(64) }), gateway: { listModels: async () => [input.modelId], testModel: async () => ({ completed: true as const, codingCompatibility: "not-tested" as const }) } };
  const profile = createConnectionProfile({ id: "uat-test", name: "UAT test", apiRoot: input.apiRoot, credential: createCredentialReference("uat-test", input.apiRoot) });
  const connection = { profile, modelId: input.modelId, compatibility: evaluateActivation(dependencies.catalog, input) };
  const adapter = new CodexCliAdapter(options, dependencies);
  const plan = await adapter.plan(connection);
  assert.ok(plan.restartInstructions.some((text) => text.includes("Isolated experimental")));
  const applied = await adapter.apply(plan);
  assert.equal(applied.status, "applied");
  const parsed = await parseDocument(await readFile(file, "utf8"));
  for (const [path, value] of [[ ["model"], input.modelId ], [["model_provider"], "routero"], [["model_providers", "routero", "base_url"], input.apiRoot + "/v1"], [["model_providers", "routero", "wire_api"], "responses"], [["model_providers", "routero", "supports_websockets"], false], [["model_providers", "routero", "request_max_retries"], 0], [["model_providers", "routero", "stream_max_retries"], 0]] as const) { assert.equal(fieldFingerprint(parsed, path), valueFingerprint(value)); }
  assert.equal(fieldFingerprint(parsed, ["model_providers", "routero", "env_key"]), undefined);
  assert.equal(fieldFingerprint(parsed, ["model_context_window"]), undefined);
  assert.equal((await adapter.apply(await adapter.plan(connection))).status, "unchanged");
  const ordinary = new CodexCliAdapter({ ...options, codingValidationRoot: undefined }, dependencies);
  await assert.rejects(ordinary.plan(connection), (error: unknown) => error instanceof CodexWorkflowError && error.code === "compatibility-blocked");
  assert.equal((await new CodexCliAdapter(options, dependencies).rollback(applied.changeId!)).status, "restored");
  assert.equal((await parseDocument(await readFile(file, "utf8"))).fields.has('["model"]'), false);
  assert.equal(await readFile(login, "utf8"), '{"fixture":"unrelated-login-marker"}');
});
