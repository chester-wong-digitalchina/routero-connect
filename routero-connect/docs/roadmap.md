# Incremental implementation roadmap

| Phase                       | Deliverable                                                                                                       | Gate                                                                                     |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1. Gateway assessment       | Pinned source findings, integration contract, initial unverified compatibility report, honest extension readiness | Source conclusions distinguish deployment and historical evidence; project build passes  |
| 2. Codex Windows validation | Pinned CLI/IDE versions, model and billing evidence, bounded disposable coding task                               | Record real tool/edit/test/follow-up behavior; expose backend blockers before automation |
| 3. Shared foundations       | Core/CLI/extension boundaries, URL validation, compatibility data, redacted diagnostics                           | Behavior tests and contributor documentation                                             |
| 4. Credentials              | Reviewed Windows secret storage and stable helper                                                                 | Restart and failure behavior, no plaintext leakage; supported Codex auth validated       |
| 5. Configuration engine     | TOML planning, preview, atomic apply, concurrency and three-way rollback                                          | No unrelated-setting loss; idempotency and conflict tests                                |
| 6. Codex CLI adapter        | Connect, doctor, model selection, disconnect                                                                      | Fresh isolated setup and restoration pass acceptance                                     |
| 7. VS Code setup            | Native setup wizard sharing core, internal CLI/VSIX packages                                                      | Separate IDE validation and recovery instructions                                        |
| 8. Hardening                | Restrictions, key lifecycle, budget errors, update/recovery checks                                                | Support matrix, regression results and explicit limitations                              |
| 9. Expansion                | Claude Code, guided clients, native Chat and additional platforms as separate increments                          | Each feature passes its own protocol/client gate                                         |

Phase 1 is complete as a source assessment; live compatibility remains pending. No gateway, user settings, policy, credential, or external project writes are part of Phase 1. All current writes must stay inside this project. Later phases must respect that boundary unless the user explicitly changes it.

## Current progress

Phase 2 began on 2026-11-16. The project can list available models, and local checks of the proposed sign-in method passed. The user can also obtain ordinary text replies through Routero.

On 2026-11-17, manual coding tests did not complete. GPT-4o stopped before visible file work. DeepSeek opened files, but the request after a read failed. A smaller test showed the same problem when only reading and explaining one file; editing and running tests were not required.

Phase 2 remains open. The next step is to understand the difference from earlier successful use and check what happens to the file-reading result before it reaches the model. We have not established that the plugin configuration, Codex, Routero, or the model service is responsible, or confirmed that a recent change caused it.

Foundation work that does not depend on a working model connection can be planned separately, but no later phase is declared complete and automatic setup must not describe an unverified coding workflow as supported. See the [progress report](../compatibility-report.md) for the current evidence and next steps.

## Phase 3 foundation work

Phase 3 proceeded while the Phase 2 live-test problem remains unresolved. Shared URL/profile/compatibility/diagnostic rules, adapter interfaces, and a small offline CLI are implemented on branch `phase-3`. No credential storage, client-setting changes, or live connection is added. Phase 2 is still open; foundation work does not authorize activating the failed model combinations.

All 26 TypeScript unit tests, type checking, lint, production builds, and offline CLI smoke checks passed. See the [Phase 3 validation record](phase-3-validation.md), [architecture](architecture.md), and [development instructions](development.md). The next implementation area is secure credentials, with real setup still gated on resolving live compatibility.

## Phase 4 credential work

On 2026-11-18, the Windows credential service, token-only helper commands, and version-pinned helper staging were implemented on `phase-4`. The branch was first fast-forwarded to include the committed Phase 3 foundations. An approved dummy-key test passed native storage, replacement, sharing, cleanup, separate-process reads, and authentication by both installed Codex engines on loopback. Helper 0.0.3 is the final pinned build (0.0.2 retained for rollback) independently of the extension; no real key was stored and no client settings changed.

Actual GUI and Windows reboot validation remain untested. This increment does not resolve Phase 2 or provide automatic setup. See [validation](phase-4-validation.md) and [credential guide](credentials.md). Next comes the safe configuration engine; a real adapter is still gated on successful live compatibility evidence.

## Phase 5 configuration work

On 2026-11-22, work on `phase-5` added a shared engine for previewing, applying, and restoring selected Codex TOML settings. It preserves unrelated text, detects conflicts, and keeps private recovery snapshots before replacement. Tests and the demo use only project-local dummy files; no live Codex settings, OS credentials, installed helper files, or gateway settings were changed.

Existing uncommitted Phase 4 work was preserved on the new branch. This phase does not create a real client adapter or resolve the Phase 2 tool errors. See [configuration behavior and limitations](configuration-engine.md) and [Phase 5 validation](phase-5-validation.md). Phase 6 will connect the shared components into a CLI workflow after the necessary live compatibility gate is satisfied.
