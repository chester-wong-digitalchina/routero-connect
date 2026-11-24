# Phase 1 validation

> Historical checkpoint: results and restrictions below describe this phase at the time of its checks. For the current 0.0.5 state, handoff priorities and validated scope, start with the [maintainer handoff](handoff.md). Later results do not retroactively change earlier test evidence.

Date: 2026-11-15 (Asia/Singapore).

## Passed

- `npm.cmd run compile`: TypeScript checking, ESLint, and esbuild development bundle.
- Manifest commands match registered extension commands.
- Relative links in README, compatibility report, and assessment/roadmap documentation resolve to existing files.
- Key-pattern scan of those documents found no API-key literals.
- `tmp/**` is excluded from extension packaging; generated/dependency/temporary files are ignored by Git.

## Environment findings

- PowerShell blocks the `npm.ps1` wrapper. `npm.cmd` works without changing execution policy.
- Sandboxed esbuild could not read an ancestor directory. An approved build outside the sandbox passed; build artifacts remain inside this project.
- The scaffold's esbuild error reporter assumed every diagnostic had a source location. Added a location guard so locationless errors retain their original diagnostic rather than causing a second crash.
- Git status reported this nested project as untracked from the enclosing repository; an existing global-ignore permission warning also occurred. No commit, Git configuration, or enclosing repository files were changed.

## Not performed

- VS Code Extension Development Host UI acceptance. Run `Routero: Integration Status` and the Connect notification action manually; both should open the bundled compatibility report without network or credential access.
- VSIX creation or package-content inspection with the VSIX tooling.
- Gateway test-suite execution, UAT model listing/inference, or real Codex acceptance.

Live compatibility is still **unverified**. No credentials were stored, no client settings were changed, and UAT test spend in this phase was **$0**.
