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
  routero-connect models --codex <absolute-codex.exe> --profile <id> --api-root <https-api-root>
  routero-connect connect --config <absolute-config.toml> --recovery <absolute-private-directory> --codex <absolute-codex.exe> --helper <absolute-helper-directory> --profile <id> --api-root <https-api-root> --model <id> [--replace-existing] [--allow-experimental] [--apply --expected-revision <preview-revision>]
  routero-connect doctor --config <absolute-config.toml> --recovery <absolute-private-directory> --codex <absolute-codex.exe> --helper <absolute-helper-directory> [--online --profile <id> --api-root <https-api-root>]
  routero-connect disconnect --config <absolute-config.toml> --recovery <absolute-private-directory> --change-id <uuid> [--apply]
  routero-connect test-model --profile <id> --api-root <https-api-root> --model <id> --confirm-cost
  routero-connect --help

Status, bare doctor, and validate-url make no network requests or client-setting changes.
Explicit credential commands
access Windows Credential Manager. Store reads one key from stdin, never argv.
Credential print writes ONLY the token to stdout; it is intended for client helpers.
Delete removes a profile reference and deletes the key only after its last owner.
Helper stage copies this pinned bundle to an explicit new directory; no install/download.
Models and connect list key-visible models; doctor does so only with --online.
Connect previews by default; --apply requests a reviewed write. Compatibility is mandatory:
the current bundled catalog has NO approved coding model, so connect leaves settings unchanged.
Disconnect --apply restores one recovery transaction without deleting keys/helpers.
Test model requires credit consent and makes one bounded text request, never a coding test.
All workflow paths are explicit and absolute; no live settings are discovered automatically.
Isolated coding validation is a separate opt-in for UAT/openai/gpt-6-luna/Codex 0.172.0 only:
  add --isolated-validation --validation-root <absolute-codex-plugin-validation-directory>
  to models/connect; the config target must be <root>/codex-home/config.toml.
Unknown limits and full lifecycle remain unverified. Ordinary setup is still gated.
Use --credential-ref <id> with profile-based workflow commands for a shared reference.
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
