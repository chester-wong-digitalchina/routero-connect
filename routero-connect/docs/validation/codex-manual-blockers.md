# Codex CLI manual acceptance blockers

Reported: 2026-11-17 (Asia/Singapore). Evidence: three user-supplied terminal screenshots and accompanying user reports, not independently captured gateway traces. Client: Codex CLI `0.157.1`, Windows, disposable `calculator-cli` project, Routero UAT profile reported by the user. Actual deployed revision, selected key, policy state, and billed cost are not confirmed.

## Plain-language summary

Simple text replies work. In the latest smaller DeepSeek test, Codex read one file but could not finish explaining it. The failure therefore does not require editing files, running tests, or the earlier failed file search. GPT-4o stopped earlier, before visible file work. The full coding workflow remains unverified, and the cause has not been assigned to a particular component.

This is an investigation reference. Start with the [project progress report](../../compatibility-report.md) for the reader-facing overview. The technical details below preserve the error evidence without asserting a confirmed gateway defect.

## GPT-4o: tool schema rejected

Model: `openai/gpt-4o`. The calculator coding prompt failed before any visible file read or edit.

The error reports `invalid_function_parameters` for function `js`, with parameter path `tools[8].tools[0].parameters`. It says the schema must have type `object` and cannot have top-level `oneOf`, `anyOf`, `allOf`, `enum`, `const`, or `not`. The screenshot does not show the actual schema, so it does not establish which exact condition was violated or which component constructed it.

The error also reports no fallback model group for `openai/gpt-4o`. That fallback configuration is separate from the primary schema rejection. Model listing success did not establish coding-agent compatibility.

Maintainer check: compare the original Codex tool declaration with the tool definition reaching the selected deployment. Inspect the `js` parameters at the reported path, including custom/namespace conversion if applicable. Confirm which format the target accepts and whether the gateway preserves/translates it correctly. Retain the tool semantics; do not strip tools or silently change their schema merely to obtain a successful response.

## DeepSeek: tool-result history rejected

Model: `deepseek/deepseek-v4-flash`. The screenshot shows an initial assistant response and successful reads of `calculator.py` and `test_calculator.py`. An `rg --files` search for `AGENTS.md` returned exit code 1 with no output. A later request was rejected with:

> An assistant message with 'tool_calls' must be followed by tool messages responding to each 'tool_call_id'. (insufficient tool messages following tool_calls message)

The search exit code is not itself evidence of a gateway defect; failed or empty-result tool executions still require a valid result in the next request. The screenshot alone does not show whether the client omitted a result, the gateway translation/reconstruction dropped or misassociated it, or another component changed the history.

The fallback chain also reports that `byteplus/seed-2-0-lite-260228` targets an endpoint currently closed or temporarily unavailable. The error shows multiple fallback attempts, despite the proposed profile disabling client retries. Client retry settings do not establish control over gateway-internal fallback attempts. Exact attempt counts and cost are unknown.

Maintainer check: compare the original Responses input with the reconstructed upstream conversation. Match every emitted tool call to a result by ID, including batched/parallel calls, namespace/custom calls, and failed shell commands. Check ordering, missing outputs, continuation state, and fallback reconstruction. Inspect the BytePlus deployment separately.

## Smaller DeepSeek reproduction

A third screenshot shows `Reply with exactly the word READY.` returning `READY`. In the same conversation, the next prompt asked only to read and explain `calculator.py`, explicitly excluding edits and test execution. Codex displayed the file read, then failed with the same insufficient-tool-results error. The selected DeepSeek model is reported by the user context, not visible in that screenshot.

No edit, test run, or unsuccessful `AGENTS.md` search is shown in this smaller reproduction. Those actions are not necessary to reproduce the failure in this conversation. The screenshot does not establish a fresh-conversation reproduction, complete wire-level tool output, or the responsible component.

The user reports that restoring the earlier configuration still allowed simple text replies but did not restore the coding workflow. This weakens the hypothesis that the newly suggested profile alone caused the problem, but does not rule out all configuration differences. A regression since earlier successful use is possible, not confirmed; matching earlier client/model/configuration/deployment evidence is still needed.

## Acceptance outcome and next action

- Both tested model/client combinations failed the coding-task gate in the reported runs; this is not a permanent or product-wide unsupported declaration. Do not activate them as verified, infer an IDE result, or proceed to automatic adapter setup on this evidence.
- DeepSeek's file reading is partial success; edits, test execution, and follow-up were not completed/verified. GPT-4o showed no successful task step.
- Stop repeated manual retries. Use maintainer assistance to compare original client requests with the translated messages and the previously working setup. Responsibility is not assigned to the gateway in advance; request sanitized traces or a confirmed supported configuration. Do not edit the gateway repository or publish a backend issue without explicit instruction.
- Copy request IDs from the original terminal or gateway logs rather than transcribing screenshots. The earlier conversational transcription of a DeepSeek ID was not reliable and is not retained as evidence here.
- Retest only after a specific fix, supported configuration, or validated alternative is identified. Keep the CLI and IDE gates separate.
- Agent-run inference spend remains $0; user-run request count and cost are unknown. The aggregate authorized testing ceiling remains $10.
