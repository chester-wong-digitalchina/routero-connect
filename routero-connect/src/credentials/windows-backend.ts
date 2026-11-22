import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { CredentialError, type CredentialErrorCode } from "./errors";
import type { CredentialBackend } from "./service";
import { WINDOWS_CREDENTIAL_SCRIPT } from "./windows-script";
import { assertCredentialRuntime } from "./runtime";

export interface BridgeRequest {
  readonly action: "read" | "compare-exchange";
  readonly target: string;
  readonly expected?: string | null;
  readonly next?: string | null;
}

export type BridgeRunner = (request: BridgeRequest) => Promise<unknown>;

/** Reject all unrecognized bridge output without exposing stdout/stderr. */
function response(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CredentialError("store-unavailable");
  }
  const item = value as Record<string, unknown>;
  if (item.ok !== true) {
    const codes: CredentialErrorCode[] = ["foreign-entry", "invalid-entry", "timeout"];
    throw new CredentialError(codes.includes(item.code as CredentialErrorCode) ? item.code as CredentialErrorCode : "store-unavailable");
  }
  return item;
}

export class WindowsCredentialBackend implements CredentialBackend {
  constructor(private readonly run: BridgeRunner) {}

  private async invoke(request: BridgeRequest): Promise<Record<string, unknown>> {
    try {
      return response(await this.run(request));
    } catch (error) {
      throw error instanceof CredentialError ? error : new CredentialError("store-unavailable");
    }
  }

  async read(target: string): Promise<string | undefined> {
    const item = await this.invoke({ action: "read", target });
    if (item.found === false && (item.payload === null || item.payload === undefined)) {
      return undefined;
    }
    if (item.found === true && typeof item.payload === "string") {
      return item.payload;
    }
    throw new CredentialError("store-unavailable");
  }

  async compareExchange(target: string, expected: string | undefined, next: string | undefined): Promise<boolean> {
    const item = await this.invoke({ action: "compare-exchange", target, expected: expected ?? null, next: next ?? null });
    if (typeof item.exchanged !== "boolean") {
      throw new CredentialError("store-unavailable");
    }
    return item.exchanged;
  }
}

export function createWindowsBridge(runtimeDirectory: string, timeoutMs = 4500): BridgeRunner {
  return async (request) => {
    assertCredentialRuntime();
    const systemRoot = process.env.SystemRoot;
    if (!systemRoot || !isAbsolute(systemRoot) || !isAbsolute(runtimeDirectory)
      || !/^RouteroConnect\/v1\/[a-f0-9]{64}$/u.test(request.target)) {
      throw new CredentialError("store-unavailable");
    }
    try {
      await mkdir(runtimeDirectory, { recursive: true, mode: 0o700 });
    } catch {
      throw new CredentialError("store-unavailable");
    }
    // Trusted source goes in argv; sensitive request data goes only through stdin.
    // -Command avoids unsigned .ps1 file execution without changing execution policy.
    const executable = join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    return new Promise((resolve, reject) => {
      const child = spawn(executable, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", WINDOWS_CREDENTIAL_SCRIPT], {
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
        env: { SystemRoot: systemRoot, WINDIR: systemRoot, TEMP: runtimeDirectory, TMP: runtimeDirectory },
      });
      let output = "";
      let settled = false;
      const fail = (code: "timeout" | "store-unavailable") => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          child.kill();
          reject(new CredentialError(code));
        }
      };
      const timer = setTimeout(() => fail("timeout"), timeoutMs);
      child.stdin.on("error", () => fail("store-unavailable"));
      child.on("error", () => fail("store-unavailable"));
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        output += chunk;
        if (Buffer.byteLength(output) > 16384) {
          fail("store-unavailable");
        }
      });
      // Never forward raw PowerShell stderr; drain it without retaining secret data.
      child.stderr.resume();
      child.on("close", (code) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        try {
          if (code !== 0) {
            throw new Error();
          }
          resolve(JSON.parse(output.replace(/^\uFEFF/u, "")) as unknown);
        } catch {
          reject(new CredentialError("store-unavailable"));
        }
      });
      child.stdin.end(JSON.stringify(request), "utf8");
    });
  };
}
