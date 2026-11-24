import { spawn } from "node:child_process";
import { lstat } from "node:fs/promises";
import { basename, dirname, isAbsolute } from "node:path";
import { assertSafePath } from "../config/files";
import { assertCleanEnvironment } from "../adapters/codex/runtime";
import { redactDetails } from "../core/diagnostics";
import { COST_NOTICE } from "../cli/codex";

export class UiError extends Error {
  constructor(message = "The operation could not finish. Review diagnostics and retained recovery records before retrying.") { super(message); this.name = "UiError"; }
}
export interface CliReply { readonly code: number; readonly messages: readonly Record<string, unknown>[]; }
export interface CliRunner {
  run(node: string, args: readonly string[], options?: { secret?: string; signal?: AbortSignal }): Promise<CliReply>;
}

/** Only JSON or explicitly known non-secret status lines are accepted, never token output. */
export function parseCliMessages(text: string, secret?: string): readonly Record<string, unknown>[] {
  const messages: Record<string, unknown>[] = [];
  let offset = 0;
  while (offset < text.length) {
    while (/\s/u.test(text[offset] ?? "") && offset < text.length) { offset++; }
    if (offset === text.length) { break; }
    const remaining = text.slice(offset);
    const known = [COST_NOTICE, "Credential stored.", "Credential replaced."].find((line) => remaining.startsWith(line + "\n") || remaining === line);
    if (known) { offset += known.length; continue; }
    if (text[offset] !== "{") { throw new UiError("The CLI returned an unexpected response. Raw process output was not displayed."); }
    let depth = 0;
    let quoted = false;
    let escaped = false;
    const start = offset;
    for (; offset < text.length; offset++) {
      const char = text[offset];
      if (quoted) { if (escaped) { escaped = false; } else if (char === "\\") { escaped = true; } else if (char === '"') { quoted = false; } }
      else if (char === '"') { quoted = true; }
      else if (char === "{" || char === "[") { depth++; }
      else if (char === "}" || char === "]") { depth--; if (depth === 0) { offset++; break; } }
    }
    if (depth !== 0 || quoted) { throw new UiError("The CLI response was incomplete. Check recovery records before retrying."); }
    try {
      const value: unknown = JSON.parse(text.slice(start, offset));
      if (!value || typeof value !== "object" || Array.isArray(value)) { throw new Error(); }
      messages.push(redactDetails(value, secret ? [secret] : [], 65536) as Record<string, unknown>);
    } catch { throw new UiError("The CLI response could not be validated. Raw process output was not displayed."); }
  }
  return messages;
}

export function runnerEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(source)) {
    if (["SYSTEMROOT", "WINDIR", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "TEMP", "TMP"].includes(key.toUpperCase())) { result[key] = value; }
  }
  return result;
}

/** Fixed canonical names only; never expose values or arbitrary environment keys. */
export function ignoredRunnerOverrides(source: NodeJS.ProcessEnv): readonly string[] {
  const names = new Set(["OPENAI_API_KEY", "OPENAI_BASE_URL", "OPENAI_ORG_ID", "OPENAI_ORGANIZATION", "OPENAI_PROJECT", "AZURE_OPENAI_API_KEY", "CODEX_API_KEY", "CODEX_HOME", "CODEX_CONFIG", "CODEX_PROFILE", "NODE_OPTIONS", "NODE_PATH", "ELECTRON_RUN_AS_NODE"]);
  return [...new Set(Object.entries(source).filter(([key, value]) => value && names.has(key.toUpperCase())).map(([key]) => key.toUpperCase()))].sort();
}

interface ChildResult { code: number; stdout: string; stderr: string; }
async function execute(node: string, args: readonly string[], env: NodeJS.ProcessEnv, secret?: string, signal?: AbortSignal): Promise<ChildResult> {
  if (signal?.aborted) { throw new UiError("The request was cancelled. No retry was attempted."); }
  return new Promise((done, reject) => {
    const child = spawn(node, [...args], { shell: false, windowsHide: true, cwd: isAbsolute(args[0]) ? dirname(args[0]) : dirname(node), env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const fail = (message: string) => { if (settled) { return; } settled = true; clearTimeout(timer); signal?.removeEventListener("abort", cancel); child.kill(); reject(new UiError(message)); };
    const cancel = () => fail("The request was cancelled. The server may have processed it; no retry was attempted.");
    const timer = setTimeout(() => fail("The CLI timed out. Its outcome may be uncertain; inspect configuration and recovery records before retrying."), 120000);
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) { cancel(); return; }
    child.on("error", () => fail("The selected Node executable could not start the packaged CLI."));
    child.stdin.on("error", () => fail("The CLI input channel closed. Check actual state before retrying."));
    for (const [stream, kind] of [[child.stdout, "stdout"], [child.stderr, "stderr"]] as const) {
      stream.setEncoding("utf8");
      stream.on("data", (chunk: string) => { if (kind === "stdout") { stdout += chunk; } else { stderr += chunk; } if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > 1024 * 1024) { fail("The CLI response exceeded its size limit. Raw output was not displayed."); } });
    }
    child.on("close", (code) => {
      if (settled) { return; }
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      done({ code: code ?? 1, stdout, stderr });
    });
    child.stdin.end(secret ? secret + "\n" : "");
  });
}

/** GUI Node is explicitly selected: process.execPath in the extension host is Code.exe. */
export class NodeCliRunner implements CliRunner {
  constructor(private readonly bundle: string, private readonly environment: () => NodeJS.ProcessEnv = () => process.env) {}

  async run(node: string, args: readonly string[], options: { secret?: string; signal?: AbortSignal } = {}): Promise<CliReply> {
    const mutation = args[0] === "credential" || args[0] === "helper" || args.includes("--apply");
    if (!["models", "doctor", "connect", "disconnect", "test-model", "credential", "helper"].includes(args[0])
      || (args[0] === "credential" && args[1] !== "store") || (args[0] === "helper" && args[1] !== "stage")
      || (options.secret !== undefined && !(args[0] === "credential" && args[1] === "store"))
      || args.some((arg) => /[\u0000-\u001f\u007f]|\bsk-|\bBearer\s/iu.test(arg))
      || (mutation && options.signal)) { throw new UiError("This CLI action is not allowed by the setup interface."); }
    const sourceEnvironment = this.environment();
    const env = runnerEnvironment(sourceEnvironment);
    // Check what the child will receive, not unrelated VS Code host state.
    // Explicit config/profile arguments and helper auth remain authoritative.
    assertCleanEnvironment(env);
    const ignored = ignoredRunnerOverrides(sourceEnvironment);
    const report = (reply: CliReply): CliReply => ignored.length ? { ...reply, messages: [
      { scope: "managed-cli-environment", ignoredVariables: ignored, message: "Host overrides were excluded from the managed CLI only. Values were not logged; VS Code, terminal environments and stored credentials were not changed." },
      ...reply.messages,
    ] } : reply;
    if (!isAbsolute(node) || basename(node).toLowerCase() !== "node.exe" || !isAbsolute(this.bundle)) { throw new UiError("Select an absolute Node.js 24.18+ node.exe path, not Code.exe or a shell wrapper."); }
    await assertSafePath(node);
    await assertSafePath(this.bundle);
    if (!(await lstat(node)).isFile() || !(await lstat(this.bundle)).isFile()) { throw new UiError("The selected runtime or packaged CLI is missing."); }
    const version = await execute(node, ["--version"], env, undefined, options.signal);
    const match = /^v24\.(\d+)\.\d+\s*$/u.exec(version.stdout);
    if (version.code !== 0 || !match || Number(match[1]) < 18) { throw new UiError("Use Node.js 24.18.0 or a later Node 24 executable. No runtime is downloaded automatically."); }
    const result = await execute(node, [this.bundle, ...args], env, options.secret, options.signal);
    if (result.code !== 0 && result.stderr.trim()) {
      try { return report({ code: result.code, messages: parseCliMessages(result.stdout + "\n" + result.stderr, options.secret) }); }
      catch { throw new UiError("The CLI rejected the operation. Check the selected profile, key ownership, paths, runtime, and compatibility report. No raw process output was displayed."); }
    }
    return report({ code: result.code, messages: parseCliMessages(result.stdout, options.secret) });
  }
}
