/** Native protocol probe: project-local files, dummy token, loopback HTTP 418; no vault or real inference. */
import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { isAbsolute, join, resolve } from "node:path";

async function run(executable: string, args: string[], env: NodeJS.ProcessEnv, cwd: string) {
  return new Promise<{ code: number | null; stdout: string }>((done, reject) => {
    const child = spawn(executable, args, { cwd, env, windowsHide: true, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("local-probe-timeout")); }, 30000);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; if (stdout.length > 65536) { child.kill(); } });
    child.stderr.resume(); // Never expose raw client output or a dummy bearer token.
    child.on("error", () => { clearTimeout(timer); reject(new Error("local-probe-process-failed")); });
    child.on("close", (code) => { clearTimeout(timer); done({ code, stdout }); });
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (process.platform !== "win32" || args.length !== 3 || args[0] !== "--codex" || !isAbsolute(args[1]) || args[2] !== "--confirm-local-test") { throw new Error("Use --codex <absolute-codex.exe> --confirm-local-test on Windows."); }
  const root = resolve(__dirname, "../../..");
  const work = join(root, "tmp", "validation", "codex-command-auth-" + randomUUID());
  const home = join(work, "home");
  await mkdir(home, { recursive: true });
  const helper = join(work, "dummy helper.cjs");
  await writeFile(helper, 'process.stdout.write(process.env.ROUTERO_DUMMY_PROBE_TOKEN + "\\n");\n');
  const dummy = "sk-test-local-probe-" + randomUUID();
  const env: NodeJS.ProcessEnv = { SystemRoot: process.env.SystemRoot, WINDIR: process.env.SystemRoot, CODEX_HOME: home, TEMP: work, TMP: work, ROUTERO_DUMMY_PROBE_TOKEN: dummy };
  const version = await run(args[1], ["--version"], env, work);
  assert.equal(version.code, 0);
  assert.equal(version.stdout.trim(), "codex-cli 0.172.0");
  let requests = 0;
  let matched = true;
  let correctPath = true;
  const server = createServer((request, response) => {
    request.resume();
    if (request.method !== "POST") { response.writeHead(200, { "Content-Type": "application/json" }).end('{"models":[]}'); return; }
    requests++;
    matched = matched && request.headers.authorization === "Bearer " + dummy;
    correctPath = correctPath && request.url === "/v1/responses";
    response.writeHead(418, { "Content-Type": "application/json" }).end('{"error":{"message":"Intentional local authentication probe; no model request.","type":"validation_probe","code":"418"}}');
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    await writeFile(join(home, "config.toml"), `model_provider = "routero"
model = "openai/gpt-6-luna"
sandbox_mode = "read-only"
approval_policy = "never"
[history]
persistence = "none"
[model_providers.routero]
name = "Routero local authentication probe"
base_url = "http://127.0.0.1:${address.port}/v1"
wire_api = "responses"
supports_websockets = false
request_max_retries = 0
stream_max_retries = 0
[model_providers.routero.auth]
command = ${JSON.stringify(process.execPath)}
args = ${JSON.stringify([helper])}
timeout_ms = 10000
`, "utf8");
    const result = await run(args[1], ["--no-daemon", "exec", "--strict-config", "--ephemeral", "--skip-git-repo-check", "-C", work, "Reply READY. Do not execute tools."], env, work);
    const evidence = { schemaVersion: 1, date: "2026-11-24", clientVersion: "0.172.0", exitCode: result.code, expectedHttpStatus: 418, postRequests: requests, tokenMatched: matched && requests > 0, responsesPathMatched: correctPath && requests > 0, source: "dummy-token-loopback-command-auth", windowsCredentialStoreAccessed: false, liveInferenceRequests: 0, costUsd: 0 };
    await writeFile(join(work, "result.json"), JSON.stringify(evidence, null, 2) + "\n");
    console.log(JSON.stringify(evidence, null, 2));
    assert.equal(result.code, 1);
    assert.equal(requests, 1);
    assert.equal(matched, true);
    assert.equal(correctPath, true);
  } finally { await new Promise<void>((done) => server.close(() => done())); }
}

void main().catch(() => { process.stderr.write("Local Codex command-auth check failed; no raw output was displayed. Inspect the project-local result record.\n"); process.exitCode = 1; });
