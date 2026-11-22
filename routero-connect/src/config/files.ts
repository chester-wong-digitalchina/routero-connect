import { createHash, randomUUID } from "node:crypto";
import { lstat, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname, join, parse, resolve } from "node:path";
import type { FileHandle } from "node:fs/promises";
import { ConfigError } from "./errors";
import { copyPermissions } from "./permissions";

export const MAX_CONFIG_BYTES = 2 * 1024 * 1024;
export interface Snapshot { readonly exists: boolean; readonly text: string; readonly revision: string; readonly identity: string; }
export function digest(text: string): string { return createHash("sha256").update(text, "utf8").digest("hex"); }

/** Refuse symlinks/junctions in any existing path component. */
export async function assertSafePath(path: string): Promise<void> {
  let cursor = resolve(path);
  while (true) {
    try {
      const entry = await lstat(cursor);
      if (entry.isSymbolicLink()) { throw new ConfigError("unsafe-path"); }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") { throw error instanceof ConfigError ? error : new ConfigError("unsafe-path"); }
    }
    const parent = dirname(cursor);
    if (cursor === parent) { break; }
    cursor = parent;
  }
}

export async function snapshot(path: string): Promise<Snapshot> {
  await assertSafePath(path);
  try {
    const before = await lstat(path);
    if (!before.isFile() || before.nlink !== 1 || before.size > MAX_CONFIG_BYTES) { throw new ConfigError("unsafe-path"); }
    const bytes = await readFile(path);
    if (bytes.length > MAX_CONFIG_BYTES) { throw new ConfigError("unsafe-path"); }
    const after = await lstat(path);
    if (before.ino !== after.ino || before.dev !== after.dev || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || before.mode !== after.mode || after.nlink !== 1) { throw new ConfigError("conflict"); }
    let text: string;
    try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
    catch { throw new ConfigError("invalid-toml"); }
    return { exists: true, text, revision: digest(text), identity: `${after.dev}:${after.ino}:${after.mtimeMs}:${after.ctimeMs}:${after.mode}` };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") { return { exists: false, text: "", revision: "absent", identity: "absent" }; }
    throw error instanceof ConfigError ? error : new ConfigError("unsafe-path");
  }
}

export function sameSnapshot(left: Snapshot, right: Snapshot): boolean {
  return left.exists === right.exists && left.revision === right.revision && left.identity === right.identity;
}

export async function withConfigLock<T>(path: string, action: () => Promise<T>): Promise<T> {
  const lock = join(dirname(path), ".routero-connect.lock");
  await assertSafePath(dirname(path));
  let handle: FileHandle;
  try { handle = await open(lock, "wx", 0o600); }
  catch (error) { throw new ConfigError((error as NodeJS.ErrnoException).code === "EEXIST" ? "busy" : "unsafe-path"); }
  const identity = await handle.stat();
  try { return await action(); }
  finally {
    await handle.close();
    // Do not delete a lock replaced by another process.
    try {
      const current = await lstat(lock);
      if (current.ino === identity.ino && current.dev === identity.dev && current.isFile() && !current.isSymbolicLink()) { await unlink(lock); }
    } catch { /* A missing/replaced lock is not permission to remove another file. */ }
  }
}

export interface AtomicWriteHooks {
  /** Injection seam for tests/host I/O; callbacks must never receive file contents. */
  beforeReplace?(): Promise<void>;
  afterReplace?(): Promise<void>;
}

export async function atomicReplace(path: string, before: Snapshot, text: string, hooks: AtomicWriteHooks = {}): Promise<void> {
  const temporary = join(dirname(path), `.routero-${randomUUID()}.tmp`);
  let handle: FileHandle | undefined;
  let created = false;
  try {
    if (!sameSnapshot(before, await snapshot(path))) { throw new ConfigError("conflict"); }
    handle = await open(temporary, "wx", 0o600);
    created = true;
    await copyPermissions(before.exists ? path : undefined, temporary);
    await handle.writeFile(text, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    if ((await snapshot(temporary)).revision !== digest(text)) { throw new ConfigError("write-failed"); }
    await hooks.beforeReplace?.();
    if (!sameSnapshot(before, await snapshot(path))) { throw new ConfigError("conflict"); }
    // Atomic replacement, not an OS-level compare-and-swap against other editors.
    await rename(temporary, path);
    created = false;
    await hooks.afterReplace?.();
    const actual = await snapshot(path);
    if (!actual.exists || actual.revision !== digest(text)) { throw new ConfigError("verification-failed"); }
  } catch (error) {
    throw error instanceof ConfigError ? error : new ConfigError("write-failed");
  } finally {
    await handle?.close();
    if (created) { await unlink(temporary).catch(() => undefined); }
  }
}

export async function insideRepository(path: string): Promise<boolean> {
  let cursor = resolve(path);
  while (true) {
    try { await lstat(join(cursor, ".git")); return true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT" && (error as NodeJS.ErrnoException).code !== "ENOTDIR") { throw new ConfigError("recovery-unavailable"); } }
    const parent = dirname(cursor);
    if (parse(cursor).root === cursor || parent === cursor) { return false; }
    cursor = parent;
  }
}
