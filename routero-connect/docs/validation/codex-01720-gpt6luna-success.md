# GPT-6 Luna: manual coding success and plugin parity gate

> Historical evidence: this record preserves the observed combination and original verification scope. See the [maintainer handoff](../handoff.md) for the current status and subsequent validation.

Recorded: 2026-11-24 (Asia/Singapore). Model: `openai/gpt-6-luna`; Codex CLI: **0.172.0**; Routero UAT: `https://api-uat.routero.ai/v1`. This documents a real manual success and the remaining work to reproduce it through plugin-managed setup.

## What passed

The recorded terminal screenshots show a fresh isolated Codex conversation that read `calculator.py`, explained it, then read the implementation/tests, added subtraction and four focused tests, ran six tests successfully, and answered a follow-up correctly. Codex reran the same six tests after the follow-up. The editing screenshot displays two files changed. The native local session records the same model/version and three turns, consistent with the read/task/follow-up sequence.

We independently inspected the resulting files and ran `python -m unittest -v` in the disposable calculator. All six tests passed: existing addition/multiplication, plus positive, negative, equal and fractional subtraction. The implementation returns `left - right`; `subtract(-3, -8)` is 5. The completed calculator was preserved, not reset for the next test.

The recorded credential label is **test / Admin Group**. Its value is not stored here or copied into source, fixtures, process arguments, or evidence. This success supersedes a blanket claim that no model has completed a basic coding loop. It does not change the recorded DeepSeek/GPT-4o failures or establish a Codex IDE result.

## Known working configuration and differences to check

The isolated config selects the Routero provider, the model above, Responses, `/v1`, disabled WebSockets, and zero client request/stream retries. Authentication is through a temporary environment variable. Codex runs with `--no-daemon` to avoid the long isolated-home socket-path issue. Its home and calculator are separate ignored project-local directories.

The plugin generates the same provider/model/transport/retry settings but uses command-backed authentication and private transaction recovery. The inspected CLI versions now include 0.172.0 alongside 0.157.1; the UI, CLI and adapter share that exact-version list. Other versions and prereleases still need their own checks.

A separate native 0.172.0 loopback probe accepted strict command-auth configuration and sent one correctly authenticated `/v1/responses` POST to an intentional HTTP 418 server. See [the sanitized result](codex-01720-command-auth.json). It used a dummy script/token, not the real OS credential store, gateway or a model. It validates the command-auth interface, not a complete plugin-helper connection.

## Metadata and accounting still unknown

Reported metadata suggests approximate context of **1M** and prices of **$0.11 input / $0.52 output per 1M tokens**. The gateway UI does not show an exact context limit or maximum output-token limit. These are reported pricing/approximation, not measured model limits or the cost of these successful turns. No exact context or output number is inferred from the model name, client defaults, or per-million pricing.

Streaming/cancellation, context/compaction, title-generation status for this model, actual request charges/fallbacks, helper restart/GUI launch, and the complete VSIX-configured coding workflow remain unverified. The production catalog records `tools=true` and short same-conversation continuation, with `validation=partial`, `status=unverified`, and unknown limits. Ordinary activation still keeps this record unavailable, even with normal experimental opt-in. We decided to permit a separate isolated coding-validation mode for this exact UAT/model/0.172.0 combination for one bounded calculator task, with unknown capabilities retained and no generic force flag. See the [plugin parity procedure](../plugin-parity-test.md).

## Plugin parity validation

We decided to add an isolated validation mode after confirming that the gateway does not display exact context/output limits. The separate eligibility function requires the recorded manual coding result and native command-auth check, current key visibility, this exact model/origin/client/version, and explicit opt-in. The adapter refuses any config target other than a dedicated `codex-plugin-validation/codex-home/config.toml`. Normal activation, metadata labels, private recovery, preview revisions, and conflict handling remain intact. No other unverified/failed model becomes available.

The [step-by-step plugin parity test](../plugin-parity-test.md) describes the new baseline, explicitly confirmed helper/key setup, configuration preview/apply, same coding task, independent six-test check and recovery. A fresh home/calculator were prepared in ignored project-local scratch space; the completed manual run was preserved. Exact model limits and full lifecycle remain pending, rather than silently inferred.

No live inference was run during implementation checks, no native credential was stored, and no gateway or normal user configuration was changed. The native protocol probe and independent Python checks use project-local fixtures. Newly staged helpers use version 0.0.6 and the updated artifact is 0.0.3, without overwriting installed versions. At this 0.0.3 checkpoint, plugin-configured parity was still pending. The later [0.0.5 setup result](setup-takeover-005.md) records the passing coding task and continuation.
