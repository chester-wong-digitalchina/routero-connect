# Routero Connect

Routero Connect is an incremental VS Code extension and planned companion CLI for connecting existing coding clients to Routero. It preserves each client's editing, tool execution, and permission workflows.

## Current status

**Phase 3 adds shared foundations and an offline command-line tool. The plugin still cannot configure Codex automatically, and Phase 2's real coding tests remain unresolved.**

You can now check project readiness and validate a Routero API address from the command line without sending a request or entering a key. The shared code also defines how future setup should keep credentials tied to one gateway, decide which tested models can be offered, and keep secrets out of diagnostic reports.

The user can obtain simple replies through Routero, but current coding tests stop before or after a file read. No complete coding workflow has passed. The cause remains unconfirmed; Phase 3 does not fix, bypass, or relabel those failures. See the [progress report](compatibility-report.md).

VS Code commands:

- **Routero: Integration Status** opens the progress report.
- **Routero: Connect** explains readiness and offers the report. It does not collect credentials, contact the gateway, or change client settings yet.

Initial live-validation target remains **Codex on Windows**, using `https://api-uat.routero.ai`. Production and UAT credentials stay separate. The compatibility catalog currently contains only the two failed test combinations; neither can be activated.

## Try the offline CLI

From the project root, build with the documented Node/npm versions:

```powershell
npm ci
npm run compile
node dist/cli.js status
node dist/cli.js validate-url https://api-uat.routero.ai/v1
node dist/cli.js doctor
```

`status` describes project readiness. `validate-url` checks an address and shows the normalized endpoints, without contacting them. `doctor` shows which checks have not run; it intentionally exits with code 1 because automatic setup is not available. No command reads credentials or client settings. Do not pass an API key as an argument.

## Development

Tested tooling: **Node.js 24.18.0 / npm 11.16.0**, with direct dependencies pinned to the lockfile. The manifest still targets VS Code `^1.146.0`; a build is not proof of UI compatibility. Use `npm.cmd` if PowerShell blocks `npm.ps1`.

- `npm test` runs type checking, lint, and offline TypeScript unit tests; it does not download Electron or contact Routero.
- `npm run compile` builds both development bundles.
- `npm run package` builds both production bundles; it does not create a VSIX or publish a CLI package.
- `npm run test:vscode` is the separate opt-in VS Code test runner. Its scaffold test is not full UI acceptance.

Read [development instructions](docs/development.md), [architecture](docs/architecture.md), [compatibility data](compatibility/README.md), and the [roadmap](docs/roadmap.md). Phase 2's [manual guide](docs/phase-2-manual-validation.md), [technical errors](docs/validation/codex-manual-blockers.md), and [validation tools](scripts/validation/README.md) remain available for a targeted retest, not repeated blind retries.

## Boundaries

- Gateway repository access is read-only. Development changes stay inside this project directory.
- No API keys belong in repository files, subprocess arguments, logs, fixtures, or documentation.
- Phase 3 has no credential-store implementation, persistent profiles, configuration writer, or real client adapter. User-level settings stay untouched.
- Live inference requires an explicit test action. The authorized aggregate testing ceiling is $10 across both UAT keys; server-side enforcement and reliable usage visibility are still unconfirmed.
- Claude Code, native VS Code Chat, guided clients, and other platforms are planned, not implemented.
