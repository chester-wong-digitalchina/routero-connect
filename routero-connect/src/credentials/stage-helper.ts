import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { CredentialError } from "./errors";
import { protectHelperDirectory } from "./private-directory";

// A changed bundled CLI is staged at a new path, never over an installed version.
export const HELPER_VERSION = "0.0.4";
export const SUPPORTED_HELPER_VERSIONS = ["0.0.3", HELPER_VERSION] as const;

/** Explicit staging only: no default user installation, PATH edit, or download. */
export async function stageHelper(sourceBundle: string, destination: string): Promise<{
  helperVersion: string;
  nodeExecutable: string;
  helperScript: string;
  sha256: string;
}> {
  try {
    if (!isAbsolute(sourceBundle) || !isAbsolute(destination)) {
      throw new Error();
    }
    const target = resolve(destination);
    let cursor = target;
    while (true) {
      try {
        const stat = await lstat(cursor);
        if (stat.isSymbolicLink() || !stat.isDirectory() || cursor === target) {
          throw new Error();
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }
      const parent = dirname(cursor);
      if (parent === cursor) {
        break;
      }
      cursor = parent;
    }
    const bundle = await readFile(sourceBundle);
    const sha256 = createHash("sha256").update(bundle).digest("hex");
    const helperScript = join(target, "routero-connect.cjs");
    await mkdir(target, { recursive: true, mode: 0o700 });
    await protectHelperDirectory(target);
    await writeFile(helperScript, bundle, { flag: "wx", mode: 0o600 });
    // Node is an explicit executable; no .cmd shell wrapper or PATH lookup.
    const manifest = { helperVersion: HELPER_VERSION, nodeExecutable: process.execPath, helperScript, sha256 };
    await writeFile(join(target, "helper-manifest.json"), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    return manifest;
  } catch {
    throw new CredentialError("helper-stage-failed");
  }
}
