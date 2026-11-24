import { execFile } from "node:child_process";
import { isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import { CredentialError } from "./errors";

const execute = promisify(execFile);

/** Protect a newly created helper directory before writing executable files. */
export async function protectHelperDirectory(directory: string): Promise<void> {
  if (process.platform !== "win32") {
    return; // mkdir(0700) is used on POSIX; credential access remains Windows-only.
  }
  const root = process.env.SystemRoot;
  if (!root || !isAbsolute(root)) {
    throw new CredentialError("helper-stage-failed");
  }
  try {
    const options = { windowsHide: true, timeout: 5000, maxBuffer: 8192 };
    const identity = await execute(join(root, "System32", "whoami.exe"), ["/user", "/fo", "csv", "/nh"], options);
    const sid = /\bS-1-5-(?:\d+-)*\d+\b/u.exec(identity.stdout)?.[0];
    if (!sid) {
      throw new Error();
    }
    await execute(join(root, "System32", "icacls.exe"), [directory, "/inheritance:r", "/grant:r", `*${sid}:(OI)(CI)F`, "*S-1-5-18:(OI)(CI)F"], options);
  } catch {
    throw new CredentialError("helper-stage-failed");
  }
}
