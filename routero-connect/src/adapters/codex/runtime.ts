import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { assertSafePath, snapshot } from "../../config/files";
import { checkPrivate } from "../../config/permissions";
import { SUPPORTED_HELPER_VERSIONS } from "../../credentials/stage-helper";
import type { ClientInfo } from "../contracts";
import { CodexWorkflowError } from "./errors";

export interface HelperInfo { readonly helperVersion: string; readonly nodeExecutable: string; readonly helperScript: string; readonly sha256: string; }

/** Read/verify only. Never stage, replace, or execute a helper during inspection. */
export async function inspectHelper(directory: string): Promise<HelperInfo> {
  try {
    if (!isAbsolute(directory)) { throw new Error(); }
    await assertSafePath(directory);
    await checkPrivate(directory);
    const manifestFile = join(directory, "helper-manifest.json");
    const saved = await snapshot(manifestFile);
    if (!saved.exists || saved.text.length > 8192) { throw new Error(); }
    const value = JSON.parse(saved.text) as HelperInfo;
    if (!value || Object.keys(value).sort().join() !== "helperScript,helperVersion,nodeExecutable,sha256"
      || !SUPPORTED_HELPER_VERSIONS.some((version) => version === value.helperVersion) || value.nodeExecutable !== process.execPath
      || value.helperScript !== join(resolve(directory), "routero-connect.cjs") || !/^[a-f0-9]{64}$/u.test(value.sha256)) { throw new Error(); }
    await assertSafePath(value.helperScript);
    const stat = await lstat(value.helperScript);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > 8 * 1024 * 1024) { throw new Error(); }
    await checkPrivate(manifestFile);
    await checkPrivate(value.helperScript);
    const bytes = await readFile(value.helperScript);
    if (bytes.length > 8 * 1024 * 1024 || createHash("sha256").update(bytes).digest("hex") !== value.sha256) { throw new Error(); }
    return Object.freeze(value);
  } catch { throw new CodexWorkflowError("helper-unavailable"); }
}

export function assertCleanEnvironment(env: NodeJS.ProcessEnv): void {
  const conflicting = /^(?:OPENAI_API_KEY|OPENAI_BASE_URL|OPENAI_ORG_ID|OPENAI_ORGANIZATION|OPENAI_PROJECT|AZURE_OPENAI_API_KEY|CODEX_API_KEY|CODEX_HOME|CODEX_CONFIG|CODEX_PROFILE|NODE_OPTIONS)$/iu;
  if (Object.entries(env).some(([key, value]) => value && conflicting.test(key))) { throw new CodexWorkflowError("environment-conflict"); }
}

/** Run only --version, with bounded output/time and a minimal environment. */
export async function detectCodex(executable: string): Promise<ClientInfo> {
  try {
    if (!isAbsolute(executable) || basename(executable).toLowerCase() !== "codex.exe") { throw new Error(); }
    await assertSafePath(executable);
    if (!(await lstat(executable)).isFile()) { throw new Error(); }
    const version = await new Promise<string>((done, reject) => {
      const root = process.env.SystemRoot;
      const child = spawn(executable, ["--version"], { shell: false, windowsHide: true, cwd: dirname(executable), stdio: ["ignore", "pipe", "pipe"], env: { SystemRoot: root, WINDIR: root } });
      let output = "";
      const timer = setTimeout(() => { child.kill(); reject(new Error()); }, 5000);
      child.on("error", () => { clearTimeout(timer); reject(new Error()); });
      child.stderr.resume();
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => { output += chunk; if (output.length > 128) { child.kill(); } });
      child.on("close", (code) => { clearTimeout(timer); const match = /^codex-cli (\d+\.\d+\.\d+)\s*$/u.exec(output); if (code === 0 && match) { done(match[1]); } else { reject(new Error()); } });
    });
    return { client: "codex-cli", installed: true, executablePath: executable, version };
  } catch { throw new CodexWorkflowError("client-unavailable"); }
}
