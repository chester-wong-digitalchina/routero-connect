# Phase 2: manual Codex validation

Status: live CLI attempts failed; pause retries pending maintainer evidence. Last updated: 2026-11-17 (Asia/Singapore).

See [reported blockers](validation/codex-manual-blockers.md). Both GPT-4o and DeepSeek failed the coding gate. The steps below remain the acceptance procedure for a later targeted retest; do not repeat them blindly.

The user will report live results when gateway/client behavior needs checking. Do not spend time debugging the self key-info failure or change gateway settings to make this test pass. No policy, key budget, normal user configuration, or external repository changes are automated by this guide.

## Before testing

Use an existing working **Routero UAT** Codex connection. If one is not already configured, stop and report that; this guide does not ask you to install an unimplemented credential helper or paste a key into TOML. Historical environment-variable setup is not the final plugin credential design; the local dummy-helper probe is not a production secret store.

Record only non-secret facts:

- Interface (standalone CLI or VS Code extension) and version. Observed baseline: CLI `0.157.1`; VS Code `1.146.0`; extension `26.1111.21308`, bundling engine `0.169.0-alpha.11.1`.
- Selected public model ID and provider base URL (`https://api-uat.routero.ai/v1`). Use the OpenAI-backed model that previously worked. `openai/gpt-4o` is listed for both supplied keys but has not passed this project's live acceptance.
- Key label: `test` / Admin Group or `test_demo` / demo, never the secret.
- Active key/model policy names and enabled capabilities, or explicitly `none`/`unknown`. No automatic policy changes.
- Current key spend and the selected model's input/output prices shown by Routero, if available. Do not assume provider retail pricing is Routero billing.

Neither key currently has a configured key budget according to the user: the demo key's previous $0.01 budget was removed and Admin Group had none. The authorized **combined testing ceiling remains $10**. Do not run repeated tasks or large-context tests if cost visibility is unavailable. Report that limitation first.

## 1. Prepare the disposable calculator

From this repository in PowerShell, create a project-local scratch copy. Run this preparation once; do not overwrite a completed run before its result is recorded.

```powershell
New-Item -ItemType Directory -Path .\tmp\validation\calculator -ErrorAction Stop
Copy-Item .\fixtures\validation\calculator\calculator.py .\tmp\validation\calculator\
Copy-Item .\fixtures\validation\calculator\test_calculator.py .\tmp\validation\calculator\
Push-Location .\tmp\validation\calculator
python -m unittest -v
Pop-Location
```

The baseline should pass two tests and contain no subtraction function. Keep CLI and IDE acceptance in separate fresh copies (e.g. `calculator-cli` and `calculator-ide`) if testing both.

## 2. Run one coding task

Open the scratch calculator directory as the working project in the existing Routero-connected Codex client. Confirm the selected provider/model before sending:

> Read calculator.py and test_calculator.py. Add a subtract(left, right) function and tests for positive, negative, equal, and fractional operands. Use your normal file-editing tool, run python -m unittest -v, and explain the changes and test result. Work only inside this calculator project.

Watch for actual file-read, edit, and shell/test actions. Record whether the editing tool is `apply_patch` or something else; permission to use a different editing tool does not establish custom-tool compatibility. A suggested code block alone is not a successful edit. Do not approve actions outside the disposable project.

## 3. Follow up in the same conversation

> What does subtract(-3, -8) return? Explain using the implementation you just added, and confirm that the existing multiplication test still passes.

Expected arithmetic: `5`. Record whether Codex retained the task context and obtained/used actual tool results.

Independently inspect both files and run `python -m unittest -v` from the scratch directory. Check that addition/multiplication remain and subtraction handles `(5, 2) → 3`, `(-3, -8) → 5`, `(4, 4) → 0`, and `(1.5, 0.25) → 1.25`.

## 4. Cancellation and policy cases

Do these only after the coding baseline succeeds and spending is known. Stop after one failure and report it; do not repeatedly retry.

- **Cancellation:** request a longer harmless explanation without tools, cancel while output is streaming, and record whether output stops and the client accepts a new prompt. This does not prove upstream billing stopped or a background cancellation endpoint works.
- **Existing greeting policy:** if already active, record whether its greeting is visible in the result. No greeting without a bound greeting policy is not a failure.
- **Existing `modulo` content filter:** only if already configured, send a harmless matching prompt, then a non-matching prompt in that conversation and in a fresh conversation. Report all three results. History may retain the blocked term; do not treat repeated blocking alone as a defect.
- **Caching:** do not infer an exact-cache failure from repeating a prompt in one conversation. The full request changes with history/tools. Mark caching untested until complete request bodies and gateway cache evidence can be compared under a controlled test.
- **Context/compaction:** leave untested until a bounded scenario and pricing are established. Do not manufacture a huge conversation to trigger a limit.

## 5. Report back

Use this template separately for CLI and IDE. Do not send raw config, terminal environment dumps, tokens, or screenshots containing secrets.

```text
Date/time:
Interface/version:
Model / base URL:
Key label / active capabilities:
Read file: pass/fail/not tested
Edit file / actual editing tool: pass/fail/not tested
Tests executed by Codex / independent test result:
Follow-up: pass/fail/not tested
Streaming / cancellation:
Greeting / content filter (only if already configured):
Warnings/errors (redacted):
Spend before / after / cost of this run:
Any action outside the disposable directory:
```

The CLI and IDE remain unverified until actual results are recorded. A loopback auth test, model listing, or one-word response cannot substitute for this workflow.
