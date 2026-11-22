/** Opt-in integration check: creates/removes exactly one namespaced dummy vault entry. */
import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { createConnectionProfile, createCredentialReference } from "../../core/profiles";
import { redactText } from "../../core/diagnostics";
import { CredentialError } from "../../credentials/errors";
import { CredentialService, credentialTarget } from "../../credentials/service";
import { createWindowsBridge, WindowsCredentialBackend } from "../../credentials/windows-backend";
import { HELPER_VERSION, stageHelper } from "../../credentials/stage-helper";

async function run(executable: string, args: string[], env: NodeJS.ProcessEnv, cwd: string, input = "", timeout = 30000): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((done, reject) => {
    const child = spawn(executable, args, { env, cwd, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("integration-timeout")); }, timeout);
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
    child.on("error", () => { clearTimeout(timer); reject(new Error("integration-process-failed")); });
    child.on("close", (code) => { clearTimeout(timer); done({ code, stdout, stderr }); });
    child.stdin.on("error", () => undefined);
    child.stdin.end(input);
  });
}

async function main(): Promise<void> {
  if (process.platform !== "win32" || process.argv[2] !== "--write-dummy-credentials") {
    throw new Error("Explicit --write-dummy-credentials consent is required on Windows.");
  }
  const id = "phase4-" + randomUUID();
  const root = resolve(__dirname, "../../..");
  const work = join(root, "tmp", "validation", id);
  await mkdir(work, { recursive: true });
  const installed = process.argv[3] === "--install-helper";
  const reuseInstalled = process.argv[3] === "--use-installed-helper";
  const localAppData = process.env.LOCALAPPDATA;
  if ((installed || reuseInstalled) && !localAppData) {
    throw new Error("missing-local-app-data");
  }
  const destination = installed || reuseInstalled ? join(localAppData!, "RouteroConnect", "helper", HELPER_VERSION) : join(work, "staged helper with spaces");
  let helper: Awaited<ReturnType<typeof stageHelper>>;
  if (reuseInstalled) {
    const manifest = JSON.parse(await readFile(join(destination, "helper-manifest.json"), "utf8")) as Awaited<ReturnType<typeof stageHelper>>;
    const currentHash = createHash("sha256").update(await readFile(join(root, "dist", "cli.js"))).digest("hex");
    assert.equal(manifest.helperVersion, HELPER_VERSION);
    assert.equal(manifest.nodeExecutable, process.execPath);
    assert.equal(manifest.helperScript, join(destination, "routero-connect.cjs"));
    assert.equal(manifest.sha256, currentHash);
    assert.equal(createHash("sha256").update(await readFile(manifest.helperScript)).digest("hex"), currentHash);
    helper = manifest;
  } else {
    helper = await stageHelper(join(root, "dist", "cli.js"), destination);
  }
  const origin = "https://credential-test.invalid";
  const makeProfile = (owner: string) => createConnectionProfile({ id: owner, name: owner, apiRoot: origin, credential: createCredentialReference(id, origin) });
  const first = makeProfile(id);
  const second = makeProfile(id + "-second");
  const backend = new WindowsCredentialBackend(createWindowsBridge(join(work, "native-runtime"), 8000));
  const service = new CredentialService(backend);
  const token = "sk-test-dummy-credential-" + randomUUID();
  const replacement = "sk-test-dummy-replacement-" + randomUUID();
  const flags = ["--profile", id, "--api-root", origin, "--credential-ref", id];
  const childEnv: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (["SYSTEMROOT", "WINDIR", "COMSPEC", "USERPROFILE", "LOCALAPPDATA", "APPDATA"].includes(key.toUpperCase())) {
      childEnv[key] = value;
    }
  }
  // No PATH, OPENAI_API_KEY, ROUTERO key, NODE_OPTIONS, or shell state inherited.
  childEnv.TEMP = join(work, "process-temp");
  childEnv.TMP = childEnv.TEMP;
  await mkdir(childEnv.TEMP, { recursive: true });
  const result: Record<string, unknown> = { schemaVersion: 1, date: new Date().toISOString(), helperVersion: helper.helperVersion, helperSha256: helper.sha256, nativeLifecycle: false, restartPrint: false, codex: [], cleanup: false, installedHelper: installed, usedInstalledHelper: reuseInstalled, inferenceRequests: 0, costUsd: 0 };
  try {
    result.stage = "native-lifecycle";
    await service.store(first, token);
    assert.equal(await service.read(first), token);
    await service.store(first, replacement, true);
    assert.equal(await service.read(first), replacement);
    await service.link(first, second);
    await assert.rejects(service.store(first, token, true), (error: unknown) => error instanceof CredentialError && error.code === "shared-credential");
    assert.equal(await service.remove(second), "retained");
    result.nativeLifecycle = true;
    result.stage = "cold-helper-print";
    for (let attempt = 0; attempt < 2; attempt++) {
      const printed = await run(helper.nodeExecutable, [helper.helperScript, "credential", "print", ...flags], childEnv, work);
      assert.equal(printed.code, 0, "helper-print-failed");
      assert.equal(printed.stdout, replacement + "\n", "helper-stdout-not-token-only");
      assert.equal(printed.stderr, "", "helper-stderr-not-empty");
    }
    result.restartPrint = true;
    const codexExecutables = [
      { label: "standalone", file: join(process.env.LOCALAPPDATA!, "Programs", "OpenAI", "Codex", "bin", "codex.exe") },
      { label: "ide-bundled", file: join(process.env.USERPROFILE!, ".vscode", "extensions", "openai.chatgpt-26.1111.21308-win32-x64", "bin", "windows-x86_64", "codex.exe") },
    ];
    for (const client of codexExecutables) {
      result.stage = "codex-" + client.label;
      let matched = false;
      let requests = 0;
      const server = createServer((request, response) => {
        if (request.method === "GET") {
          response.writeHead(200, { "Content-Type": "application/json" }).end('{"models":[]}');
          return;
        }
        requests++;
        matched = request.headers.authorization === "Bearer " + replacement;
        request.resume();
        response.writeHead(418, { "Content-Type": "application/json" }).end('{"error":{"message":"Intentional local credential test; no inference.","type":"validation_probe","code":"418"}}');
      });
      await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
      try {
        const address = server.address();
        assert.ok(address && typeof address !== "string");
        const home = join(work, client.label);
        await mkdir(home);
        await writeFile(join(home, "config.toml"), `model_provider = "routero_local_test"
model = "gpt-5"
sandbox_mode = "read-only"
approval_policy = "never"
[history]
persistence = "none"
[model_providers.routero_local_test]
name = "Local credential test"
base_url = "http://127.0.0.1:${address.port}"
wire_api = "responses"
supports_websockets = false
request_max_retries = 0
stream_max_retries = 0
[model_providers.routero_local_test.auth]
command = ${JSON.stringify(helper.nodeExecutable)}
args = ${JSON.stringify([helper.helperScript, "credential", "print", ...flags])}
timeout_ms = 10000
`, "utf8");
        const version = await run(client.file, ["--version"], childEnv, work);
        const invocation = await run(client.file, ["exec", "--strict-config", "--ephemeral", "--skip-git-repo-check", "-C", home, "Reply READY. Do not execute tools."], { ...childEnv, CODEX_HOME: home }, home);
        const clientResult: Record<string, unknown> = { label: client.label, version: version.stdout.trim(), commandAuthPassed: false, expectedStatus: 418, exitCode: invocation.code, requests, tokenMatched: matched };
        (result.codex as unknown[]).push(clientResult);
        if (invocation.code !== 1 || requests !== 1 || !matched) {
          clientResult.diagnostic = redactText(invocation.stderr, [token, replacement]).slice(-2000);
        }
        assert.equal(invocation.code, 1, "expected-intentional-http-rejection");
        assert.equal(requests, 1, "unexpected-number-of-inference-endpoint-calls");
        assert.equal(matched, true, "codex-helper-token-not-received");
        clientResult.commandAuthPassed = true;
      } finally {
        await new Promise<void>((done) => server.close(() => done()));
      }
    }
    result.stage = "passed";
  } catch (error) {
    result.failure = error instanceof CredentialError ? error.code : "integration-check-failed";
    throw error;
  } finally {
    // Only the exact unique test reference is eligible for cleanup.
    let cleaned = true;
    for (const owner of [second, first]) {
      try { await service.remove(owner); } catch (error) {
        if (!(error instanceof CredentialError) || !["missing", "not-owner"].includes(error.code)) { cleaned = false; }
      }
    }
    try { cleaned = cleaned && await backend.read(credentialTarget(first)) === undefined; } catch { cleaned = false; }
    result.cleanup = cleaned;
    await writeFile(join(work, "result.json"), JSON.stringify(result, null, 2) + "\n", "utf8");
    console.log(JSON.stringify(result, null, 2));
    if (!cleaned) { throw new Error("dummy-credential-cleanup-needs-review"); }
  }
}

main().catch(() => {
  // Assertions and child output can include secrets; only fixed error text escapes.
  process.stderr.write("Windows credential integration failed. Inspect the non-secret result record; do not dump raw child output.\n");
  process.exitCode = 1;
});
