# Development and validation

## Tooling

Tested development versions: **Node.js 24.18.0** and **npm 11.16.0**. `.node-version` pins the development Node version; `packageManager` records npm. The supported development range is Node 24 (from 24.18.0) and npm 11 (from 11.16.0). Wider runtime support has not been established.

All direct development dependencies are pinned to the already installed versions resolved in `package-lock.json`; no new dependencies were added in Phase 3. Use `npm ci` to reproduce the lockfile. `.npmrc` keeps the default npm cache under this project's ignored `tmp/npm-cache/` when commands run from the repository root. Do not change global npm configuration or install globally for development.

The VS Code manifest remains `^1.146.0`, matching the observed installed host; this is not a tested range of every future release. Actual VS Code UI acceptance is separate from a successful TypeScript build. Validation scripts use Python 3.14.6 in the current environment and are separate from the TypeScript plugin/CLI runtime.

## Commands

Run from the repository root. Use `npm.cmd` in PowerShell if execution policy blocks `npm.ps1`.

```powershell
npm ci
npm test
npm run compile
npm run package
node dist/cli.js --help
node dist/cli.js status
node dist/cli.js validate-url https://api-uat.routero.ai/v1
node dist/cli.js doctor
```

- `npm test`: type-check, lint with zero warnings, compile test code, and run Node's built-in unit-test runner. No Electron download, gateway request, or credential access occurs.
- `npm run test:unit`: unit tests without the separate lint/type-check pretest hook; test compilation still checks types.
- `npm run compile`: type-check, lint, and build both development bundles (`dist/extension.js`, `dist/cli.js`).
- `npm run package`: type-check, lint, and build both production bundles. It does not create a VSIX or publish an npm package.
- `npm run test:vscode`: opt-in VS Code integration runner; may download/launch Electron. It currently contains the inherited scaffold test, not full UI acceptance. Do not run it against normal user state under the current project-only write boundary.
- `npm run cli -- <command>`: an alternative to `node dist/cli.js <command>` after building. The npm bin entry is prepared for later packaging; global CLI installation is not part of Phase 3.

CLI exit codes: `0` for a completed status/help/URL check, `2` for rejected arguments/URLs, and `1` for unavailable setup or an unexpected failure. In particular, **offline `doctor` intentionally returns 1**: it reports that no live checks ran and setup is unavailable. It does not claim your account or gateway is broken.

Never pass a key as a CLI argument or include it in a URL. No CLI command accepts a key as an argument. The three offline checks never access credentials; explicit `credential` commands do. Unknown arguments are not echoed. Read the [credential guide](credentials.md) before performing OS-store operations.

## Updating compatibility evidence

Read [the architecture](architecture.md) and [catalog format](../compatibility/README.md). Add evidence first; never copy a synthetic test record into the real catalog or turn a model name into an assumed context limit. Keep failed/unknown values honest. Tests parse the actual catalog and ensure Phase 2 failures stay non-activatable.

Useful checks when modifying code:

```powershell
python -m unittest discover -s scripts/validation -p 'test_*.py' -v
python -m unittest discover -s fixtures/validation/calculator -v
git diff --check
```

The Python suites are offline. Only rerun the real UAT discovery/manual tests when new evidence justifies them; this phase requires no billable inference. Live task failures remain in the [progress report](../compatibility-report.md).

## Build and package boundaries

`esbuild.js` bundles the CLI and extension separately from one shared source tree. Core modules must not import VS Code, Node filesystem/network code, or the CLI. Adapter contracts are types only; future implementations must enforce their runtime safety requirements.

Git ignores dependencies, bundles, compiled tests, temporary state, logs, Python caches, and VSIX output. `.vscodeignore` excludes source/test tooling and scratch data from future VSIX packages. Checked-in project docs and sanitized compatibility data are intentional; never bundle full account reports or real keys.

On this Windows sandbox, esbuild can fail while inspecting an ancestor directory. An approved build outside the sandbox is needed in that environment; the output still stays in this project. Do not disable security policy or modify directories outside the project as a workaround.

## Phase 4 credential validation

`npm test` includes mocked credential/CLI/ownership checks and project-local helper staging. It does not create Windows credentials. The opt-in native test writes a unique dummy Windows Credential Manager entry and cleans it up, so it requires explicit authorization beyond project-only writes:

```powershell
npm run compile-tests
node out/test/manual/windows-credentials.js --write-dummy-credentials
```

The default stages its helper inside the project. The additional `--install-helper` flag stages a new pinned user helper under `%LOCALAPPDATA%`; do not use it without authorization or against an existing helper version. It runs both installed Codex engines against loopback, which intentionally returns HTTP 418 rather than calling a model. No real keys or global environment variables are used. See [recorded results](phase-4-validation.md); do not rerun native tests merely to repeat already passing evidence.

Use `--use-installed-helper` on the native test only for an explicitly authorized targeted check of the current installed version. It verifies the script and manifest against the current bundle hash and never overwrites that installation.

## Phase 5 configuration engine

The runtime dependency `toml-eslint-parser` is pinned to **1.0.3**, with its integrity and transitive resolution in `package-lock.json`. It is used through a local asynchronous import for TOML 1.0 AST ranges. No parser download occurs at runtime, and no whole-file value serializer is used. The original Phase 3 direct development pins remain unchanged.

```powershell
npm test
npm run demo:config
```

The tests use explicit fixture paths under ignored `out/`; the demo uses ignored `tmp/validation/`. Windows ACL commands and all test recovery files are confined to these selected fixture locations. Do not run the opt-in Phase 4 native credential test as part of Phase 5: it is unrelated and writes the OS credential store.

The engine is a reusable source component in `src/config/`, checked by TypeScript and unit tests. It is not a new production config-write command or a separately published package. Future CLI/VS Code adapters will import it; `npm run package` still builds the existing extension/CLI entry points. The demo runs the compiled library from `out/` after test compilation.

Read [configuration safety and limits](configuration-engine.md) before integrating `plan`, `apply`, or `rollback`. A plan is in-memory/single-use; durable rollback uses a private transaction record. The fixture-only recovery exception must never become a production default. Stable-version client compatibility and credential handling still require their separate checks.
