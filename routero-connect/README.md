# Routero Connect

Routero Connect is an incremental VS Code extension and planned companion CLI for connecting existing coding clients to Routero. It preserves each client's editing, tool execution, and permission workflows.

## Current status

**Phase 5 adds a tested configuration engine for previewing changes, preserving existing settings, and restoring managed fields safely. It has only been exercised on project-local dummy files; your live Codex configuration has not been changed.**

The engine detects changes made after a preview and keeps later user edits when rolling back. It also keeps private recovery files before replacing a configuration. This is a shared component for the future setup flow, not an automatic Connect/Disconnect feature. See [how configuration changes work](docs/configuration-engine.md).

Phase 4's explicit Windows credential commands and pinned helper remain available. They are separate from configuration editing; neither credentials nor configuration changes prove that a model can complete a coding task.

The user can obtain simple replies through Routero, but current coding tests stop before or after a file read. No complete coding workflow has passed. The cause remains unconfirmed; Phase 3 does not fix, bypass, or relabel those failures. See the [progress report](compatibility-report.md).

VS Code commands:

- **Routero: Integration Status** opens the progress report.
- **Routero: Connect** explains readiness and offers the report. It does not collect credentials, contact the gateway, or change client settings yet.

Initial live-validation target remains **Codex on Windows**, using `https://api-uat.routero.ai`. Production and UAT credentials stay separate. The compatibility catalog currently contains only the two failed test combinations; neither can be activated.

## Try the offline checks

From the project root, build with the documented Node/npm versions:

```powershell
npm ci
npm run compile
node dist/cli.js status
node dist/cli.js validate-url https://api-uat.routero.ai/v1
node dist/cli.js doctor
```

`status` describes project readiness. `validate-url` checks an address and shows the normalized endpoints, without contacting them. `doctor` shows which checks have not run; it intentionally exits with code 1 because automatic setup is not available. These three checks do not read credentials or client settings. Separate `credential` commands explicitly access the Windows store; `credential print` deliberately outputs the token for a client helper. Never pass a key as an argument or include helper output in logs.

## Try the configuration safety demo

```powershell
npm run demo:config
```

The demo creates a dummy file under ignored `tmp/validation/`, prints a redacted preview, applies fixture settings, then shows how rollback preserves a simulated later edit. An expected rollback conflict demonstrates safe behavior. It does not use your live settings, credentials, or gateway. There is no production config-write CLI command yet; the client adapter comes in Phase 6.

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
- Phase 4 implements external credential storage and helper staging. A safe configuration engine is now available as a library/demo; persistent profiles and real client adapters remain later work. User-level Codex settings stay untouched.
- An approved native test installed helper 0.0.3 under the current user's local app-data directory and created/removed one dummy Windows credential. No supplied real key was stored. Other development files stay inside this project.
- Live inference requires an explicit test action. The authorized aggregate testing ceiling is $10 across both UAT keys; server-side enforcement and reliable usage visibility are still unconfirmed.
- Claude Code, native VS Code Chat, guided clients, and other platforms are planned, not implemented.
