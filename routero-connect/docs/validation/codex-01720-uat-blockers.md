# Codex 0.172.0 UAT retest: separate title and tool-history failures

> Historical evidence: this record preserves the observed combination and original verification scope. See the [maintainer handoff](../handoff.md) for the current status and subsequent validation.

Recorded: 2026-11-24 (Asia/Singapore). Evidence: recorded terminal and Routero dashboard screenshots, plus a read-only structural inspection of the isolated local Codex session. This is a finding for gateway/client investigation, not a confirmed gateway patch or an approved model combination.

## What this means for project progress

Codex can start, contact Routero, and read the calculator file. It still cannot finish the answer after that read. The dashboard also reveals a separate failed request that tries to generate a short task title. Fixing the title error alone would not establish that the file-reading conversation works.

The failures occurred during a manually configured native Codex test, outside the plugin's request path. The plugin selects configuration and credentials; it does not intercept or rewrite Codex's live requests. No plugin setting has been identified that safely fixes either failure. Request generation and the gateway's protocol translation are the appropriate investigation boundaries. Gateway ownership is suspected where translation changes the request, but cannot be assigned without comparing incoming and upstream payloads.

## Test conditions and local startup

- Client: Codex CLI **0.172.0**, Windows; model: `deepseek/deepseek-v4-flash`; Routero UAT `/v1` provider using Responses.
- The test uses a separate project-local `CODEX_HOME` and disposable `calculator-cli` directory. Normal VS Code/Codex configuration was not replaced during implementation checks. Provider keys were supplied through the test terminal environment, not recorded here.
- The long isolated home initially exceeded the background server's socket-path limit (`SUN_LEN`). The manual retest launched with `codex --no-daemon`, then completed Windows sandbox setup. This local startup issue is separate from the API errors below.
- Prompt: read and explain `calculator.py`, without edits or tests. The terminal shows approval for `Get-Content`, followed by the displayed file-read action and an upstream error.
- Manual request count and aggregate spend are not established. The screenshots below provide selected rows, not a complete accounting record. Local baseline inference requests/spend for this investigation remain 0 / $0.

## Failure A: task-title request rejected for JSON-mode requirements

The expanded Routero failure details show the same DeepSeek model and error code `invalid_request_error`. The upstream message says the prompt must contain the word `json` to use `response_format` type `json_object`.

The displayed input asks for a concise task title, at most 36 characters and preferably fewer than five words, without markdown or trailing punctuation. It instructs the model not to answer the underlying request. The calculator prompt appears as material to summarize. This is an auxiliary title-generation request, not the file-read tool-result continuation itself.

DeepSeek documents JSON output as requiring both a JSON-object response format and a prompt mentioning JSON with format guidance. See [DeepSeek JSON Output](https://api-docs.deepseek.com/guides/json_mode/). The screenshot demonstrates an upstream JSON-mode rejection, but does not expose the complete raw incoming request or prove who selected that response format. The collapsed history is not a substitute for the full wire payload.

Gateway/client maintainer checks:

1. Compare the original title request's Responses `text.format` or other structured-output fields with the translated upstream `response_format`. Check model/deployment defaults and any JSON-mode policy as well.
2. If the title request expects plain text and did not request JSON, preserve that contract: investigate where JSON mode was introduced and remove the unintended transformation at its source.
3. If the caller actually expects a structured title, preserve its schema and parsing contract. Generate provider-compatible JSON instructions/format through a reviewed translation, or choose an independently validated route for that operation. Do not simply remove structured output and hope the caller accepts plain text.
4. Retest title creation separately from file/tool continuation. Adding the word `json` to the calculator prompt is not a verified fix for a separately constructed title prompt and could change task behavior.

No `response_format`, `json_object`, or task-title generation is currently implemented in the plugin's `src/` request code. This is not evidence that Codex or the deployed gateway omits those fields; they generate/translate requests independently.

## Failure B: file-read continuation rejected for tool-history ordering/pairing

The separate terminal error reports insufficient tool messages following assistant `tool_calls`, through LiteLLM/DeepSeek. Its fallback chain also reports an unavailable BytePlus endpoint; that deployment problem is a third, separate concern.

A structural inspection of the isolated local session found one `exec_command` function call and a nonempty function-call output with the **same call ID**. An assistant message occurs between them in the recorded sequence:

```text
function_call: exec_command
assistant message
function_call_output: matching call ID, output present
```

This narrows the earlier hypothesis: the result exists in local history. It does not prove that the outbound request included it or that gateway conversion preserved the complete sequence. The intervening message has text; it is not established to be the same blank-message defect reported elsewhere.

Related primary issue reports describe Codex-to-LiteLLM-to-DeepSeek failures with an inserted assistant message between calls and results: [LiteLLM #32992](https://github.com/BerriAI/litellm/issues/32992) and [#31553](https://github.com/BerriAI/litellm/issues/31553). These are comparison cases, not proof of a deployed fix or this run's exact cause.

Capture the actual incoming Responses items and translated upstream conversation for the failed request. Preserve roles, ordering, tool names, and call/result IDs while removing credentials and file contents. If the incoming request omits the result, investigate Codex's outbound history. If the result arrives but upstream translation loses or misorders it, investigate Routero/LiteLLM. If every upstream call is correctly paired and ordered, investigate the provider's handling and remaining request details. Do not fabricate successful empty tool results, discard tool calls, or replay an executed tool to obtain HTTP success.

## Dashboard rows: what is established

The dashboard screenshot shows organization **Admin Group** and three selected rows on 2026-11-24. Times below are copied as displayed; the dashboard timezone is not established.

| Displayed time | Result | Displayed metrics | Interpretation |
| --- | --- | --- | --- |
| 09:59:19 | Success | 13194 total tokens (12898 input + 296 output), $0.004436, 1.941 s | At least one selected request succeeded and has a displayed charge; not proof of complete task success |
| 09:59:19 | Failure | Expanded details: JSON-mode title error, 0 tokens, $0.000000, 0.335 s | Separate auxiliary request rejected; request prefix shown as `c94290a7-7a00...` |
| 09:59:26 | Failure | List view: 0 tokens, cost shown as a dash, 1.768 s | Failure details not supplied; do not equate this row with the terminal tool-history error without correlating IDs |

No full request/session IDs are reconstructed from screenshots. Copy full IDs from the dashboard for an actual trace lookup. A zero-token row or cost dash does not establish total run cost, fallback cost, or the combined testing spend.

## Recommended action and retest gate

Treat title generation and coding continuation as independent reproductions. Ask the gateway maintainer for the deployed Routero revision, LiteLLM version, selected deployment/policy defaults, and the corresponding sanitized incoming/upstream requests. Apply any fix in the responsible client/translation/request-generation component, outside this plugin's configuration scope. No gateway code, policy, key, or remote issue was changed by this investigation.

After a specific fix or validated alternative is identified, use a fresh conversation to retest the file-read prompt, then the edit/test/follow-up task. Check title generation independently and reconcile billed usage/fallback attempts. Keep the production compatibility catalog blocked until the full client/model combination has reviewed evidence; a title fix or a successful initial request alone is insufficient.
