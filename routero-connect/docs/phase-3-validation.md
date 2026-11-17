# Phase 3 validation

Date: 2026-11-17 (Asia/Singapore). Branch: `phase-3`.

## Outcome

The shared foundation and offline CLI are implemented and checked. This is an independent development increment authorized while Phase 2 remains open. It does not establish a working Codex coding workflow or resolve the reported tool errors.

## Checks passed

- `npm test`: type checking, lint with zero warnings, test compilation, and **26 offline TypeScript tests**.
- `npm run package`: production extension and CLI bundles build successfully. No VSIX or published npm package was produced.
- Production CLI smoke checks: status/help behavior, single `/v1` normalization, rejected credential-bearing URL without echo, unavailable `connect`, executable header, and offline `doctor` with expected exit code 1.
- Direct dependency pins match the lockfile and the existing installed packages. No dependencies were downloaded or globally installed. Tested tools: Node 24.18.0 and npm 11.16.0.
- Core imports stay within core: no VS Code, filesystem, or network imports.
- Actual catalog parses successfully, preserves both scoped Phase 2 failures, and contains no activatable combination. Verified records used by tests are synthetic only.

Tests cover invalid/normalized URLs, domain/port credential separation, profile validation, key-visible model intersection, version/origin/protocol/client scope, experimental opt-in, unknown/unsupported denial, overlapping records, malformed catalog data, diagnostic redaction, transport errors, ambiguous rate/budget limits, CLI errors, and separation of offline diagnostic levels.

## Environment and scope

The initial sandboxed esbuild run failed while reading an ancestor directory, as in Phase 1. The approved production build outside the sandbox passed; build output stayed under this project's `dist/`. Creating the branch also required approved access to the enclosing repository's Git metadata. All source/documentation/cache changes are project-local.

No gateway requests, model inference, key-store access, profile persistence, client-setting writes, or external helper installation occurred. No gateway files or remote issues were changed. Inference spending for Phase 3 is $0; this does not establish the unknown cost of earlier user-run Phase 2 tests.

## Remaining work

VS Code UI acceptance and installable-package validation have not run. The inherited VS Code sample test is not claimed as integration evidence. Credential storage/helper implementation, configuration editing/rollback, and real client adapters remain later phases. The current CLI is deliberately offline and reports unavailable setup rather than a live health pass.

See [architecture](architecture.md), [development instructions](development.md), and [current compatibility progress](../compatibility-report.md).
