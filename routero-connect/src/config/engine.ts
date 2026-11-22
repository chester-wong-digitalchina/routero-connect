import { randomUUID } from "node:crypto";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { ApplyResult, ConfigPlan, RollbackResult } from "../adapters/contracts";
import { createDiagnostic, redactText, type Diagnostic } from "../core/diagnostics";
import { validateChanges, type SettingChange } from "./changes";
import { pathKey } from "./changes";
import { ConfigError } from "./errors";
import { atomicReplace, sameSnapshot, snapshot, withConfigLock, digest, MAX_CONFIG_BYTES, type AtomicWriteHooks, type Snapshot } from "./files";
import { PrivateHistory, type RecoveryManifest } from "./history";
import { editField, fieldFingerprint, fieldRaw, parseDocument, pruneCreatedTables, renderValue, valueFingerprint } from "./toml";

interface PreparedPlan {
  readonly before: Snapshot;
  readonly after: string;
  readonly fields: readonly (readonly string[])[];
  readonly createdTables: readonly (readonly string[])[];
}

export interface ConfigEngineOptions {
  readonly configFile: string;
  readonly allowedConfigDirectory: string;
  readonly recoveryDirectory: string;
  /** Tests only. Production recovery must be outside repositories. */
  readonly allowInRepositoryForTests?: boolean;
  readonly writeHooks?: AtomicWriteHooks;
}

function diagnostic(error: unknown): Diagnostic {
  const safe = error instanceof ConfigError ? error : new ConfigError("write-failed");
  return createDiagnostic({ category: "configuration", outcome: "failed", code: safe.code, message: safe.message, details: safe.location });
}

function inside(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path));
}

/** Single explicit config.toml target. Does not discover a home directory or activate models. */
export class CodexConfigEngine {
  private readonly configFile: string;
  private readonly history: PrivateHistory;
  private readonly plans = new WeakMap<ConfigPlan, PreparedPlan>();

  constructor(private readonly options: ConfigEngineOptions) {
    if (![options.configFile, options.allowedConfigDirectory, options.recoveryDirectory].every(isAbsolute)
      || basename(options.configFile) !== "config.toml"
      || resolve(dirname(options.configFile)) !== resolve(options.allowedConfigDirectory)
      || inside(resolve(options.recoveryDirectory), resolve(options.configFile))) {
      throw new ConfigError("invalid-path");
    }
    this.configFile = resolve(options.configFile);
    this.history = new PrivateHistory(resolve(options.recoveryDirectory), options.allowInRepositoryForTests);
  }

  async plan(input: readonly SettingChange[]): Promise<ConfigPlan> {
    const changes = validateChanges(input);
    const before = await snapshot(this.configFile);
    const original = await parseDocument(before.text);
    let edited = original;
    const fields: (readonly string[])[] = [];
    const createdTables: (readonly string[])[] = [];
    const conflicts: string[] = [];
    const diff: string[] = [];
    for (const change of changes) {
      const previous = fieldFingerprint(original, change.path);
      if (previous === valueFingerprint(change.value)) { continue; }
      const name = change.path.join(".");
      if (previous !== undefined && !change.replaceExisting) {
        conflicts.push(`${name}: explicit replacement is required.`);
      }
      fields.push(change.path);
      diff.push(`- ${name}: ${previous === undefined ? "(absent)" : "[REDACTED VALUE]"}`, `+ ${name}: ${change.value === undefined ? "(absent)" : "[REDACTED VALUE]"}`);
      const result = await editField(edited, change.path, change.value === undefined ? undefined : renderValue(change.value));
      edited = result.document;
      createdTables.push(...result.createdTables);
    }
    if (Buffer.byteLength(edited.text, "utf8") > MAX_CONFIG_BYTES) { throw new ConfigError("invalid-change"); }
    const file = Object.freeze({ path: redactText(this.configFile), expectedRevision: before.revision, changedFields: Object.freeze(fields.map((field) => field.join("."))), redactedDiff: diff.join("\n") });
    const plan: ConfigPlan = Object.freeze({
      id: randomUUID(), client: "codex-cli", files: Object.freeze([file]), conflicts: Object.freeze(conflicts),
      restartInstructions: Object.freeze(["Restart the affected Codex interface after applying reviewed settings. No live model test is implied."]),
    });
    this.plans.set(plan, { before, after: edited.text, fields: Object.freeze(fields), createdTables: Object.freeze(createdTables) });
    return plan;
  }

  async apply(plan: ConfigPlan): Promise<ApplyResult> {
    const prepared = this.plans.get(plan);
    if (!prepared) { return { status: "failed", diagnostics: [diagnostic(new ConfigError("invalid-plan"))] }; }
    this.plans.delete(plan); // Single use, including conflict/failure paths.
    if (plan.conflicts.length) { return { status: "conflict", diagnostics: [diagnostic(new ConfigError("conflict"))] }; }
    let record: RecoveryManifest | undefined;
    let commitStarted = false;
    try {
      return await withConfigLock(this.configFile, async () => {
        const current = await snapshot(this.configFile);
        if (!sameSnapshot(current, prepared.before)) { throw new ConfigError("conflict"); }
        await parseDocument(current.text);
        if (!prepared.fields.length) { return { status: "unchanged", diagnostics: [] }; }
        record = {
          schemaVersion: 1, id: randomUUID(), target: this.configFile, beforeExists: current.exists,
          beforeHash: digest(current.text), appliedHash: digest(prepared.after), fields: prepared.fields,
          pending: prepared.fields, createdTables: prepared.createdTables, state: "prepared",
        };
        await this.history.create(record, current.text, prepared.after);
        // Private snapshots and a prepared manifest exist before any target replacement.
        commitStarted = true;
        await atomicReplace(this.configFile, current, prepared.after, this.options.writeHooks);
        await parseDocument((await snapshot(this.configFile)).text);
        await this.history.update({ ...record, state: "applied" });
        return { status: "applied", changeId: record.id, diagnostics: [] };
      });
    } catch (error) {
      const conflict = error instanceof ConfigError && ["conflict", "busy"].includes(error.code);
      return { status: conflict ? "conflict" : commitStarted ? "recovery-required" : "failed", ...(record ? { changeId: record.id } : {}), diagnostics: [diagnostic(error)] };
    }
  }

  async rollback(changeId: string): Promise<RollbackResult> {
    let commitStarted = false;
    try {
      return await withConfigLock(this.configFile, async () => {
        const saved = await this.history.load(changeId, this.configFile);
        const { manifest } = saved;
        if (manifest.state === "restored") { return { status: "restored", conflicts: [], diagnostics: [] }; }
        const before = await parseDocument(saved.before);
        const applied = await parseDocument(saved.applied);
        const snapshotBefore = await snapshot(this.configFile);
        const current = await parseDocument(snapshotBefore.text);
        let edited = current;
        const pending: (readonly string[])[] = [];
        const startsWith = (value: readonly (string | number)[], prefix: readonly string[]) => value.length >= prefix.length && prefix.every((part, index) => value[index] === part);
        const appliedTables = applied.ast.body[0].body.filter((entry) => entry.type === "TOMLTable");
        const protectedTables = manifest.createdTables.filter((prefix) => {
          const addedField = [...current.fields.values()].some((field) => startsWith(field.path, prefix) && !applied.fields.has(pathKey(field.path)));
          const addedTable = current.ast.body[0].body.some((entry) => entry.type === "TOMLTable" && startsWith(entry.resolvedKey, prefix) && !appliedTables.some((previous) => JSON.stringify(previous.resolvedKey) === JSON.stringify(entry.resolvedKey)));
          const table = current.tables.get(pathKey(prefix));
          const written = applied.tables.get(pathKey(prefix));
          const changedHeader = table && written && current.text.slice(table.range[0], current.text.indexOf("]", table.key.range[1]) + 1) !== applied.text.slice(written.range[0], applied.text.indexOf("]", written.key.range[1]) + 1);
          return addedField || addedTable || changedHeader;
        });
        for (const path of manifest.pending) {
          const actual = fieldFingerprint(current, path);
          const original = fieldFingerprint(before, path);
          if (actual === original) { continue; } // Already restored by the user or a prior attempt.
          if (protectedTables.some((prefix) => startsWith(path, prefix))) { pending.push(path); continue; }
          if (actual !== fieldFingerprint(applied, path) || fieldRaw(current, path) !== fieldRaw(applied, path)) {
            pending.push(path); continue; // Preserve comments/format edits inside a managed value too.
          }
          try {
            edited = (await editField(edited, path, fieldRaw(before, path))).document;
          } catch {
            pending.push(path); // Preserve user layout rather than rewrite an inline table.
          }
        }
        edited = await pruneCreatedTables(edited, applied, manifest.createdTables.filter((path) => !protectedTables.some((prefix) => startsWith(path, prefix))));
        if (edited.text !== snapshotBefore.text) {
          commitStarted = true;
          await atomicReplace(this.configFile, snapshotBefore, edited.text, this.options.writeHooks);
          await parseDocument((await snapshot(this.configFile)).text);
        }
        await this.history.update({ ...manifest, state: pending.length ? "partial" : "restored", pending });
        return { status: pending.length ? "conflict" : "restored", conflicts: pending.map((path) => `${path.join(".")}: later edits were preserved.`), diagnostics: [] };
      });
    } catch (error) {
      const conflict = error instanceof ConfigError && ["conflict", "busy"].includes(error.code);
      return { status: conflict ? "conflict" : commitStarted ? "recovery-required" : "failed", conflicts: [], diagnostics: [diagnostic(error)] };
    }
  }
}
