# Compatibility report

Last updated: 2026-11-15 (Asia/Singapore).

## Current project validation

| Client/interface | OS | Client version | Public model | Environment | Status |
| --- | --- | --- | --- | --- | --- |
| Codex CLI | Windows | Not pinned | Not selected | Routero UAT; deployed revision unknown | unverified |
| Codex VS Code extension | Windows | Not pinned | Not selected | Routero UAT; deployed revision unknown | unverified |

No live gateway tests were executed in Phase 1. Historical evidence does not change these statuses. See [source assessment](docs/gateway-assessment.md).

Status meanings: **verified** passed the defined client task and recorded controls; **experimental** has partial evidence and disclosed limitations with explicit opt-in; **unverified** lacks sufficient current evidence; **unsupported** has a confirmed incompatibility for the recorded combination.

## Planned bounded acceptance task

Use a disposable calculator project inside this repository's ignored `tmp/validation/` directory. Keep Codex configuration isolated inside that directory using a mechanism verified for the pinned client; do not redirect or modify the active agent's own configuration/environment. Do not import unrelated MCP servers or secrets. No validation project has been created or executed yet.

1. Record OS build, CLI/IDE versions, gateway deployed revision (or explicitly unknown), public model, actual deployment where observable, context limits, policy state, key profile label, pricing and spend baseline. Never record the key itself.
2. Verify model-list scoping without admin APIs or expanded catalog queries.
3. Ask Codex to read `calculator.py`, implement subtraction, run `test_calculator.py`, and answer a follow-up about the change. Inspect the resulting diff and test output independently.
4. Confirm function/custom tool calls, `apply_patch`, tool output replay, streaming events, continuation, and cancellation. Test context boundaries/compaction separately with a cost estimate before expanding input.
5. Test model restrictions, key errors/revocation where authorized, budgets, and restart/authentication behavior using isolated configuration. Do not change policies or revoke shared keys silently.
6. Run capability cases independently: greeting prompt, `modulo` content filter with fresh versus existing conversation, then controlled cache tests. Cache tests compare complete request bodies, distinguish exact from semantic hits, and inspect gateway evidence. Record manual policy changes and restoration.
7. Record each result and cost; stop on missing billing visibility, unknown pricing that prevents a safe estimate, repeated failure, partial stream/tool ambiguity, or the combined $10 ceiling. Do not blindly retry a coding task.

Historical CLI evidence covers v0.157.1 and an unnamed OpenAI-backed model, but not a currently verified CLI/IDE pair. Five runs per interface are a full-release target, not a Phase 1 result.

## Result record template

```text
Date/time and test ID:
OS / client / interface / version:
Gateway environment / deployed revision / evidence source:
Public model / actual deployment / capability record:
Key profile label (non-secret) / policy baseline:
Test action and expected outcome:
Observed outcome / sanitized request ID / terminal stream state:
Read / edit / tool output / test execution / follow-up results:
Usage / billed cost / aggregate test spend:
Pass, fail, or inconclusive / limitations / cleanup result:
```
