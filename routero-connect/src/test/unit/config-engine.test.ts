import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, readFile, writeFile, readdir, link, symlink, utimes } from "node:fs/promises";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { CodexConfigEngine } from "../../config/engine";
import { ConfigError } from "../../config/errors";
import { checkPrivate } from "../../config/permissions";
import { fieldFingerprint, parseDocument, valueFingerprint } from "../../config/toml";
import type { AtomicWriteHooks } from "../../config/files";
import { MAX_CONFIG_BYTES } from "../../config/files";

const existing = '# user preface\nmodel="personal-model" # preserve note\nmodel_provider="personal"\n[windows]\nsandbox="elevated"\n[mcp_servers.docs]\nurl="https://docs.example/mcp"\napi_key="sk-test-existing-external-key"\n[model_providers.personal]\nname="Personal"\nbase_url="https://personal.example/v1"\n';
const changes = [
  { path: ["model"], value: "example/model", replaceExisting: true },
  { path: ["model_provider"], value: "routero", replaceExisting: true },
  { path: ["model_providers", "routero", "name"], value: "Routero" },
  { path: ["model_providers", "routero", "base_url"], value: "https://api.example/v1" },
  { path: ["model_providers", "routero", "wire_api"], value: "responses" },
];

async function fixture(text?: string, hooks?: AtomicWriteHooks) {
  const root = await mkdtemp(resolve("out/config-fixture-"));
  const directory = join(root, "用户 settings with spaces");
  await mkdir(directory);
  const file = join(directory, "config.toml");
  const history = join(root, "private recovery");
  if (text !== undefined) { await writeFile(file, text); }
  const engine = new CodexConfigEngine({ configFile: file, allowedConfigDirectory: directory, recoveryDirectory: history, allowInRepositoryForTests: true, writeHooks: hooks });
  return { root, directory, file, history, engine };
}

test("preview is read-only and excludes every original/new value", async () => {
  const f = await fixture(existing);
  const plan = await f.engine.plan(changes);
  const encoded = JSON.stringify(plan);
  for (const value of ["sk-test-existing-external-key", "personal-model", "example/model", "https://personal.example"]) { assert.ok(!encoded.includes(value)); }
  assert.ok(encoded.includes("[REDACTED VALUE]"));
  assert.deepEqual(await readdir(f.root), ["用户 settings with spaces"]);
  assert.equal(await readFile(f.file, "utf8"), existing);
});

test("apply is idempotent, preserves other settings, and rollback restores only managed fields", async () => {
  const f = await fixture(existing);
  const applied = await f.engine.apply(await f.engine.plan(changes));
  assert.equal(applied.status, "applied");
  assert.ok(applied.changeId);
  const content = await readFile(f.file, "utf8");
  assert.ok(content.includes(existing.slice(existing.indexOf("[windows]"))));
  assert.ok(content.includes("# preserve note"));
  assert.equal(fieldFingerprint(await parseDocument(content), ["model"]), valueFingerprint("example/model"));
  assert.equal((await f.engine.apply(await f.engine.plan(changes))).status, "unchanged");
  assert.equal((await readdir(f.history)).filter((name) => !name.startsWith(".")).length, 1);
  // Recovery is durable, not tied to the engine that held the in-memory plan.
  const restarted = new CodexConfigEngine({ configFile: f.file, allowedConfigDirectory: f.directory, recoveryDirectory: f.history, allowInRepositoryForTests: true });
  const restored = await restarted.rollback(applied.changeId!);
  assert.equal(restored.status, "restored");
  const final = await parseDocument(await readFile(f.file, "utf8"));
  assert.equal(fieldFingerprint(final, ["model"]), valueFingerprint("personal-model"));
  assert.equal(fieldFingerprint(final, ["model_provider"]), valueFingerprint("personal"));
  assert.equal(final.tables.has(JSON.stringify(["model_providers", "routero"])), false);
  assert.ok(final.text.includes(existing.slice(existing.indexOf("[windows]"))));
  assert.equal((await restarted.rollback(applied.changeId!)).status, "restored");
});

test("missing config becomes valid TOML and rollback conservatively retains an empty file", async () => {
  const f = await fixture();
  const result = await f.engine.apply(await f.engine.plan(changes));
  assert.equal(result.status, "applied");
  assert.equal((await f.engine.rollback(result.changeId!)).status, "restored");
  assert.equal((await parseDocument(await readFile(f.file, "utf8"))).fields.size, 0);
});

test("existing values require explicit replacement and plans cannot be forged/reused", async () => {
  const f = await fixture(existing);
  const conflicted = await f.engine.plan([{ path: ["model"], value: "new" }]);
  assert.equal(conflicted.conflicts.length, 1);
  assert.equal((await f.engine.apply(conflicted)).status, "conflict");
  const plan = await f.engine.plan(changes);
  assert.equal((await f.engine.apply(JSON.parse(JSON.stringify(plan)))).status, "failed");
  assert.equal((await f.engine.apply(plan)).status, "applied");
  assert.equal((await f.engine.apply(plan)).status, "failed");
});

test("changes between preview and apply are preserved as a conflict", async () => {
  const f = await fixture(existing);
  const plan = await f.engine.plan(changes);
  await writeFile(f.file, existing + "\n# later edit\n");
  assert.equal((await f.engine.apply(plan)).status, "conflict");
  assert.equal(await readFile(f.file, "utf8"), existing + "\n# later edit\n");
});

test("observable metadata changes also invalidate a preview", async () => {
  const f = await fixture(existing);
  const plan = await f.engine.plan(changes);
  await utimes(f.file, new Date(), new Date("2000-01-01T00:00:00Z"));
  assert.equal((await f.engine.apply(plan)).status, "conflict");
  assert.equal(await readFile(f.file, "utf8"), existing);
});

test("last-moment concurrent edits abort replacement and remove its temporary file", async () => {
  const f = await fixture(existing, { beforeReplace: async () => { await writeFile(f.file, existing + "\n# concurrent edit\n"); } });
  const result = await f.engine.apply(await f.engine.plan(changes));
  assert.equal(result.status, "conflict");
  assert.ok((await readFile(f.file, "utf8")).endsWith("# concurrent edit\n"));
  assert.deepEqual(await readdir(f.directory), ["config.toml"]);
});

test("write failure retains recovery information without replacing the original", async () => {
  const f = await fixture(existing, { beforeReplace: async () => { throw new Error("private process detail"); } });
  const result = await f.engine.apply(await f.engine.plan(changes));
  assert.equal(result.status, "recovery-required");
  assert.equal(await readFile(f.file, "utf8"), existing);
  assert.ok(!JSON.stringify(result).includes("private process detail"));
  assert.ok(result.changeId);
});

test("post-replacement interference never triggers a blind backup restore", async () => {
  const f = await fixture(existing, { afterReplace: async () => { await writeFile(f.file, 'model="later-user-value"\n# user data after commit\n'); } });
  const result = await f.engine.apply(await f.engine.plan(changes));
  assert.equal(result.status, "recovery-required");
  assert.ok((await readFile(f.file, "utf8")).includes("later-user-value"));
});

test("three-way rollback preserves changed managed values and later unrelated settings", async () => {
  const f = await fixture(existing);
  const applied = await f.engine.apply(await f.engine.plan(changes));
  assert.equal(applied.status, "applied");
  const current = (await readFile(f.file, "utf8")).replace('model="example/model"', 'model="user-choice"') + '\n[user_added]\nvalue="later"\n';
  await writeFile(f.file, current);
  const result = await f.engine.rollback(applied.changeId!);
  assert.equal(result.status, "conflict");
  assert.ok(result.conflicts.some((item) => item.startsWith("model:")));
  const text = await readFile(f.file, "utf8");
  assert.ok(text.includes('model="user-choice"'));
  assert.ok(text.includes('[user_added]\nvalue="later"'));
  assert.equal(fieldFingerprint(await parseDocument(text), ["model_provider"]), valueFingerprint("personal"));
  await writeFile(f.file, text.replace('model="user-choice"', 'model="example/model"'));
  assert.equal((await f.engine.rollback(applied.changeId!)).status, "restored");
});

test("backups are private, manifests contain no values, and tampering blocks rollback", async () => {
  const f = await fixture(existing);
  const applied = await f.engine.apply(await f.engine.plan(changes));
  const directory = join(f.history, applied.changeId!);
  await checkPrivate(f.history);
  await checkPrivate(directory);
  for (const file of ["before.toml", "applied.toml", "manifest.json"]) { await checkPrivate(join(directory, file)); }
  assert.equal(await readFile(join(directory, "before.toml"), "utf8"), existing);
  const manifest = await readFile(join(directory, "manifest.json"), "utf8");
  assert.ok(!manifest.includes("sk-test-existing-external-key"));
  assert.ok(!manifest.includes("example/model"));
  await writeFile(join(directory, "before.toml"), "# tampered\n");
  const before = await readFile(f.file, "utf8");
  assert.equal((await f.engine.rollback(applied.changeId!)).status, "failed");
  assert.equal(await readFile(f.file, "utf8"), before);
});

test("malformed files, unsafe paths, and stale locks fail without mutation", async () => {
  const bad = await fixture('[windows]\n[windows]\n');
  await assert.rejects(bad.engine.plan(changes), ConfigError);
  assert.equal(await readFile(bad.file, "utf8"), '[windows]\n[windows]\n');
  const f = await fixture(existing);
  await writeFile(join(f.directory, ".routero-connect.lock"), "existing lock");
  assert.equal((await f.engine.apply(await f.engine.plan(changes))).status, "conflict");
  assert.equal(await readFile(join(f.directory, ".routero-connect.lock"), "utf8"), "existing lock");
  const linked = await fixture(existing);
  await link(linked.file, join(linked.directory, "other.toml"));
  await assert.rejects(linked.engine.plan(changes), ConfigError);
  assert.throws(() => new CodexConfigEngine({ configFile: join(f.directory, "auth.json"), allowedConfigDirectory: f.directory, recoveryDirectory: f.history }), ConfigError);
});

test("unmarked recovery directories are not claimed and repository recovery needs explicit fixture mode", async () => {
  const f = await fixture(existing);
  await mkdir(f.history);
  await writeFile(join(f.history, "unrelated.txt"), "keep");
  const result = await f.engine.apply(await f.engine.plan(changes));
  assert.equal(result.status, "failed");
  assert.equal(await readFile(f.file, "utf8"), existing);
  assert.equal(await readFile(join(f.history, "unrelated.txt"), "utf8"), "keep");
  const other = await fixture(existing);
  const production = new CodexConfigEngine({ configFile: other.file, allowedConfigDirectory: other.directory, recoveryDirectory: other.history });
  assert.equal((await production.apply(await production.plan(changes))).status, "failed");
});

test("format-only changes within managed arrays are preserved as rollback conflicts", async () => {
  const f = await fixture();
  const args = ["credential", "print", "--profile", "uat"];
  const result = await f.engine.apply(await f.engine.plan([{ path: ["model_providers", "routero", "auth", "args"], value: args }]));
  assert.equal(result.status, "applied");
  const text = (await readFile(f.file, "utf8")).replace('["credential", "print", "--profile", "uat"]', '[\n"credential", # user note\n"print", "--profile", "uat"\n]');
  await writeFile(f.file, text);
  const rollback = await f.engine.rollback(result.changeId!);
  assert.equal(rollback.status, "conflict");
  assert.ok((await readFile(f.file, "utf8")).includes("# user note"));
});

test("a plan cannot grow the configuration past the recovery size bound", async () => {
  const f = await fixture("#" + "x".repeat(MAX_CONFIG_BYTES - 4) + "\n");
  await assert.rejects(f.engine.plan([{ path: ["model"], value: "a".repeat(100) }]), ConfigError);
  assert.deepEqual(await readdir(f.root), ["用户 settings with spaces"]);
});

test("new user settings in an owned provider table preserve dependent managed fields", async () => {
  const f = await fixture(existing);
  const applied = await f.engine.apply(await f.engine.plan(changes));
  const content = await readFile(f.file, "utf8");
  await writeFile(f.file, content + 'user_option="keep this"\n');
  const result = await f.engine.rollback(applied.changeId!);
  assert.equal(result.status, "conflict");
  const document = await parseDocument(await readFile(f.file, "utf8"));
  assert.equal(fieldFingerprint(document, ["model_providers", "routero", "name"]), valueFingerprint("Routero"));
  assert.equal(fieldFingerprint(document, ["model_providers", "routero", "user_option"]), valueFingerprint("keep this"));
  assert.equal(fieldFingerprint(document, ["model_provider"]), valueFingerprint("personal"));
});

test("an existing empty file is distinguished from a missing file", async () => {
  const f = await fixture("");
  const result = await f.engine.apply(await f.engine.plan([{ path: ["model"], value: "fixture/model" }]));
  assert.equal(result.status, "applied");
  const manifest = JSON.parse(await readFile(join(f.history, result.changeId!, "manifest.json"), "utf8")) as { beforeExists: boolean };
  assert.equal(manifest.beforeExists, true);
  assert.equal((await f.engine.rollback(result.changeId!)).status, "restored");
});

test("linked config directories and invalid UTF-8 are refused before writes", async () => {
  const f = await fixture(existing);
  const linked = join(f.root, "linked settings");
  await symlink(f.directory, linked, process.platform === "win32" ? "junction" : "dir");
  const engine = new CodexConfigEngine({ configFile: join(linked, "config.toml"), allowedConfigDirectory: linked, recoveryDirectory: f.history, allowInRepositoryForTests: true });
  await assert.rejects(engine.plan(changes), ConfigError);
  assert.equal(await readFile(f.file, "utf8"), existing);
  await writeFile(f.file, Buffer.from([0xff, 0xfe, 0x61]));
  await assert.rejects(f.engine.plan(changes), (error: unknown) => error instanceof ConfigError && error.code === "invalid-toml");
});
