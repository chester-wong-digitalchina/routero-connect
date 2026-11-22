import { dirname, isAbsolute } from "node:path";
import type { CliOutput } from "./run";
import { createConnectionProfile, createCredentialReference } from "../core/profiles";
import { evaluateActivation, parseCompatibilityCatalog } from "../core/compatibility";
import { redactDetails } from "../core/diagnostics";
import { CodexCliAdapter, type CodexAdapterOptions, type CodexDependencies } from "../adapters/codex/adapter";
import { CodexWorkflowError } from "../adapters/codex/errors";
import { validChangeId } from "../config/history";
import { assertCleanEnvironment, detectCodex } from "../adapters/codex/runtime";
import { ConfigError } from "../config/errors";

export const COST_NOTICE = "Test model sends one Responses request (up to 64 output tokens) and may consume credits. No retries or tool execution. This is not a coding compatibility test or a server-side dollar cap.";

type CommandName = "connect" | "models" | "doctor" | "disconnect" | "test-model";
export interface CodexCommand {
  readonly name: CommandName;
  readonly values: ReadonlyMap<string, string>;
  readonly flags: ReadonlySet<string>;
}
const COMMON = ["--config", "--recovery", "--codex", "--helper"];
const PROFILE = ["--profile", "--api-root", "--credential-ref"];
const OPTIONS: Record<CommandName, { values: readonly string[]; flags: readonly string[]; required: readonly string[] }> = {
  connect: { values: [...COMMON, ...PROFILE, "--model", "--expected-revision"], flags: ["--apply", "--replace-existing", "--allow-experimental"], required: [...COMMON, "--profile", "--api-root", "--model"] },
  models: { values: ["--codex", ...PROFILE], flags: ["--allow-experimental"], required: ["--codex", "--profile", "--api-root"] },
  doctor: { values: [...COMMON, ...PROFILE], flags: ["--online"], required: COMMON },
  disconnect: { values: ["--config", "--recovery", "--change-id"], flags: ["--apply"], required: ["--config", "--recovery", "--change-id"] },
  "test-model": { values: [...PROFILE, "--model"], flags: ["--confirm-cost"], required: ["--profile", "--api-root", "--model"] },
};

export function isCodexCommand(args: readonly string[]): boolean {
  return ["connect", "models", "disconnect", "test-model"].includes(args[0]) || (args[0] === "doctor" && args.length > 1);
}

export function parseCodexCommand(args: readonly string[]): CodexCommand {
  const name = args[0] as CommandName;
  if (!Object.hasOwn(OPTIONS, name)) { throw new CodexWorkflowError("invalid-arguments"); }
  const specification = OPTIONS[name];
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let index = 1; index < args.length; index++) {
    const key = args[index];
    if (values.has(key) || flags.has(key)) { throw new CodexWorkflowError("invalid-arguments"); }
    if (specification.flags.includes(key)) { flags.add(key); }
    else if (specification.values.includes(key) && args[index + 1] && !args[index + 1].startsWith("--")) {
      const value = args[++index];
      if (value.length > 4096 || /[\u0000-\u001f\u007f]|\bsk-|\bBearer\s/iu.test(value)) { throw new CodexWorkflowError("invalid-arguments"); }
      values.set(key, value);
    } else { throw new CodexWorkflowError("invalid-arguments"); }
  }
  if (specification.required.some((key) => !values.has(key))) { throw new CodexWorkflowError("invalid-arguments"); }
  for (const key of COMMON) { if (values.has(key) && !isAbsolute(values.get(key)!)) { throw new CodexWorkflowError("invalid-arguments"); } }
  if (name === "disconnect" && !validChangeId(values.get("--change-id")!)) { throw new CodexWorkflowError("invalid-arguments"); }
  if (name === "doctor" && flags.has("--online") && (!values.has("--profile") || !values.has("--api-root"))) { throw new CodexWorkflowError("invalid-arguments"); }
  if (name === "connect" && ((flags.has("--apply") && !values.has("--expected-revision")) || (values.has("--expected-revision") && !/^(?:absent|[a-f0-9]{64})$/u.test(values.get("--expected-revision")!)))) { throw new CodexWorkflowError("invalid-arguments"); }
  if (values.has("--model") && !/^[a-z0-9][a-z0-9/_.:-]{0,199}$/iu.test(values.get("--model")!)) { throw new CodexWorkflowError("invalid-arguments"); }
  if (PROFILE.some((key) => values.has(key))) {
    try {
      const id = values.get("--profile")!;
      const apiRoot = values.get("--api-root")!;
      createConnectionProfile({ id, name: id, apiRoot, credential: createCredentialReference(values.get("--credential-ref") ?? id, apiRoot) });
    } catch { throw new CodexWorkflowError("invalid-arguments"); }
  }
  return { name, values, flags };
}

/** Fixed bundled data only: no CLI-provided catalog or compatibility bypass. */
export function bundledCatalog() {
  try { return parseCompatibilityCatalog(require("../../compatibility/models.json")); }
  catch { throw new CodexWorkflowError("catalog-invalid"); }
}

export async function executeCodexCommand(command: CodexCommand, dependencies: CodexDependencies, output: CliOutput): Promise<number> {
  const { name, values, flags } = command;
  const emit = (value: unknown) => output.stdout(JSON.stringify(redactDetails(value), null, 2));
  const makeProfile = () => {
    const id = values.get("--profile")!;
    const apiRoot = values.get("--api-root")!;
    return createConnectionProfile({ id, name: id, apiRoot, credential: createCredentialReference(values.get("--credential-ref") ?? id, apiRoot) });
  };
  const configFile = values.get("--config") ?? "";
  const options: CodexAdapterOptions = {
    engine: { configFile, allowedConfigDirectory: dirname(configFile), recoveryDirectory: values.get("--recovery") ?? "" },
    executable: values.get("--codex") ?? "", helperDirectory: values.get("--helper") ?? "",
    replaceExisting: flags.has("--replace-existing"), allowExperimental: flags.has("--allow-experimental"),
  };
  if (name === "test-model") {
    output.stdout(COST_NOTICE);
    if (!flags.has("--confirm-cost")) { throw new CodexWorkflowError("cost-consent"); }
    emit(await dependencies.gateway.testModel(makeProfile(), values.get("--model")!));
    return 0;
  }
  if (name === "models") {
    // Listing does not inspect or instantiate any configuration target.
    const detect = dependencies.detect ?? detectCodex;
    const client = await detect(options.executable);
    if (!client.installed || client.client !== "codex-cli" || client.version !== "0.157.1") { throw new CodexWorkflowError("client-version"); }
    assertCleanEnvironment(dependencies.environment());
    const profile = makeProfile();
    const ids = await dependencies.gateway.listModels(profile);
    emit({ scope: "key-visible-models", inference: "not-run", total: ids.length, displayed: Math.min(ids.length, 50), models: ids.slice(0, 50).map((modelId) => ({ modelId, ...evaluateActivation(dependencies.catalog, {
      modelId, apiRoot: profile.api.origin, client: "codex-cli", clientVersion: client.version!, protocol: "responses", visibleModelIds: ids, allowExperimental: options.allowExperimental,
    }) })) });
    return 0;
  }
  const adapter = new CodexCliAdapter(options, dependencies);
  if (name === "disconnect") {
    if (!flags.has("--apply")) {
      emit({ scope: "disconnect-confirmation", changeId: values.get("--change-id"), message: "Supply --apply to restore this transaction's unchanged managed fields. Later edits are preserved; credentials and helper files are retained. Restore model switches in reverse order. No changes made." });
      return 0;
    }
    const result = await adapter.rollback(values.get("--change-id")!);
    emit(result);
    return result.status === "restored" ? 0 : 1;
  }
  if (name === "doctor") {
    const diagnostics = [...await adapter.diagnose()];
    let models;
    if (flags.has("--online")) { models = await adapter.models(makeProfile()); }
    emit({ scope: flags.has("--online") ? "local-and-model-list" : "local-only", diagnostics, ...(models ? { totalModels: models.length, displayedModels: Math.min(models.length, 50), models: models.slice(0, 50) } : {}), codingCompatibility: "unverified" });
    // Even passing prerequisites do not constitute a supported coding workflow.
    return 1;
  }
  const profile = makeProfile();
  const plan = await adapter.plan({ profile, modelId: values.get("--model")!, compatibility: { allowed: false, status: "unverified", reason: "validation-required" } });
  emit({ scope: "connection-preview", selection: { origin: profile.api.origin, modelId: values.get("--model"), profile: profile.id }, plan });
  if (!flags.has("--apply")) { return plan.conflicts.length ? 1 : 0; }
  if (values.get("--expected-revision") !== plan.files[0].expectedRevision) { throw new ConfigError("conflict"); }
  const result = await adapter.apply(plan);
  emit({ ...result, recoveryDirectory: options.engine.recoveryDirectory, restartInstructions: plan.restartInstructions });
  return ["applied", "unchanged"].includes(result.status) ? 0 : 1;
}
