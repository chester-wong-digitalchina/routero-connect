import { ApiRootError, normalizeApiRoot, projectDiagnostics, READINESS_MESSAGE, createDiagnostic } from "../core";

export interface CliOutput {
  stdout(text: string): void;
  stderr(text: string): void;
}

const HELP = `Routero Connect (offline foundation)
Usage:
  routero-connect status
  routero-connect doctor
  routero-connect validate-url <https-api-root>
  routero-connect --help

No command makes network requests or reads/writes credentials or client settings.
Connect, disconnect, and credential installation are not implemented yet.
Do not pass API keys or URLs containing credentials as command arguments.`;

export function runCli(args: readonly string[], output: CliOutput): number {
  const [command] = args;
  if ((args.length === 0) || (args.length === 1 && (command === "--help" || command === "help"))) {
    output.stdout(HELP);
    return 0;
  }
  if (args.length === 1 && command === "status") {
    output.stdout(READINESS_MESSAGE);
    return 0;
  }
  if (args.length === 1 && command === "doctor") {
    output.stdout(JSON.stringify({ scope: "offline-project-readiness", diagnostics: projectDiagnostics() }, null, 2));
    // A report was generated, but setup is not ready. No live health pass implied.
    return 1;
  }
  if (args.length === 2 && command === "validate-url") {
    try {
      output.stdout(JSON.stringify(normalizeApiRoot(args[1]), null, 2));
      return 0;
    } catch (error) {
      if (!(error instanceof ApiRootError)) {
        throw error;
      }
      output.stderr(JSON.stringify(createDiagnostic({ category: "configuration", outcome: "failed", code: "invalid-api-root", message: error.message })));
      return 2;
    }
  }
  output.stderr("Unknown command or invalid arguments. Run routero-connect --help. Do not pass credentials.");
  return 2;
}
