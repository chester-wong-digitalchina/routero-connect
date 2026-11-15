# Incremental implementation roadmap

The user's quality/documentation-first direction takes priority over historical schedules. Finish a coherent increment, validate it, and document limitations before adding client count or features.

| Phase | Deliverable | Gate |
| --- | --- | --- |
| 1. Gateway assessment | Pinned source findings, integration contract, initial unverified compatibility report, honest extension readiness | Source conclusions distinguish deployment and historical evidence; project build passes |
| 2. Codex Windows validation | Pinned CLI/IDE versions, model and billing evidence, bounded disposable coding task | Record real tool/edit/test/follow-up behavior; expose backend blockers before automation |
| 3. Shared foundations | Core/CLI/extension boundaries, URL validation, compatibility data, redacted diagnostics | Behavior tests and contributor documentation |
| 4. Credentials | Reviewed Windows secret storage and stable helper | Restart and failure behavior, no plaintext leakage; supported Codex auth validated |
| 5. Configuration engine | TOML planning, preview, atomic apply, concurrency and three-way rollback | No unrelated-setting loss; idempotency and conflict tests |
| 6. Codex CLI adapter | Connect, doctor, model selection, disconnect | Fresh isolated setup and restoration pass acceptance |
| 7. VS Code setup | Native setup wizard sharing core, internal CLI/VSIX packages | Separate IDE validation and recovery instructions |
| 8. Hardening | Restrictions, key lifecycle, budget errors, update/recovery checks | Support matrix, regression results and explicit limitations |
| 9. Expansion | Claude Code, guided clients, native Chat and additional platforms as separate increments | Each feature passes its own protocol/client gate |

Phase 1 is complete as a source assessment; live compatibility remains pending. No gateway, user settings, policy, credential, or external project writes are part of Phase 1. All current writes must stay inside this project. Later phases must respect that boundary unless the user explicitly changes it.
