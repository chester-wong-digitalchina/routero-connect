import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createConnectionProfile, createCredentialReference } from "../../core/profiles";
import { CredentialError } from "../../credentials/errors";
import { CredentialService, credentialTarget, type CredentialBackend } from "../../credentials/service";
import { WindowsCredentialBackend } from "../../credentials/windows-backend";
import { assertCredentialRuntime } from "../../credentials/runtime";

const TOKEN = "sk-test-not-a-real-key-first";
const REPLACEMENT = "sk-test-not-a-real-key-second";

function profile(id = "first", origin = "https://test.example", reference = "shared") {
  return createConnectionProfile({ id, name: id, apiRoot: origin, credential: createCredentialReference(reference, origin) });
}

class MemoryBackend implements CredentialBackend {
  readonly values = new Map<string, string>();
  conflict = false;
  async read(target: string): Promise<string | undefined> { return this.values.get(target); }
  async compareExchange(target: string, expected: string | undefined, next: string | undefined): Promise<boolean> {
    if (this.conflict || this.values.get(target) !== expected) { return false; }
    if (next === undefined) { this.values.delete(target); } else { this.values.set(target, next); }
    return true;
  }
}

function code(expected: CredentialError["code"]) {
  return (error: unknown) => error instanceof CredentialError && error.code === expected;
}

test("credential create/read/explicit replace/delete lifecycle", async () => {
  const backend = new MemoryBackend();
  const service = new CredentialService(backend);
  const p = profile();
  await assert.rejects(service.read(p), code("missing"));
  await service.store(p, TOKEN);
  assert.equal(await service.read(p), TOKEN);
  await assert.rejects(service.store(p, REPLACEMENT), code("already-exists"));
  await service.store(p, REPLACEMENT, true);
  assert.equal(await service.read(p), REPLACEMENT);
  assert.equal(await service.remove(p), "deleted");
  assert.equal(backend.values.size, 0);
});

test("different origins/references cannot reuse a stored key", async () => {
  const backend = new MemoryBackend();
  const service = new CredentialService(backend);
  await service.store(profile(), TOKEN);
  for (const other of [profile("first", "https://different.example"), profile("first", "https://test.example", "different")]) {
    assert.notEqual(credentialTarget(other), credentialTarget(profile()));
    await assert.rejects(service.read(other), code("missing"));
  }
});

test("only owned profiles can read, replace, link, or delete", async () => {
  const backend = new MemoryBackend();
  const service = new CredentialService(backend);
  await service.store(profile(), TOKEN);
  const other = profile("other");
  await assert.rejects(service.read(other), code("not-owner"));
  await assert.rejects(service.store(other, REPLACEMENT, true), code("not-owner"));
  await assert.rejects(service.remove(other), code("not-owner"));
  await assert.rejects(service.link(other, profile("third")), code("not-owner"));
  assert.equal(await service.read(profile()), TOKEN);
});

test("shared references survive detachment and cannot be replaced silently", async () => {
  const service = new CredentialService(new MemoryBackend());
  const first = profile();
  const second = profile("second");
  await service.store(first, TOKEN);
  await service.link(first, second);
  await service.link(first, second); // Idempotent ownership attachment.
  await assert.rejects(service.store(first, REPLACEMENT, true), code("shared-credential"));
  assert.equal(await service.remove(first), "retained");
  await assert.rejects(service.read(first), code("not-owner"));
  assert.equal(await service.read(second), TOKEN);
  assert.equal(await service.remove(second), "deleted");
});

test("cross-origin links and replacement of missing entries are refused", async () => {
  const service = new CredentialService(new MemoryBackend());
  await assert.rejects(service.link(profile(), profile("second", "https://other.example")), code("invalid-arguments"));
  await assert.rejects(service.store(profile(), TOKEN, true), code("missing"));
});

test("concurrent mutations fail without losing another owner's state", async () => {
  const backend = new MemoryBackend();
  const service = new CredentialService(backend);
  await service.store(profile(), TOKEN);
  backend.conflict = true;
  await assert.rejects(service.store(profile(), REPLACEMENT, true), code("conflict"));
  await assert.rejects(service.link(profile(), profile("second")), code("conflict"));
  await assert.rejects(service.remove(profile()), code("conflict"));
  assert.equal(await service.read(profile()), TOKEN);
});

test("malformed and foreign metadata is preserved, never overwritten", async () => {
  const backend = new MemoryBackend();
  const service = new CredentialService(backend);
  const target = credentialTarget(profile());
  for (const raw of ["not-json", JSON.stringify({ application: "other-tool", token: TOKEN }), JSON.stringify({ schemaVersion: 1, application: "routero-connect", origin: "https://other.example", referenceId: "shared", owners: ["first"], token: TOKEN })]) {
    backend.values.set(target, raw);
    await assert.rejects(service.store(profile(), REPLACEMENT, true), code("invalid-entry"));
    await assert.rejects(service.remove(profile()), code("invalid-entry"));
    assert.equal(backend.values.get(target), raw);
  }
});

test("invalid secrets are rejected before backend writes", async () => {
  const backend = new MemoryBackend();
  const service = new CredentialService(backend);
  for (const token of ["", "not-a-routero-key", TOKEN + "\n", TOKEN + " other", "sk-" + "x".repeat(1021)]) {
    await assert.rejects(service.store(profile(), token), code("invalid-secret"));
  }
  assert.equal(backend.values.size, 0);
});

test("native backend accepts only recognized responses and fixed errors", async () => {
  for (const value of [null, "secret", { ok: true, found: true, payload: 42 }, { ok: false, code: TOKEN }]) {
    const backend = new WindowsCredentialBackend(async () => value);
    await assert.rejects(backend.read("unused"), code("store-unavailable"));
  }
  const foreign = new WindowsCredentialBackend(async () => ({ ok: false, code: "foreign-entry" }));
  await assert.rejects(foreign.read("unused"), code("foreign-entry"));
  const failed = new WindowsCredentialBackend(async () => { throw new Error(TOKEN); });
  await assert.rejects(failed.read("unused"), (error: unknown) => {
    assert.ok(error instanceof CredentialError);
    assert.ok(!error.message.includes(TOKEN));
    return true;
  });
});

test("backend distinguishes missing, timeout, and atomic exchange conflicts", async () => {
  const missing = new WindowsCredentialBackend(async () => ({ ok: true, found: false, payload: null }));
  assert.equal(await missing.read("unused"), undefined);
  const timeout = new WindowsCredentialBackend(async () => ({ ok: false, code: "timeout" }));
  await assert.rejects(timeout.read("unused"), code("timeout"));
  let request: unknown;
  const backend = new WindowsCredentialBackend(async (value) => { request = value; return { ok: true, exchanged: false }; });
  assert.equal(await backend.compareExchange("target", undefined, "private-payload"), false);
  assert.deepEqual(request, { action: "compare-exchange", target: "target", expected: null, next: "private-payload" });
});

test("credential runtime is checked before prompting or store access", () => {
  assert.doesNotThrow(() => assertCredentialRuntime("win32", "24.18.0"));
  assert.doesNotThrow(() => assertCredentialRuntime("win32", "24.20.1"));
  assert.throws(() => assertCredentialRuntime("linux", "24.18.0"), code("unsupported-platform"));
  for (const version of ["22.20.0", "24.17.9", "25.0.0", "24.18.0-alpha.1"]) {
    assert.throws(() => assertCredentialRuntime("win32", version), code("unsupported-runtime"));
  }
});

test("ownership capacity and corrupted oversized blobs fail without changing keys", async () => {
  const backend = new MemoryBackend();
  const service = new CredentialService(backend);
  const first = profile();
  await service.store(first, TOKEN);
  for (let index = 1; index < 16; index++) {
    await service.link(first, profile("owner-" + index));
  }
  await assert.rejects(service.link(first, profile("overflow")), code("invalid-entry"));
  assert.equal(await service.read(first), TOKEN);
  const target = credentialTarget(first);
  backend.values.set(target, "x".repeat(2561));
  await assert.rejects(service.read(first), code("invalid-entry"));
  assert.equal(backend.values.get(target)?.length, 2561);
});
