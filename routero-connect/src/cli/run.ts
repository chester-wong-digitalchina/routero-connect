import { ApiRootError, normalizeApiRoot, projectDiagnostics, READINESS_MESSAGE, createDiagnostic } from "../core";

export interface CliOutput {
  stdout(text: string): void;
  stderr(text: string): void;
}

const HELP = `Routero Connect
Usage:
  routero-connect status
  routero-connect doctor
  routero-connect validate-url <https-api-root>
  routero-connect credential store|print|delete --profile <id> --api-root <https-api-root> [--credential-ref <id>]
  routero-connect credential store --profile <id> --api-root <https-api-root> --replace
  routero-connect credential link --profile <new-id> --from-profile <owner-id> --api-root <https-api-root> --credential-ref <shared-id>
  routero-connect helper stage --destination <new-directory>
  routero-connect --help

No command makes network requests or changes client settings.
Status, doctor, and validate-url are offline checks. Explicit credential commands
access Windows Credential Manager. Store reads one key from stdin, never argv.
Credential print writes ONLY the token to stdout; it is intended for client helpers.
Delete removes a profile reference and deletes the key only after its last owner.
Helper stage copies this pinned bundle to an explicit new directory; no install/download.
Connect and disconnect are not implemented yet.
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
