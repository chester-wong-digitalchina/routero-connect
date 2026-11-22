import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, rename, unlink } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { dirname, join } from "node:path";
import { isManagedPath } from "./changes";
import { ConfigError } from "./errors";
import { assertSafePath, digest, insideRepository, snapshot } from "./files";
import { checkPrivate, makePrivate } from "./permissions";

const MARKER = "Routero Connect private recovery v1\n";
export interface RecoveryManifest {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly target: string;
  readonly beforeExists: boolean;
  readonly beforeHash: string;
  readonly appliedHash: string;
  readonly fields: readonly (readonly string[])[];
  readonly pending: readonly (readonly string[])[];
  readonly createdTables: readonly (readonly string[])[];
  readonly state: "prepared" | "applied" | "partial" | "restored";
}

export function validChangeId(id: string): boolean { return /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(id); }

/** Owner-only before any secret-bearing snapshot is written. */
async function privateWrite(path: string, text: string, replace = false): Promise<void> {
  const temporary = replace ? join(dirname(path), `.record-${randomUUID()}.tmp`) : path;
  let handle: FileHandle | undefined;
  try {
    handle = await open(temporary, "wx", 0o600);
    await makePrivate(temporary, false);
    await handle.writeFile(text, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    if (replace) { await rename(temporary, path); }
  } catch {
    throw new ConfigError("recovery-unavailable");
  } finally {
    await handle?.close();
    if (replace) { await unlink(temporary).catch(() => undefined); }
  }
}

export class PrivateHistory {
  constructor(readonly root: string, private readonly allowInRepositoryForTests = false) {}

  private async checkRoot(): Promise<void> {
    await assertSafePath(this.root);
    if (!this.allowInRepositoryForTests && await insideRepository(this.root)) { throw new ConfigError("recovery-unavailable"); }
    if (!(await lstat(this.root)).isDirectory()) { throw new ConfigError("recovery-unavailable"); }
    await checkPrivate(this.root);
    const marker = await snapshot(join(this.root, ".routero-recovery"));
    if (!marker.exists || marker.text !== MARKER) { throw new ConfigError("recovery-unavailable"); }
  }

  async initialize(): Promise<void> {
    try {
      await assertSafePath(this.root);
      if (!this.allowInRepositoryForTests && await insideRepository(this.root)) { throw new ConfigError("recovery-unavailable"); }
      try {
        await lstat(this.root);
        await this.checkRoot();
        return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") { throw error; }
      }
      await mkdir(dirname(this.root), { recursive: true, mode: 0o700 });
      // An existing unmarked directory is never claimed or chmodded by the tool.
      await mkdir(this.root, { mode: 0o700 });
      await makePrivate(this.root, true);
      await privateWrite(join(this.root, ".routero-recovery"), MARKER);
    } catch { throw new ConfigError("recovery-unavailable"); }
  }

  async create(manifest: RecoveryManifest, before: string, applied: string): Promise<void> {
    await this.initialize();
    const directory = join(this.root, manifest.id);
    try {
      await mkdir(directory, { mode: 0o700 });
      await makePrivate(directory, true);
      await privateWrite(join(directory, "before.toml"), before);
      await privateWrite(join(directory, "applied.toml"), applied);
      await privateWrite(join(directory, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
    } catch { throw new ConfigError("recovery-unavailable"); }
  }

  async load(id: string, target: string): Promise<{ manifest: RecoveryManifest; before: string; applied: string }> {
    if (!validChangeId(id)) { throw new ConfigError("invalid-recovery"); }
    try {
      await this.checkRoot();
      const directory = join(this.root, id);
      await assertSafePath(directory);
      await checkPrivate(directory);
      for (const name of ["manifest.json", "before.toml", "applied.toml"]) { await checkPrivate(join(directory, name)); }
      const record = await snapshot(join(directory, "manifest.json"));
      const value = JSON.parse(record.text) as RecoveryManifest;
      const keys = ["schemaVersion", "id", "target", "beforeExists", "beforeHash", "appliedHash", "fields", "pending", "createdTables", "state"];
      if (!value || typeof value !== "object" || Object.keys(value).length !== keys.length || Object.keys(value).some((key) => !keys.includes(key))
        || value.schemaVersion !== 1 || value.id !== id || value.target !== target || typeof value.beforeExists !== "boolean"
        || !/^[a-f0-9]{64}$/u.test(value.beforeHash) || !/^[a-f0-9]{64}$/u.test(value.appliedHash)
        || !["prepared", "applied", "partial", "restored"].includes(value.state)
        || !Array.isArray(value.fields) || value.fields.length > 32 || !Array.isArray(value.pending)
        || value.fields.some((path) => !Array.isArray(path) || !isManagedPath(path))
        || value.pending.some((path) => !Array.isArray(path) || !value.fields.some((field) => JSON.stringify(field) === JSON.stringify(path)))
        || !Array.isArray(value.createdTables) || value.createdTables.some((path) => !Array.isArray(path) || ![JSON.stringify(["model_providers", "routero"]), JSON.stringify(["model_providers", "routero", "auth"])].includes(JSON.stringify(path)))) {
        throw new Error();
      }
      const before = await snapshot(join(directory, "before.toml"));
      const applied = await snapshot(join(directory, "applied.toml"));
      if (!before.exists || !applied.exists || digest(before.text) !== value.beforeHash || digest(applied.text) !== value.appliedHash) { throw new Error(); }
      return { manifest: value, before: before.text, applied: applied.text };
    } catch { throw new ConfigError("invalid-recovery"); }
  }

  async update(manifest: RecoveryManifest): Promise<void> {
    try {
      await this.checkRoot();
      const directory = join(this.root, manifest.id);
      await assertSafePath(directory);
      await checkPrivate(directory);
      await privateWrite(join(directory, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", true);
    } catch { throw new ConfigError("recovery-unavailable"); }
  }
}
