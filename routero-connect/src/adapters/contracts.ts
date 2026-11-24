import type { ConnectionProfile } from "../core/profiles";
import type { Diagnostic } from "../core/diagnostics";
import type { ClientId, ActivationDecision } from "../core/compatibility";

export interface ClientInfo {
  readonly client: ClientId;
  readonly installed: boolean;
  readonly version?: string;
  readonly executablePath?: string;
}

export interface ConnectionInput {
  readonly profile: ConnectionProfile;
  readonly modelId: string;
  readonly compatibility: ActivationDecision;
}

/** Future implementations must retain only redacted previews and secret references. */
export interface ConfigPlan {
  readonly id: string;
  readonly client: ClientId;
  readonly files: readonly {
    readonly path: string;
    readonly expectedRevision: string;
    readonly changedFields: readonly string[];
    readonly redactedDiff: string;
  }[];
  readonly conflicts: readonly string[];
  readonly restartInstructions: readonly string[];
}

export interface ApplyResult {
  readonly status: "applied" | "unchanged" | "conflict" | "failed" | "recovery-required";
  readonly changeId?: string;
  readonly diagnostics: readonly Diagnostic[];
}

export interface RollbackResult {
  readonly status: "restored" | "conflict" | "failed" | "recovery-required";
  readonly conflicts: readonly string[];
  readonly diagnostics: readonly Diagnostic[];
}

/** Contract only. No configuration writer or real adapter ships in Phase 3. */
export interface ClientAdapter {
  detect(): Promise<ClientInfo>;
  plan(input: ConnectionInput): Promise<ConfigPlan>;
  apply(plan: ConfigPlan): Promise<ApplyResult>;
  diagnose(): Promise<readonly Diagnostic[]>;
  rollback(changeId: string): Promise<RollbackResult>;
}
