import { createDiagnostic, type Diagnostic } from "./diagnostics";

export const READINESS_MESSAGE = "Windows credentials, safe configuration editing, and a gated Codex CLI workflow are available. Codex coding compatibility is not yet verified; the bundled catalog permits no model activation.";

/** Offline project readiness; never represents a live connection test. */
export function projectDiagnostics(): readonly Diagnostic[] {
  return [
    createDiagnostic({ category: "configuration", outcome: "not-run", code: "setup-unavailable", message: "Client settings and credentials have not been inspected or changed." }),
    createDiagnostic({ category: "connectivity", outcome: "not-run", code: "offline", message: "No network request was made." }),
    createDiagnostic({ category: "model-list", outcome: "not-run", code: "listing-not-run", message: "The current key's model access has not been checked." }),
    createDiagnostic({ category: "protocol", outcome: "not-run", code: "protocol-not-run", message: "No model or streaming request was made." }),
    createDiagnostic({ category: "real-client", outcome: "warning", code: "compatibility-unverified", message: "Reported Codex coding tasks failed; no complete workflow is verified." }),
  ];
}
