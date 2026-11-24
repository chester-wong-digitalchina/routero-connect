import { createDiagnostic, type Diagnostic } from "./diagnostics";

export const READINESS_MESSAGE = "A basic manual coding task passed for Codex 0.172.0 with openai/gpt-6-luna. Full plugin coding compatibility is not yet verified; unknown model limits and remaining validation keep activation blocked.";

/** Offline project readiness; never represents a live connection test. */
export function projectDiagnostics(): readonly Diagnostic[] {
  return [
    createDiagnostic({ category: "configuration", outcome: "not-run", code: "setup-unavailable", message: "Client settings and credentials have not been inspected or changed." }),
    createDiagnostic({ category: "connectivity", outcome: "not-run", code: "offline", message: "No network request was made." }),
    createDiagnostic({ category: "model-list", outcome: "not-run", code: "listing-not-run", message: "The current key's model access has not been checked." }),
    createDiagnostic({ category: "protocol", outcome: "not-run", code: "protocol-not-run", message: "No model or streaming request was made." }),
    createDiagnostic({ category: "real-client", outcome: "warning", code: "compatibility-unverified", message: "The manual GPT-6 Luna calculator task passed. Exact model limits, streaming/context and plugin-managed credential/lifecycle evidence remain incomplete; earlier DeepSeek failures are retained separately." }),
  ];
}
