# Project progress and compatibility

Last updated: 2026-11-22 (Asia/Singapore).

## Where the project stands

**Phase 2 is in progress. Basic communication with Routero works, but the tested Codex coding workflows do not yet complete.** This phase checks whether an existing Codex client can reliably use Routero before the plugin starts automating setup.

The plugin currently opens this report and explains that setup is not ready. It has not configured the tested clients and does not handle their model requests. These test failures therefore occurred in the manually configured Codex-to-Routero workflow, not in a completed plugin workflow.

## What Phase 3 adds

The project now has a shared code foundation and an offline command-line tool for project status, API-address validation, and clearly labeled readiness reports. Future setup can use the same rules for gateway addresses, credential references, model eligibility, and redacted errors. This work does not send model requests, store keys, or change Codex settings.

The versioned compatibility catalog preserves the two failed Phase 2 combinations and offers no activatable model. Phase 3 can be developed independently, but it does not complete Phase 2 or make the coding workflow ready. See the [architecture](docs/architecture.md) and [development guide](docs/development.md) for implementation details.

## What Phase 4 adds

The CLI can now keep a key in Windows' secure credential store and let a separate helper retrieve it for a client. It tracks shared ownership so removing one profile does not delete another profile's key. An approved native test installed helper version 0.0.3 outside the extension directory, exercised a dummy key across separate processes, and confirmed that both installed Codex engines could obtain that dummy token for a local test server. The dummy credential was removed afterward.

No supplied real key was stored, no client settings changed, and no live model request was made. This confirms credential handling, not a working coding task or actual VS Code GUI acceptance. Phase 2's failures remain unresolved. See [credential instructions](docs/credentials.md) and [Phase 4 validation](docs/phase-4-validation.md).

## What Phase 5 adds

The project can now prepare a redacted configuration preview, apply reviewed field changes, and restore the fields it managed while retaining later user edits. It creates private recovery records and reports conflicts rather than silently overwriting them. The engine and demonstration have used dummy files inside the project only; your live Codex configuration has not been changed.

This is preparation for the real setup workflow. There is not yet a production configuration command or client adapter, and the earlier live coding failures have not been retested or reclassified. See [the configuration guide](docs/configuration-engine.md) and [Phase 5 validation](docs/phase-5-validation.md).

## What the tests show

| Activity | Current result | What this means |
| --- | --- | --- |
| Ask Codex for an ordinary text reply | Worked in the user's latest test | Codex returned `READY`; the connection can carry a simple request and response |
| See models available to a Routero key | Worked for both supplied test keys | Models can be listed, but appearing in that list does not prove they can complete a coding task |
| Ask DeepSeek to open a local file | The file read was shown, then an error stopped the answer | Part of the coding workflow works; Codex could not finish explaining the file after reading it |
| Complete the calculator coding task with DeepSeek | Did not complete | File reads were shown, but completed edits, test execution, and the final explanation were not verified |
| Complete the calculator coding task with GPT-4o | Did not begin visible file work | The model service rejected the description of a tool supplied with the request |
| Complete the workflow in the VS Code interface | Not yet tested | Results from the standalone command-line client cannot establish that the VS Code interface works |
| Cancel a response, handle long conversations, or confirm Routero policies | Not yet verified | These checks remain open; no support claim is made |

## The latest, smaller test

The user supplied a screenshot of this sequence:

1. Asked for exactly `READY`; Codex returned `READY`.
2. Asked: ?Read calculator.py and explain its contents. Do not edit files or run tests.?
3. Codex announced the read and displayed that it had read `calculator.py`.
4. The next request failed. The error said that a tool action did not have all the matching results in the conversation sent to the model.

Both prompts appear in one conversation. This is a useful reproduction, but it is not a separate fresh-conversation test. The selected model is reported as `deepseek/deepseek-v4-flash` from the surrounding test discussion; its name is not visible in this latest screenshot.

This shows that the larger editing task and the earlier unsuccessful file search are not needed to encounter the problem. A file read followed by an attempted answer was enough in this run. It does not show which component omitted or changed the required information.

## What remains uncertain

There are two different failures: GPT-4o rejected a tool description, while DeepSeek stopped after a file read because the next request lacked matching tool results. The unavailable backup model service is a separate issue reported in the errors.

The user also reported trying the previous configuration again. Simple text prompts still worked, while the coding task failed. That makes the newly suggested profile a less likely sole explanation, but does not prove all settings are correct. The actual cause could involve Codex, its settings, Routero's handling of requests, conversation history, or the selected model service.

Previous Routero use succeeded, but the exact earlier model, settings, and gateway version have not been matched to the current tests. **A change since the successful test is possible, but not confirmed.** This is not evidence that Codex can never work through Routero.

## Tested versions and scope

| Interface | Version recorded | Current coding-workflow status |
| --- | --- | --- |
| Standalone Codex on Windows | Codex 0.157.1; Windows 10.0.26200.0 | GPT-4o and DeepSeek attempts failed; neither is approved for a complete coding workflow |
| Codex in VS Code | VS Code 1.146.0; extension 26.1111.21308 | Not yet tested through the actual interface |

The engine included with the VS Code extension is version `0.169.0-alpha.11.1`, different from the standalone client. Local checks showed that both engines can use a command to obtain a dummy test token. Those checks used a local test server and did not prove real model or VS Code interface compatibility.

Tests target Routero's UAT environment (`https://api-uat.routero.ai`). The exact gateway version running there is unknown. Findings apply to the reported runs, not every model, platform, or Routero deployment.

## What happens next

Do not repeat the same failed task or switch through models without a specific reason. The useful next step is to compare what Codex sends after the file read with what the selected model service receives, and to compare the current setup with the previously successful one. This investigation has not been assigned to a confirmed faulty component.

Once a specific correction or known-working setup is identified, repeat the small file-reading test first. If that passes, return to the full read ? edit ? run tests ? follow-up task, then test the VS Code interface separately. Phase 2 should not be described as passed until the required evidence is recorded or its remaining scope is explicitly revised.

The full [manual test guide](docs/phase-2-manual-validation.md) is available for a targeted retest. [Technical error details](docs/validation/codex-manual-blockers.md) and the [test record](docs/phase-2-validation.md) are separate references for readers who need more detail.

## Costs and safeguards

Agent-run checks have made no billable model requests, so their model-request spending is $0. The user has run live tests; their total request count and cost are unknown. **Total Phase 2 spending must not be reported as $0.** The authorized testing ceiling remains $10 across both supplied keys.

The user reports that the Admin Group key has no key budget and that the demo key's previous $0.01 budget was removed. Current policy settings and model prices have not been confirmed. The account-information check also returned an error, so it did not establish a spending baseline; that error is not being treated as budget exhaustion.

All project edits remain inside this repository. No API keys are included in the documentation. No gateway settings were changed by the agent. The user manually tested and changed their own Codex configuration; the agent did not edit their normal settings.

## Earlier preparation

Phase 1 produced the [gateway source assessment](docs/gateway-assessment.md). Phase 2 preparation added a small calculator project and safety checks for the test tools. Six offline checks for safe account discovery and two calculator baseline tests passed. These are useful preparation, not proof that the coding workflow passes.

Recorded measurements are available in the [evidence file](docs/validation/phase-2-evidence.json). Older no-live-test statements refer to the agent-run baseline before the later user-reported attempts.
