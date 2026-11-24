import { createDiagnostic, type Diagnostic } from "../../core/diagnostics";

const MESSAGES = {
  "client-changed": "The selected Codex release changed after preview. Review the new executable/version and create a fresh plan.",
  "validation-isolation": "Isolated validation requires an absolute directory named codex-plugin-validation and its codex-home/config.toml target. Normal client configuration is not an allowed validation target.",
  "invalid-arguments": "Invalid Codex workflow arguments. Use --help; never pass a key as an argument.",
  "client-unavailable": "Select an existing absolute codex.exe path. No PATH or shell wrapper is used.",
  "client-version": "Codex CLI 0.157.1 and 0.172.0 have recorded command-auth checks. Select one of these exact versions; model and lifecycle approval remain separate.",
  "helper-unavailable": "The pinned helper or its manifest failed validation. Review its path, version, permissions, and hash; do not overwrite an installed helper.",
  "environment-conflict": "Authentication or Codex override environment variables are set. Start a clean terminal without these overrides; existing login files were left intact.",
  "configuration-conflict": "The selected configuration contains authentication, profile, or feature overrides this adapter cannot safely combine. Review the configuration without deleting existing login data.",
  "compatibility-blocked": "This model is not approved for this key, origin, protocol, and Codex version. No settings were changed. See the compatibility report for required coding evidence.",
  "model-list-invalid": "The gateway returned an invalid or oversized model list. No settings were changed.",
  "catalog-invalid": "Bundled compatibility data could not be validated. No model was activated.",
  "probe-invalid": "The Responses probe did not return the expected completed text response. This does not establish coding compatibility.",
  "cost-consent": "Test model can consume credits. Read the cost notice and supply --confirm-cost for one bounded request; no retries are made.",
  "workflow-failed": "The workflow could not finish. Review the reported recovery ID and diagnostics before retrying; do not delete recovery files.",
} as const;

export class CodexWorkflowError extends Error {
  constructor(readonly code: keyof typeof MESSAGES, readonly diagnostics: readonly Diagnostic[] = []) {
    super(MESSAGES[code]);
    this.name = "CodexWorkflowError";
  }
}

export function workflowDiagnostic(error: unknown): Diagnostic {
  const safe = error instanceof CodexWorkflowError ? error : new CodexWorkflowError("workflow-failed");
  return createDiagnostic({ category: "configuration", outcome: "failed", code: safe.code, message: safe.message });
}
