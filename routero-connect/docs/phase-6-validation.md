# Phase 6 CLI validation

Updated: 2026-11-23 (Asia/Singapore). Branch: `phase-6`, created from Phase 5 commit `ac73c00`. Scope: [GitHub issue #5](https://github.com/chester-wong-digitalchina/routero-connect/issues/5), fetched read-only.

## What works in this increment

The CLI now joins the previously separate credential, compatibility, and configuration components. It can inspect selected local prerequisites, explicitly list a stored key's model access, prepare a guarded connection preview, apply against the reviewed revision, switch models, and restore a recorded transaction. Disconnect does not require Codex or the helper to remain installed and does not delete credentials. A separate small text test requires explicit credit consent.

**This does not complete live Phase 6 acceptance.** The production compatibility catalog still contains only failed combinations. Connect refuses activation rather than applying an unverified model. Synthetic model tests demonstrate the code paths without asserting that Routero has passed a coding task.

## Validation

- `npm test`: **91 TypeScript tests**, including type checking and zero-warning lint. There are 23 additional adapter/CLI/gateway tests beyond Phase 5's 68.
- `npm run package`: production CLI and extension bundles built. The known esbuild ancestor-directory restriction required the approved build outside the sandbox; outputs stayed in this project.
- Production CLI smoke checks passed for help, status, offline doctor, rejected secret arguments, and refusal of a model test without credit consent. The bundle contains the real blocked catalog and excludes synthetic compatibility models.
- Existing configuration concurrency, private backup, rollback, credential ownership, and redaction tests continue to pass. The staging test now checks the new helper version, not the previous bundle's version.

New tests cover:

- Catalog approval recalculated by the adapter, including rejection of a caller's forged approval and a model no longer visible to the key.
- Isolated connect, separate helper arguments with spaces, Responses/WebSocket/retry settings, unchanged repeat connection, model switch, and reverse-order restoration through a fresh adapter.
- Client/helper/environment checks repeated before apply; changed helper hashes, lost permissions, unsupported versions, and conflicting authentication/profile/feature settings preserve configuration.
- Changes between configuration inspection and planning, and between preview and apply. CLI application requires the reviewed revision; a mismatch leaves the file intact.
- Local doctor reporting independent failures without reading credentials or running a model. Explicit online model-list behavior remains separate.
- Strict CLI parsing, no key arguments, credit consent before any probe, read-only disconnect confirmation, and fixed/redacted errors.
- Model-list shape/size/ID checks, normalized endpoint and bearer use, no redirects/retries, HTTP error categories, TLS/network failures, cancellation, and a mocked request deadline.
- One bounded fixed-text Responses probe, rejection of unexpected/tool/incomplete results, and explicit `codingCompatibility: not-tested` even on success.
- Private helper manifest/script inspection and hash-tamper refusal. The manifest is an integrity record, not a signed authenticity guarantee against the same Windows user.

All writable fixtures and fake helper files are under ignored project-local `out/`. Test credential readers and HTTP responses are in memory; no test uses the actual Windows credential store or a real remote model.

## Boundaries respected

No live Codex configuration, `auth.json`, native credential entry, installed helper, gateway file, gateway policy, or remote issue was changed. No Codex process was launched for acceptance and no inference request was made. Phase 6's live inference request count and spend are **0 / $0**. Git branch creation is the only Git mutation in this increment; changes were not staged, committed, or pushed.

The changed bundle stages at a new **0.0.4** helper path rather than overwriting 0.0.3. The adapter accepts the existing 0.0.3 command-auth contract; the installed copy was not accessed or modified. New 0.0.4 native authentication acceptance is still required before release.

## Remaining acceptance work

| Requirement | Current evidence |
| --- | --- |
| Configuration workflow, model switching, restoration | Passed with synthetic models and project-local fixtures |
| Key-visible model listing and text request handling | Mocked HTTP passed; live behavior not rerun |
| Real read → edit → tests → follow-up | Not passed; Phase 2 failures remain unresolved |
| Pinned-client metadata, hosted-tool/context/compaction behavior | Still requires live/client validation before catalog approval; no metadata inferred |
| Actual fresh Codex setup, restart, helper 0.0.4 authentication | Not run in this increment |
| Usage and billed-cost reconciliation | Not run; no inference spending |
| VS Code wizard/IDE acceptance | Phase 7 scope; CLI fixtures do not establish IDE support |

The workflow deliberately uses explicit paths, profile/reference arguments, and recovery IDs. It does not provide a persistent connection registry, automatic cleanup, a field-by-field rollback preview, or a supported coding model. Model-switch transactions must be restored in reverse order. Configuration-engine format/concurrency limits remain in force. See the [CLI guide](codex-cli.md) for usage, credit notices, restart, recovery, and troubleshooting.
