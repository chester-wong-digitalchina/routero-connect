import type { ClientAdapter, ClientInfo, ConfigPlan, ConnectionInput, ApplyResult, RollbackResult } from "../contracts";
import { CodexConfigEngine, type ConfigEngineOptions } from "../../config/engine";
import { ConfigError } from "../../config/errors";
import { snapshot } from "../../config/files";
import { parseDocument, fieldFingerprint, valueFingerprint } from "../../config/toml";
import type { SettingChange } from "../../config/changes";
import { evaluateActivation, type CompatibilityCatalog, type ActivationDecision } from "../../core/compatibility";
import { createConnectionProfile, type ConnectionProfile } from "../../core/profiles";
import { createDiagnostic, type Diagnostic } from "../../core/diagnostics";
import { CredentialError } from "../../credentials/errors";
import type { GatewayAccess } from "./gateway";
import { assertCleanEnvironment, detectCodex, inspectHelper, type HelperInfo } from "./runtime";
import { CodexWorkflowError, workflowDiagnostic } from "./errors";
import { isInspectedCodexVersion } from "../../core/codex-versions";
import { basename, isAbsolute, join, resolve } from "node:path";
import { CODING_VALIDATION_NOTICE, evaluateCodingValidation } from "../../core/coding-validation";

export interface CodexAdapterOptions {
  readonly engine: ConfigEngineOptions;
  readonly executable: string;
  readonly helperDirectory: string;
  readonly replaceExisting?: boolean;
  readonly allowExperimental?: boolean;
  readonly codingValidationRoot?: string;
}
export interface CodexDependencies {
  readonly catalog: CompatibilityCatalog;
  readonly gateway: GatewayAccess;
  readonly environment: () => NodeJS.ProcessEnv;
  readonly detect?: (path: string) => Promise<ClientInfo>;
  readonly helper?: (directory: string) => Promise<HelperInfo>;
}

function safeDiagnostic(error: unknown): Diagnostic {
  if (error instanceof CredentialError || error instanceof ConfigError) {
    return createDiagnostic({ category: "configuration", outcome: "failed", code: error.code, message: error.message });
  }
  return workflowDiagnostic(error);
}

/** Explicit single-file adapter. Login data, sandbox, tools, and permissions remain Codex-owned. */
export class CodexCliAdapter implements ClientAdapter {
  private readonly engine: CodexConfigEngine;
  private readonly plans = new WeakMap<ConfigPlan, { profile: ConnectionProfile; modelId: string; version: string; clientPath?: string; helperHash: string; enginePlan: ConfigPlan }>();

  constructor(private readonly options: CodexAdapterOptions, private readonly dependencies: CodexDependencies) {
    this.assertIsolation();
    this.engine = new CodexConfigEngine(options.engine);
  }

  private assertIsolation(): void {
    const root = this.options.codingValidationRoot;
    if (root === undefined) { return; }
    if (!isAbsolute(root) || basename(resolve(root)) !== "codex-plugin-validation"
      || resolve(this.options.engine.configFile) !== join(resolve(root), "codex-home", "config.toml")) { throw new CodexWorkflowError("validation-isolation"); }
  }

  async detect(): Promise<ClientInfo> {
    const info = await (this.dependencies.detect ?? detectCodex)(this.options.executable);
    if (!info.installed || info.client !== "codex-cli" || !isInspectedCodexVersion(info.version)) { throw new CodexWorkflowError("client-version"); }
    return info;
  }

  private decision(profile: ConnectionProfile, modelId: string, version: string, visible: readonly string[]): ActivationDecision {
    return (this.options.codingValidationRoot ? evaluateCodingValidation : evaluateActivation)(this.dependencies.catalog, { modelId, client: "codex-cli", clientVersion: version,
      apiRoot: profile.api.origin, protocol: "responses", visibleModelIds: visible, allowExperimental: this.options.allowExperimental });
  }

  async models(profile: ConnectionProfile) {
    const client = await this.detect();
    assertCleanEnvironment(this.dependencies.environment());
    const visible = await this.dependencies.gateway.listModels(profile);
    return visible.map((modelId) => ({ modelId, ...this.decision(profile, modelId, client.version!, visible) }));
  }

  private async inspectConfiguration(): Promise<string> {
    const selected = await snapshot(this.options.engine.configFile);
    const document = await parseDocument(selected.text);
    for (const field of document.fields.values()) {
      const path = field.path;
      // Fail closed on profile overrides, top-level auth policy, or feature toggles.
      // Do not delete auth.json or rewrite another provider to resolve precedence.
      if (["profiles", "profile", "forced_login_method", "forced_chatgpt_workspace_id", "model_catalog_json", "model_context_window", "model_auto_compact_token_limit", "features", "web_search"].includes(path[0])) { throw new CodexWorkflowError("configuration-conflict"); }
      if (path[0] === "model_providers" && path[1] === "routero") {
        const allowed = path[2] === "auth"
          ? path.length === 3 || (path.length === 4 && ["command", "args", "timeout_ms", "refresh_interval_ms"].includes(path[3]))
          : path.length === 3 && ["name", "base_url", "wire_api", "supports_websockets", "request_max_retries", "stream_max_retries", "stream_idle_timeout_ms", "env_key", "requires_openai_auth"].includes(path[2]);
        if (!allowed) { throw new CodexWorkflowError("configuration-conflict"); }
      }
    }
    for (const table of document.ast.body[0].body) {
      if (table.type === "TOMLTable" && ["profiles", "features"].includes(String(table.resolvedKey[0]))) { throw new CodexWorkflowError("configuration-conflict"); }
    }
    return selected.revision;
  }

  async plan(input: ConnectionInput): Promise<ConfigPlan> {
    this.assertIsolation();
    // Never trust a caller's pre-computed ActivationDecision; recalculate it.
    const profile = createConnectionProfile({ id: input.profile.id, name: input.profile.name, apiRoot: input.profile.api.origin, credential: input.profile.credential });
    const client = await this.detect();
    assertCleanEnvironment(this.dependencies.environment());
    const early = this.decision(profile, input.modelId, client.version!, [input.modelId]);
    if (!early.allowed) { throw new CodexWorkflowError("compatibility-blocked"); }
    const inspectedRevision = await this.inspectConfiguration();
    const helper = await (this.dependencies.helper ?? inspectHelper)(this.options.helperDirectory);
    const visible = await this.dependencies.gateway.listModels(profile);
    if (!this.decision(profile, input.modelId, client.version!, visible).allowed) { throw new CodexWorkflowError("compatibility-blocked"); }
    const changes: SettingChange[] = [];
    const add = (path: string[], value: SettingChange["value"]) => changes.push({ path, value, replaceExisting: this.options.replaceExisting });
    add(["model"], input.modelId);
    add(["model_provider"], "routero");
    const provider = ["model_providers", "routero"];
    for (const [key, value] of Object.entries({ name: "Routero", base_url: profile.api.apiBase, wire_api: "responses", supports_websockets: false, request_max_retries: 0, stream_max_retries: 0 })) { add([...provider, key], value); }
    add([...provider, "env_key"], undefined);
    add([...provider, "requires_openai_auth"], undefined);
    add([...provider, "auth", "command"], helper.nodeExecutable);
    add([...provider, "auth", "args"], [helper.helperScript, "credential", "print", "--profile", profile.id, "--api-root", profile.api.origin, "--credential-ref", profile.credential.id]);
    add([...provider, "auth", "timeout_ms"], 10000);
    // Explicitly remove an existing refresh override rather than retain unknown behavior.
    add([...provider, "auth", "refresh_interval_ms"], undefined);
    const enginePlan = await this.engine.plan(changes);
    if (enginePlan.files[0].expectedRevision !== inspectedRevision) { throw new ConfigError("conflict"); }
    const plan = this.options.codingValidationRoot ? Object.freeze({ ...enginePlan, restartInstructions: Object.freeze([...enginePlan.restartInstructions, CODING_VALIDATION_NOTICE, `In a separate test terminal, set CODEX_HOME to ${join(resolve(this.options.codingValidationRoot), "codex-home")} and run codex --no-daemon from a fresh disposable calculator. Keep the normal VS Code environment unchanged.`]) }) : enginePlan;
    this.plans.set(plan, { profile, modelId: input.modelId, version: client.version!, clientPath: client.executablePath, helperHash: helper.sha256, enginePlan });
    return plan;
  }

  async apply(plan: ConfigPlan): Promise<ApplyResult> {
    const saved = this.plans.get(plan);
    this.plans.delete(plan);
    if (!saved) { return { status: "failed", diagnostics: [workflowDiagnostic(new CodexWorkflowError("invalid-arguments"))] }; }
    try {
      this.assertIsolation();
      assertCleanEnvironment(this.dependencies.environment());
      const client = await this.detect();
      const helper = await (this.dependencies.helper ?? inspectHelper)(this.options.helperDirectory);
      if (client.version !== saved.version || client.executablePath !== saved.clientPath) { throw new CodexWorkflowError("client-changed"); }
      if (helper.sha256 !== saved.helperHash) { throw new CodexWorkflowError("helper-unavailable"); }
      const visible = await this.dependencies.gateway.listModels(saved.profile);
      if (!this.decision(saved.profile, saved.modelId, client.version!, visible).allowed) { throw new CodexWorkflowError("compatibility-blocked"); }
      return await this.engine.apply(saved.enginePlan);
    } catch (error) { return { status: "failed", diagnostics: [safeDiagnostic(error), ...(error instanceof CodexWorkflowError ? error.diagnostics : [])] }; }
  }

  async diagnose(): Promise<readonly Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];
    for (const [code, action] of [
      ["client-ready", () => this.detect()],
      ["helper-ready", () => (this.dependencies.helper ?? inspectHelper)(this.options.helperDirectory)],
      ["environment-ready", async () => assertCleanEnvironment(this.dependencies.environment())],
      ["configuration-readable", () => this.inspectConfiguration()],
    ] as const) {
      try { await action(); diagnostics.push(createDiagnostic({ category: "configuration", outcome: "passed", code, message: "The selected local prerequisite passed inspection; no inference was run." })); }
      catch (error) { diagnostics.push(safeDiagnostic(error)); }
    }
    const document = await parseDocument((await snapshot(this.options.engine.configFile)).text).catch(() => undefined);
    diagnostics.push(createDiagnostic({ category: "configuration", outcome: "not-run", code: document && fieldFingerprint(document, ["model_provider"]) === valueFingerprint("routero") ? "routero-selected-not-verified" : "routero-not-selected", message: "Configuration selection alone does not establish a working connection. Use explicit online listing and recorded coding acceptance." }));
    diagnostics.push(createDiagnostic({ category: "protocol", outcome: "not-run", code: "inference-not-run", message: "No model request was made. Test model requires explicit credit consent and does not validate tool use." }));
    diagnostics.push(createDiagnostic({ category: "real-client", outcome: "warning", code: "coding-unverified", message: "A manual GPT-6 Luna coding loop passed; exact model limits and full plugin-managed validation remain pending. This local diagnostic does not mark a model supported." }));
    return diagnostics;
  }

  rollback(changeId: string): Promise<RollbackResult> { return this.engine.rollback(changeId); }
}
