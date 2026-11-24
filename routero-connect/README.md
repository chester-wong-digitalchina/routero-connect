# Routero Connect

Routero Connect is an incremental VS Code extension with a companion CLI for configuring existing coding clients to use Routero. Codex remains responsible for code editing, tool execution, approvals, and sandboxing.

## Current status

**Maintainer starting point:** [handoff, validation results and remaining work](docs/handoff.md), with a consolidated [design decision record](docs/design-decisions.md). Phase reports describe historical checkpoints; the handoff identifies the latest validated scope.

**Build 0.0.5 provides a working, narrowly validated Codex CLI integration with manual prerequisites. Installing the VSIX alone does not provide a configured coding assistant.**

The validated combination is **local Windows + Codex CLI 0.172.0 + Routero UAT (`https://api-uat.routero.ai`) + `openai/gpt-6-luna`**. Configuration generated through the shared plugin setup controller authenticated using the stored Windows credential/helper, read files, added subtraction and four tests, passed all six tests, and completed a resumed conversation with another passing test run.

This live setup used the actual shared controller with predetermined authorized selections, rather than GUI clicks. The packaged extension separately passed activation and progress-report smoke checks. A complete fresh-user graphical setup has not yet been independently verified. See the [isolated setup validation evidence](docs/validation/setup-takeover-005.md).

## Available features

| Command | Current capability |
| --- | --- |
| **Routero: Store Key for Codex** | Explicitly stores a Routero key in Windows Credential Manager through masked entry; the key is not saved in project files or Codex configuration. |
| **Routero: Stage Codex Credential Helper** | Creates an independent pinned helper using an existing Node.js installation; existing helper installations are not overwritten. |
| **Routero: Connect** | Lists key-visible models, checks compatibility, previews configuration changes, and applies an explicitly reviewed plan. The recorded Luna combination is available through isolated experimental validation. |
| **Routero: Doctor** | Checks local prerequisites and configuration; explicitly requested online checks can list model access. Local checks do not run inference or establish coding approval. |
| **Routero: Test Model** | Sends one bounded text request after separate credit consent; a successful reply does not approve tool use or coding compatibility. |
| **Routero: Disconnect** | Restores unchanged plugin-managed fields from a recorded transaction, preserving later edits and retaining keys/helpers. |
| **Routero: Integration Status** | Opens the packaged progress report without contacting a model. |

The wizard and standalone CLI share the same configuration engine, compatibility checks, redacted reporting, reviewed apply, and recovery transactions. Activation alone does not read credentials, contact Routero, stage a helper, or change Codex settings.

## Manual prerequisites for a new installation

The VSIX contains the extension and bundled setup CLI. It does **not** install Node.js or Codex, supply a Routero account/key, configure gateway policies, or complete Windows sandbox setup. A fresh installation requires:

1. **Local Windows and VS Code 1.146.0 or later in 1.x**, with a trusted local workspace. Remote SSH, WSL, containers, virtual workspaces, macOS, and Linux are not enabled.
2. **A separately installed Node.js 24.18.0 or later in Node 24.** Setup requires the actual absolute `node.exe` path; VS Code's Electron executable and npm wrappers are not substitutes.
3. **A separately installed Codex CLI 0.172.0** for the validated Luna coding workflow. Version 0.157.1 also has recorded command-auth checks, but not this Luna coding validation. Other versions require separate evidence.
4. **A Routero UAT key with access to `openai/gpt-6-luna`.** Gateway policies and model availability must already be configured manually. Credentials and references for UAT and production remain separate; a visible model alone is not proof of compatibility.
5. **Explicit key storage and helper staging.** Run **Store Key for Codex**, then **Stage Codex Credential Helper**. Select Node and a new private helper directory outside the extension installation. Keep the owning profile/reference labels and Node path consistent. New staging uses helper 0.0.7; reviewed helpers 0.0.3–0.0.6 remain accepted and need no automatic upgrade.
6. **An isolated validation home and private recovery storage.** Prepare a directory named `codex-plugin-validation` with an existing `codex-home` child. Connect derives `codex-home/config.toml`. Select a private recovery directory outside Git, review the plan, explicitly opt into isolated validation, and retain the change ID and recovery location.
7. **Native Codex Windows sandbox setup and a separate test terminal.** Select the isolated `CODEX_HOME`, launch from a disposable project with `codex --no-daemon`, and complete the native sandbox setup if prompted. The successful run used the elevated Windows sandbox. Normal VS Code/Codex sessions must retain their existing environment and configuration.

The detailed [installation/setup guide](docs/vscode-setup.md) and [isolated validation procedure](docs/plugin-parity-test.md) describe the selections and commands. Python is required only for the documented calculator acceptance test, not for extension installation. Building from source additionally requires the development tooling below.

## Current scope and remaining limitations

- **Isolated experimental CLI validation only:** exact model context/output limits remain unavailable, so ordinary model approval stays blocked. No limits are invented, and validation does not enable arbitrary models, origins, or client versions.
- **No Codex IDE adapter:** configuring the CLI does not configure or validate the Codex VS Code extension. Claude Code, native VS Code Chat, other coding clients, and other platforms remain planned.
- **No automatic dependency installation or complete onboarding:** accounts, policies, model access, Node, Codex, paths, and native sandbox setup require manual preparation.
- **Limited acceptance evidence:** the basic coding/continuation task passed for the recorded combination. Fresh-user GUI setup, broader helper/recovery lifecycle, long-context behavior, authoritative model limits, and actual billing reconciliation remain further work. DeepSeek/title failures remain separate documented findings.
- **Internal package:** version 0.0.5 is distributed as a local VSIX, not a Marketplace release or a claim of production readiness. Existing configured validation environments can reuse their stored key/helper; downloading the same VSIX on a fresh machine does not recreate that setup.

## Try the offline checks

From the project root, build with the documented Node/npm versions:

```powershell
npm ci
npm run compile
node dist/cli.js status
node dist/cli.js validate-url https://api-uat.routero.ai/v1
node dist/cli.js doctor
```

`status` describes project readiness. `validate-url` checks an address and shows the normalized endpoints, without contacting them. The bare offline `doctor` reports checks that have not run and intentionally exits with code 1; this does not indicate that the implemented setup commands are unavailable. These three checks do not read credentials or client settings. Separate `credential` commands explicitly access the Windows store; `credential print` deliberately outputs the token for a client helper. Never pass a key as an argument or include helper output in logs.

## Try the configuration safety demo

```powershell
npm run demo:config
```

The demo creates a dummy file under ignored `tmp/validation/`, prints a redacted preview, applies fixture settings, then shows how rollback preserves a simulated later edit. An expected rollback conflict demonstrates safe behavior. It does not use live client settings, credentials, or gateway. The Phase 6 CLI separately enforces compatibility before connecting; the demo is not a way to activate an unverified model.

## Codex CLI workflow

Run `node dist/cli.js --help` for explicit-path commands. Local `doctor` does not access credentials or the gateway. `models` and `doctor --online` explicitly list the selected key's model access without inference. `test-model` requires a credit notice and `--confirm-cost` before one bounded text request; it cannot approve a coding workflow.

`connect` previews by default. Apply requires the reviewed revision and explicit replacement consent for existing values; unsupported combinations leave settings unchanged. `disconnect` restores one managed transaction while preserving later edits and retaining credentials/helpers. See the [CLI instructions](docs/codex-cli.md) for exact prerequisites, limitations, restart, model-switch order, and recovery. Phase 6's full live acceptance remains pending.

## Internal VS Code package

`npm run package:internal` creates `dist/routero-connect-0.0.5-win32-x64.vsix`, the independent `dist/internal-cli/` recovery tool, and `dist/internal-artifacts.json` with hashes and inspected archive contents. It does not install or publish them. Read the [installation guide](docs/vscode-setup.md) before isolated manual installation; broader coding/IDE acceptance remains pending. The extension requires local Windows, a trusted workspace, VS Code 1.146.0+, and a separately selected Node 24.18+ executable.

## Development

Tested tooling: **Node.js 24.18.0 / npm 11.16.0**, with direct dependencies pinned to the lockfile. The manifest still targets VS Code `^1.146.0`; a build is not proof of UI compatibility. Use `npm.cmd` if PowerShell blocks `npm.ps1`.

- `npm test` runs type checking, lint, and offline TypeScript unit tests; it does not download Electron or contact Routero.
- `npm run compile` builds both development bundles.
- `npm run package` builds both production bundles; it does not create a VSIX or publish a CLI package.
- `npm run test:vscode` is the separate opt-in VS Code test runner. Its scaffold test is not full UI acceptance.

Read [development instructions](docs/development.md), [architecture](docs/architecture.md), [compatibility data](compatibility/README.md), and the [roadmap](docs/roadmap.md). See the [Phase 4 results](docs/phase-4-validation.md) for the exact credential test coverage. Phase 2's [manual guide](docs/phase-2-manual-validation.md), [technical errors](docs/validation/codex-manual-blockers.md), and [validation tools](scripts/validation/README.md) remain available for a targeted retest, not repeated blind retries.

## Boundaries

- Gateway repository access is read-only. Source and test artifacts stay inside this project; native store/installation checks require explicit authorization.
- No API keys belong in repository files, subprocess arguments, logs, fixtures, or documentation.
- The CLI adapter is implemented with compatibility checks; persistent profile management and a validated Codex IDE adapter remain later work. Development validation uses project-local fixtures. User-level Codex settings stay untouched.
- Earlier native validation installed a helper and created/removed a dummy Windows credential. The authorized isolated setup validation subsequently reused an existing real stored credential and helper, created private recovery outside Git, and installed corrective extension 0.0.5. These were explicit setup actions; activation does not perform them. The normal Codex configuration remained unchanged.
- Live inference requires an explicit test action. The authorized aggregate testing ceiling is $10 across both UAT keys; server-side enforcement and reliable usage visibility are still unconfirmed.
- Claude Code, native VS Code Chat, guided clients, and other platforms are planned, not implemented.

The [isolated setup validation record](docs/validation/setup-takeover-005.md) records the repaired blockers, actual native coding/continuation results, recovery location and remaining scope.
