# Maintainer handoff

Status at 2026-11-24 (Asia/Singapore), source version **0.0.5**, branch **phase-7**.

## Start here

Routero Connect configures an existing coding client to use Routero; it does not execute coding tools or proxy model traffic. We prioritized one carefully scoped Windows/Codex integration, shared configuration logic, credential isolation and recoverable changes before adding clients.

Read the [README](../README.md) for supported scope and manual prerequisites, [design decisions](design-decisions.md) for the rationale, [architecture](architecture.md) for component boundaries, and [development guide](development.md) for tooling. Phase reports preserve historical checkpoints and must not be treated as the latest support matrix.

The [gateway assessment](gateway-assessment.md) records the original specification and historical integration reports. Those source documents are not all distributed with this repository and may contain environment-specific information. Their instructions and old deadlines are design inputs, not new execution authority. Gateway source is [Filigrain/llmrouter](https://github.com/Filigrain/llmrouter); the referenced revision and suspected UAT branch are assessment evidence, not proof of the currently deployed version. Confirm deployment metadata before attributing a regression.

The source work is not automatically committed, published or transferred by this handoff. Review `git status --short` and the complete diff before committing: the working tree includes Phase 7 implementation and subsequent fixes/documentation, not just the final editorial pass. No history rewrite or remote issue update is part of this handoff.

## What works and what remains open

| Area | Recorded result | Limit |
| --- | --- | --- |
| Shared setup controller | Generated and applied an isolated Routero configuration with private recovery | Predetermined authorized selections; not a full GUI click-through |
| Native coding | Windows, Codex CLI 0.172.0, UAT, `openai/gpt-6-luna`: file reads, subtraction edit, six passing tests | One small disposable Python project |
| Continuation | Resumed the successful conversation, answered `5`, reran six tests | No long-context or compaction claim |
| Authentication | Existing Windows credential through private helper 0.0.6 | New-machine helper lifecycle requires further acceptance |
| Regression | Type checking, lint, 123 unit tests | Last runtime checks preceded this documentation-only handoff pass |
| Packaged extension | 0.0.5 archive audited; two installed-host checks passed | Activation/report checks, not live graphical setup |
| General compatibility | Unknown metadata retained; ordinary approval blocked | Exact context/output limits and broader lifecycle evidence missing |
| Other interfaces | CLI controls implemented | Codex IDE adapter and other clients/platforms are not implemented |

The [live setup record](validation/setup-takeover-005.md) contains the exact result, repaired blockers, recovery transaction and spend estimate. A native process exit code of zero alone was insufficient: an initial locally blocked turn also exited zero. Acceptance requires checking actual edits, tool results, tests and the final response.

## Reproduce on a new machine

Follow the [isolated validation procedure](plugin-parity-test.md), starting with the [manual prerequisites](../README.md#manual-prerequisites-for-a-new-installation). Node, Codex, a permitted Routero key, model policies and native Windows sandbox setup are external prerequisites. Production support is not established by the UAT result.

Use a fresh copy of `fixtures/validation/calculator/`, a parent named `codex-plugin-validation` with an existing `codex-home` child, and private recovery outside Git. Preserve completed results. The existing `tmp/validation/codex-plugin-validation/calculator` contains the successful subtraction run and is no longer a clean baseline.

The local launcher and logs under `tmp/` are ignored, machine-specific convenience artifacts. They are not included in a clone or VSIX. Recreate setup using the documented commands rather than depending on the previous workstation's paths, stored key, helper or sandbox state. An isolated VS Code profile does not by itself isolate Codex; the explicit config target and separate test-terminal `CODEX_HOME` provide that separation.

## Credentials, recovery and local state

- No key values belong in this handoff, source, logs, arguments or fixtures. New maintainers need separately provisioned credentials; Windows Credential Manager entries are not transferable repository assets.
- The previous validation reused reference/profile `uat-luna-parity` for UAT. This label alone grants no access and must not be assumed to exist on another machine.
- A private helper lives outside the extension installation. Keep its Node path and integrity manifest intact; stage a new version rather than overwriting an existing installation. New source staging is 0.0.7; the live result used existing 0.0.6.
- The recorded transaction and private recovery location are in the [setup record](validation/setup-takeover-005.md). They remain on the validation workstation. Recovery files may contain original configuration secrets and must not be committed or casually copied.
- The shared-controller harness did not persist the VS Code recovery shortcut. The explicit recovery transaction remains authoritative; standalone CLI restoration is available. Do not delete recovery, keys or helpers as handoff cleanup.
- Normal Codex configuration and gateway code/settings were left unchanged. The corrective extension was installed locally; whether its active host has since reloaded is not verified by this handoff.

## Next work, in order

1. **Establish fresh-install GUI acceptance.** Use a clean Windows test profile, a separately provisioned key, fresh helper/home/recovery and the packaged VSIX. Record every selection and verify read/edit/test/continuation, then independently run the tests. Do not reuse the completed calculator as a baseline.
2. **Exercise lifecycle and recovery with real prerequisites.** Verify restart/helper authentication, reviewed disconnect, preservation of unrelated/later edits, cancellation, recovery after an interrupted operation and helper/version changes. Keep synthetic coverage distinct from live acceptance.
3. **Resolve model metadata and accounting.** Obtain authoritative context/output limits and capability information from the gateway maintainer. Reconcile actual request charges/fallbacks. The historical $10 aggregate test ceiling is not a server-side cap or a new maintainer's spending authorization; do not assume the remaining allowance.
4. **Review compatibility promotion.** Only after the required evidence exists should a new change propose ordinary catalog approval. Do not fill unknown fields from model names, pricing units or client defaults, or broaden the isolated gate as a shortcut.
5. **Plan broader hardening and interfaces.** Reconcile the [roadmap](roadmap.md) and [Phase 7 issue](https://github.com/chester-wong-digitalchina/routero-connect/issues/6) against the acceptance evidence before starting expansion. Codex IDE support is a separate adapter and validation effort.

The DeepSeek tool-history and title JSON-mode failures remain recorded in [the client/gateway findings](validation/codex-01720-uat-blockers.md). Their root cause is not proven. Gateway access stays read-only; investigate with request evidence or coordinate a separate gateway change rather than rewriting client payloads speculatively in this plugin.

## Build and verify

Use the pinned Node/npm versions and lockfile from the [development guide](development.md). In PowerShell, use `npm.cmd` if script policy blocks `npm.ps1`.

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run package:internal
npm.cmd run test:installed
```

Run the installed-host suite after the unit suite finishes; concurrent Windows permission tests previously distorted GUI timing. Packaging creates a VSIX, standalone recovery CLI and audited hash manifest in ignored `dist/`; it does not publish or install into a normal profile. `test:installed` installs only into project-local test directories. Neither command establishes live coding acceptance.

The handoff package is rebuilt from the current documentation; inspect `dist/internal-artifacts.json` for its audited contents and hashes. Any earlier downloaded or installed 0.0.5 copy predates this editorial pass and does not update when Markdown source changes. Build fresh artifacts for later distributions rather than relying on the version number alone. Marketplace publication and redistribution licensing remain unresolved; the internal publisher ID is not a verified publisher claim.

The final editorial check reviewed 31 Markdown files for conversational author references, second-person wording, missing local Markdown link targets and Routero key-shaped content; no findings remained. `git diff --check` passed. No runtime behavior changed or live inference was run for this documentation pass; the recorded runtime and installed-host results above remain the latest such checks.
