# Phase 2 validation record

> Historical checkpoint: results and restrictions below describe this phase at the time of its checks. For the current 0.0.5 state, handoff priorities and validated scope, start with the [maintainer handoff](handoff.md). Later results do not retroactively change earlier test evidence.

Started: 2026-11-16. Updated: 2026-11-17 (Asia/Singapore). Branch: `phase-2`. Status: **in progress; full coding workflow not yet demonstrated**.

For the plain-language current status, see the [project progress report](../compatibility-report.md). The checks below distinguish earlier local preparation from later manual tests.

## Completed checks

- Six offline discovery tests passed with `python -m unittest discover -s scripts/validation -p 'test_*.py' -v`.
- Two calculator baseline tests passed with `python -m unittest discover -s fixtures/validation/calculator -v`. These do not validate any LLM-generated edit.
- Standalone Codex `0.157.1` and IDE-bundled engine `0.169.0-alpha.11.1` each passed the loopback command-auth probe with strict configuration. Each made one streaming Responses POST with the expected dummy bearer token. Intentional server HTTP 418 caused expected nonzero Codex exit; the probe itself passed. No inference or tool execution occurred.
- Both supplied UAT keys returned HTTP 200 from ordinary `/v1/models` with the identifying validation User-Agent. Model counts differed (16 and 10); restricted-model enforcement remains untested.
- Both self key-info requests returned HTTP 400 with the same application error. This is recorded separately from budget state and is not being investigated further, following the agreed investigation boundary.
- Current candidate branch heads match Phase 1; deployed UAT revision remains unknown.
- Relative documentation links, committed real-key-pattern scan, and `git diff --check` passed. Runtime logs, temporary state, and Python bytecode are excluded from Git; validation scripts/fixtures are excluded from VSIX packaging.

## Environment observations

VS Code reports `1.146.0`, extension `openai.chatgpt` reports `26.1111.21308`, and Windows reports `10.0.26200.0` x64. The IDE engine differs from the standalone executable; its probe must not be reported as IDE UI acceptance. Executable hashes and selected sanitized results are recorded in [evidence](validation/phase-2-evidence.json).

Initial Python-default HTTP requests received Cloudflare HTTP 403, while subsequent identified requests reached Routero. This establishes an observed header-sensitive difference, not a diagnosis of the edge rule. Network calls required approval outside the sandbox.

VS Code inventory commands attempted to create a user log directory and were denied by the sandbox. They also produced a project-local `debug.log`; that generated file was moved into ignored `tmp/validation/`. No normal VS Code or Codex settings were changed. Further IDE testing is user-assisted rather than launching a separate IDE instance against normal user state.

## Remaining acceptance

Manual coding tasks have been attempted but not completed. A complete tool-result round trip, `apply_patch`, streaming-integrity, follow-up, cancellation, context/compaction, policy/cache behavior, and restart acceptance have not been verified. No compatibility status is upgraded. Pricing, spending visibility, and active capability state remain unresolved.

The account report records no current budgets on either test key. Unexpected behavior requires separately recorded manual results. That does not remove the aggregate $10 authorization ceiling. Local baseline inference requests and spending remain **0 / $0**; manual request count and spending are unknown.

Next action: compare the failed file-reading sequence and current setup with earlier successful use; use the [manual guide](phase-2-manual-validation.md) for a targeted retest after a specific correction or supported setup is identified. Do not close Phase 2 or start adapter implementation on the basis of discovery or local probes alone.

## Manual CLI update: 2026-11-17

The recorded failure screenshots show results for GPT-4o (js tool schema rejection) and DeepSeek (file reads followed by tool-result history rejection; fallback unavailable). See [blocker record](validation/codex-manual-blockers.md). Earlier no-live-test statements describe the local baseline baseline, not these later manual attempts. Local baseline spend is still $0; manual cost is unknown. Live acceptance is blocked, IDE acceptance remains untested, and no model is verified.

## Smaller file-reading test: 2026-11-17

A third recorded screenshot shows: a `READY` response succeeded, then Codex opened `calculator.py` but failed before explaining it. Both prompts were in the same conversation. The same missing-tool-results error appeared without editing, running tests, or the earlier unsuccessful file search. Those activities are not required to encounter this failure.

The manual test report states that reverting configuration also did not restore coding-task success. The cause remains unconfirmed; a client, settings, request-handling, conversation-state, or model-service difference could be involved. Earlier success has not been matched closely enough to confirm a regression. No further live requests were made for this documentation update.
