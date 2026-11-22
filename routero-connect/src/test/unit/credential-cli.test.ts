import { strict as assert } from "node:assert";
import { Readable, PassThrough } from "node:stream";
import { test } from "node:test";
import { executeCredentialCommand, parseCredentialCommand, readSecretStdin } from "../../cli/credentials";
import { CredentialError } from "../../credentials/errors";
import { CredentialService, type CredentialBackend } from "../../credentials/service";

const TOKEN = "sk-test-not-a-real-credential";
const flags = ["--profile", "default", "--api-root", "https://test.example"];

test("credential arguments reject keys, duplicates, and unknown options without echo", () => {
  for (const args of [["print", ...flags, TOKEN], ["print", ...flags, "--token", TOKEN], ["print", ...flags, "--profile", "other"], ["store", ...flags, "--replace", "--replace"], ["print", "--profile", TOKEN, "--api-root", "https://test.example"], ["link", ...flags]]) {
    assert.throws(() => parseCredentialCommand(args), (error: unknown) => {
      assert.ok(error instanceof CredentialError);
      assert.ok(!error.message.includes(TOKEN));
      return true;
    });
  }
});

test("stdin accepts exactly one piped line and bounds data/time", async () => {
  assert.equal(await readSecretStdin(Readable.from([TOKEN + "\r\n"])), TOKEN);
  await assert.rejects(readSecretStdin(Readable.from(["x".repeat(2049)])), CredentialError);
  const tty = new PassThrough() as PassThrough & { isTTY: boolean };
  tty.isTTY = true;
  await assert.rejects(readSecretStdin(tty), CredentialError);
  const stalled = new PassThrough();
  await assert.rejects(readSecretStdin(stalled, 10), (error: unknown) => error instanceof CredentialError && error.code === "timeout");
  stalled.destroy();
});

test("print stdout is token-only; all failure output is sanitized", async () => {
  const values = new Map<string, string>();
  const backend: CredentialBackend = {
    async read(target) { return values.get(target); },
    async compareExchange(target, expected, next) {
      if (values.get(target) !== expected) { return false; }
      if (next === undefined) { values.delete(target); } else { values.set(target, next); }
      return true;
    },
  };
  const service = new CredentialService(backend);
  let stdout = "";
  let stderr = "";
  const output = { stdout: (value: string) => { stdout += value + "\n"; }, stderr: (value: string) => { stderr += value + "\n"; } };
  assert.equal(await executeCredentialCommand(parseCredentialCommand(["store", ...flags]), service, Readable.from([TOKEN]), output), 0);
  assert.ok(!stdout.includes(TOKEN));
  stdout = "";
  assert.equal(await executeCredentialCommand(parseCredentialCommand(["print", ...flags]), service, Readable.from([]), output), 0);
  assert.equal(stdout, TOKEN + "\n");
  assert.equal(stderr, "");
  stdout = "";
  assert.equal(await executeCredentialCommand(parseCredentialCommand(["store", ...flags, "--replace"]), service, Readable.from([TOKEN + "\nextra"]), output), 1);
  assert.equal(stdout, "");
  assert.ok(!stderr.includes(TOKEN));
});
