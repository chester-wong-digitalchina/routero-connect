# Routero Connect

Routero Connect is an incremental VS Code extension and planned companion CLI for connecting existing coding clients to Routero. It preserves each client's editing, tool execution, and permission workflows.

## Current status

**Phase 2 is in progress. Routero can answer simple messages, but a complete Codex coding task has not yet passed testing.**

In the latest DeepSeek test, Codex replied `READY`, then opened `calculator.py` when asked to explain it. An error stopped it from explaining the file after the read. This smaller test did not ask for edits or tests, so those actions are not needed to reproduce the problem. A separate GPT-4o attempt stopped before any visible file work.

We have not established whether the cause is in Codex, its settings, Routero's handling of the request, or the selected model service. Earlier successful use is relevant, but there is not enough matching evidence to confirm what changed. The plugin currently displays project status; it does not process these model requests or automatically configure Codex.

The next step is to compare the information sent before and after the file read and check it against the previously working setup. Repeating the same failed task is not needed. **Phase 2 is still open; no complete coding workflow is approved for use yet.**

See the [progress and compatibility report](compatibility-report.md) for what works, what remains untested, and what happens next. Technical error details are kept in a [separate reference](docs/validation/codex-manual-blockers.md).

Implemented commands:

- **Routero: Integration Status** opens the compatibility baseline inside VS Code.
- **Routero: Connect** explains readiness and offers the baseline. It does not collect credentials, contact the gateway, or change client settings yet.

Initial target: **Codex on Windows**, using `https://api-uat.routero.ai`. Production and UAT credentials must remain separate.

See [gateway assessment](docs/gateway-assessment.md), [compatibility report](compatibility-report.md), [manual Phase 2 tests](docs/phase-2-manual-validation.md), [validation tooling](scripts/validation/README.md), and [incremental roadmap](docs/roadmap.md).

## Local development

Use the versions resolved by `package-lock.json`. The manifest currently requires VS Code `^1.146.0`; this is a scaffold requirement, not a tested support range. The appropriate minimum host version and Node.js runtime will be pinned during compatibility/foundation work.

```powershell
npm ci
npm run compile
npm run package
```

If PowerShell blocks `npm.ps1`, use `npm.cmd` for these commands; no execution-policy change is needed.

`compile` checks TypeScript, lints source, and builds the development bundle. `package` performs the same checks and builds the production bundle; it does **not** create a VSIX. Press F5 in VS Code to launch the Extension Development Host, then run **Routero: Integration Status** from the Command Palette.

`npm test` uses the VS Code integration-test runner and can require an Electron download. The scaffold's sample test does not establish gateway compatibility. Automated behavior tests will accompany the corresponding implementation increments.

## Boundaries

- Gateway repository access is read-only. Development changes stay inside this project directory.
- No API keys belong in repository files, subprocess arguments, logs, fixtures, or documentation.
- This phase makes no changes to user-level Codex settings or credential stores.
- Live inference requires an explicit test action. The authorized aggregate testing ceiling is $10 across both UAT keys; server-side enforcement and reliable usage visibility are still unconfirmed.
- Claude Code, native VS Code Chat, guided clients, and other platforms are planned, not implemented.
