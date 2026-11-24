import { evaluateActivation, type ActivationDecision, type CompatibilityCatalog } from "./compatibility";

export const CODING_VALIDATION_NOTICE = "Isolated experimental validation only: one bounded calculator read/edit/test/follow-up task. Exact context/output limits, full streaming/context behavior and plugin lifecycle are unverified. This is not general model support. Use a dedicated codex-plugin-validation/codex-home, retain private recovery, and review actual charges before another run.";
export const CODING_VALIDATION_RECORD = "codex-cli-01720-uat-gpt6luna-coding-pass-pending-metadata";

/** Explicitly scoped exception based on a recorded real coding loop, not a force flag. */
export function evaluateCodingValidation(catalog: CompatibilityCatalog, input: Parameters<typeof evaluateActivation>[1]): ActivationDecision {
  const ordinary = evaluateActivation(catalog, input);
  if (input.client !== "codex-cli" || input.clientVersion !== "0.172.0" || input.modelId !== "openai/gpt-6-luna"
    || input.apiRoot !== "https://api-uat.routero.ai") { return { ...ordinary, allowed: false, reason: "no-matching-evidence" }; }
  if (ordinary.reason !== "validation-required") { return ordinary; }
  const record = catalog.records.find((row) => row.id === CODING_VALIDATION_RECORD && row.id === ordinary.recordId);
  if (!record || record.status !== "unverified" || record.validation.result !== "partial" || record.capabilities.tools !== true
    || record.continuation.supported !== true || !record.validation.evidence.some((item) => item.kind === "manual" && item.reference === "docs/validation/codex-01720-gpt6luna-success.md")
    || !record.validation.evidence.some((item) => item.kind === "automated" && item.reference === "docs/validation/codex-01720-command-auth.json")) { return ordinary; }
  return { allowed: true, status: "experimental", reason: "isolated-validation-opt-in", recordId: record.id };
}
