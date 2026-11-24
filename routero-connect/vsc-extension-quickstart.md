# Maintainer quickstart

This repository contains the Routero Connect extension, shared Codex CLI, and validation tooling. The [development guide](docs/development.md) records runtime pins, commands, and implementation boundaries.

## Main entry points

- `package.json` declares extension metadata, public commands, and development scripts.
- `src/extension.ts` registers commands and creates the native VS Code UI adapter.
- `src/ui/` implements setup orchestration and the external Node CLI bridge.
- `src/cli/` and `src/adapters/` contain the shared workflow and client integration.
- `src/test/` contains unit, host, installed-package, and opt-in native checks.

## Development workflow

Install the repository's recommended VS Code extensions from `.vscode/extensions.json` and use the pinned Node/npm versions. Run `npm ci`, then `npm run compile` before launching the development extension.

Press `F5` to open the Extension Development Host. Run **Routero: Integration Status** from the Command Palette to inspect the packaged progress report without key access or inference. Set breakpoints in the extension/UI sources and inspect the debug console or redacted **Routero Connect** Output Channel. Relaunch the development host after rebuilding changed code.

The local API declarations are in `node_modules/@types/vscode/index.d.ts`. Platform scope and real setup instructions are documented in [VS Code setup](docs/vscode-setup.md).

## Validation and internal packaging

- `npm test` runs type checking, lint, and host-independent unit tests.
- `npm run test:vscode` runs the pinned isolated development-host smoke checks.
- `npm run package:internal` builds and audits the internal VSIX and standalone CLI.
- `npm run test:installed` validates the actual VSIX in a project-local profile after packaging.

Run permission-heavy unit tests and Electron host checks serially on this Windows environment. Native credential operations and billable model tests require their documented explicit actions. Keep test state, keys, installed helpers, and normal client settings within the established validation boundaries.

We decided to keep Marketplace publication outside the internal package workflow. Builds do not publish or install into a normal profile. See the [roadmap](docs/roadmap.md), [validation record](docs/phase-7-validation.md), and [isolated parity procedure](docs/plugin-parity-test.md) before extending the supported scope.
