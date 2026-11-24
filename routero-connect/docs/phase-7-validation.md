# Phase 7 validation and remaining work

> Historical checkpoint: results and restrictions below describe this phase at the time of its checks. For the current 0.0.5 state, handoff priorities and validated scope, start with the [maintainer handoff](handoff.md). Later results do not retroactively change earlier test evidence.

Updated: 2026-11-24 (Asia/Singapore). Branch: `phase-7`, created from Phase 6 commit `3e81bb1`. Scope: [issue #6](https://github.com/chester-wong-digitalchina/routero-connect/issues/6), read without modification.

## Initial 0.0.2 outcome

Native VS Code commands now wrap the shared CLI: Connect, Doctor, Test Model, Disconnect, explicit masked key storage, and helper staging. Internal version 0.0.2 has packaging and archive-content checks. The wizard uses a separately selected Node executable, masked inputs, Quick Pick, modal previews/consent, progress/cancellation, notifications, and a redacted Output Channel.

**A working Routero coding connection is not established.** The production catalog still has no approved model, and Connect refuses before key collection or configuration changes. The CLI wizard and the Codex IDE interface are separately labeled; the IDE adapter remains pending. Synthetic wizard success is not real coding evidence.

## Automated evidence

- The initial 107-test TypeScript suite passed, including type checking and zero-warning lint. New tests cover wizard sequencing, blocked/unsupported combinations, IDE separation, preview/apply revision, key consent/masking/stdin, credit consent, local doctor, disconnect, selection cancellation, failure redaction, concurrent-command exclusion, CLI framing, clean child environment, and a real Node subprocess receiving a dummy secret through stdin. Follow-up cases cover explicit helper consent and recovery after shortcut/uncertain-apply failures; the final suite contains 110 tests.
- After simplifying key/text-test prerequisites, all 16 focused UI/runner tests passed again. No native Windows credential or real model was used.
- Long masked previews now retain up to 65536 characters in CLI/UI protocol messages instead of being clipped to the diagnostic-line limit. Output-channel diagnostic logging retains its smaller bounds.
- New staging uses helper 0.0.5 because the CLI bundle changed. Prior 0.0.3/0.0.4 remain accepted; installed helpers were not accessed or changed.

- `npm run package:internal` passed: production type/lint/build checks, official VSIX packaging, actual ZIP allowlist/content audit, standalone CLI copy and SHA-256 records. The VSIX has 29 inspected entries; no dependencies/source/tests/scratch/private recovery/other archives or synthetic compatibility rows are included. The known esbuild ancestor-read restriction required the approved build outside the sandbox, with outputs inside the project. Artifacts are internal and not published.
- VS Code **1.146.0**, downloaded into `.vscode-test`, passed **2 development-host smoke checks**: activation/registration and opening the bundled progress report. An initial cold-launch run passed registration but exceeded the default 2-second report-open timeout. With a 15-second harness timeout and built-in AI features disabled only in the isolated test profile, both passed.
- `npm run test:installed` installed the actual VSIX into `tmp/validation/phase-7-installed/extensions`, confirmed version 0.0.2, and passed **2 installed-host checks**. The test asserts the extension path is inside that isolated installation, not the source development extension. No wizard action, credential operation or Codex task ran in these host checks.
- The installed harness initially assumed an old VS Code resource path, then inherited Electron's Node mode. Both harness issues were corrected: it reads the fixed module path from the pinned build's official launcher without executing a shell, and clears Electron CLI mode for app launch. The isolated install/host check then passed. Test logs and profile data remain project-local and ignored.

Packaging does not itself install the extension; the separate installation check uses only its project-local test profile. Neither host smoke nor synthetic wizard tests establish live coding compatibility.

## Support and acceptance matrix

| Surface | Current evidence | Still required |
| --- | --- | --- |
| Native wizard controlling Codex CLI | Synthetic controller flows, real Node stdin bridge, isolated installed-VSIX activation/report checks | Real wizard/key/helper setup, coding task and restart acceptance |
| Codex CLI 0.157.1 through Routero | Historical command-auth evidence; Phase 2 coding failures retained | Resolve/retest tool schema/history failures, metadata/context and coding loop |
| Codex IDE interface | Explicitly unavailable in the wizard; no inference from CLI results | Pinned IDE adapter, separate compatibility records, GUI coding and lifecycle tests |
| Helper 0.0.5 | Private staging/hash/transport tests | Native auth, restart/update and GUI-launch acceptance |
| Other platforms/remote workspaces | Setup refused | Separate platform/remote increments |

## What must happen before a working connection can be claimed

The subsequent manual Codex 0.172.0 retest still fails after a file read and exposes a separate JSON-mode task-title rejection in Routero's dashboard. These are outside the plugin's live request path; see [the retest finding](validation/codex-01720-uat-blockers.md). The selected success-row charge is recorded there separately from unknown aggregate user spending. No gateway fix or compatibility approval is inferred.

1. Reproduce and resolve or rule out the current tool-schema/tool-result failures using a pinned Codex version, gateway deployment, permitted model, and manually configured policy. The responsible component remains unconfirmed.
2. Record real read → edit → execute tests → follow-up, streaming/continuation/cancellation, model limits/metadata, context/compaction behavior, and usage/billed-cost evidence. Only then review the compatibility catalog; do not add synthetic records or a bypass.
3. Implement/pin the Codex IDE adapter and its version handling, then repeat the coding and lifecycle matrix independently of CLI results.
4. Validate a fresh isolated VSIX installation, masked credential transfer and helper 0.0.5 from GUI launch, restart, switching, cancellation, disconnect, and standalone recovery after uninstall.
5. Reconcile support labels, internal artifacts, documentation, actual run counts and any remaining failures before internal release. Native credential installation and normal user-setting writes remain separately authorized actions.

No gateway/policy/source changes, native credentials, installed helpers, normal user configuration, or remote issue updates are part of this development increment. Inference requests/spend remain **0 / $0**. See the [installation and recovery guide](vscode-setup.md).

## Follow-up: successful Luna task and explicitly authorized validation mode

A subsequent manual run on Codex 0.172.0 with openai/gpt-6-luna completed read/edit/six tests/follow-up, and we independently reran all six tests. A separate dummy-token native probe confirmed the command-auth interface on 0.172.0 with exactly one loopback Responses POST and expected HTTP 418. No live inference or OS credential store was used during implementation checks.

Reported pricing is $0.11 input / $0.52 output per 1M tokens but confirms exact context/output limits are not shown. We decided to permit a separate isolated coding-validation mode for this specific real-evidence UAT/model/version combination with unknown metadata preserved. Ordinary eligibility is unchanged. The UI/CLI require explicit opt-in and the dedicated codex-plugin-validation/codex-home/config.toml target; all usual preview/revision/visibility/auth/recovery checks remain in effect. New artifacts are 0.0.3 and new helper staging is 0.0.6; prior installed helpers are untouched.

See [the evidence](validation/codex-01720-gpt6luna-success.md), [native probe result](validation/codex-01720-command-auth.json), and [plugin parity instructions](plugin-parity-test.md). The prepared baseline has two passing tests; the original successful manual run was preserved. Actual plugin-configured live parity, exact metadata, restart/GUI helper lifecycle, accounting and IDE support remain unverified. Earlier 0.0.2 build/test counts above remain historical records; current artifact contents/hashes are in dist/internal-artifacts.json.

Final follow-up validation: all **117 unit tests**, type checking, lint and internal packaging passed. The 0.0.3 VSIX has 33 audited entries, valid runtime hashes, and a standalone CLI whose isolated-validation help and wrong-root refusal passed smoke checks. Its isolated installed-extension checks passed **2/2** on VS Code 1.146.0. A first run activated but timed out opening the report while the heavy permission suite was also running; rerunning the host checks alone passed in 164 ms. Run these suites serially when checking GUI latency. No live model request, real native credential storage, or normal-profile write was performed during implementation checks. At this 0.0.3 checkpoint, the live plugin parity task remained the next validation step. The later 0.0.5 result is recorded below.

## Isolated setup validation follow-up

The subsequent 0.0.5 takeover fixed executable detection and model-list parsing, applied configuration through the actual shared controller, and passed native calculator coding plus resumed continuation using the existing stored credential/helper. The earlier no-inference and pending-parity statements above describe their historical checkpoints. See [the setup validation evidence](validation/setup-takeover-005.md) for current scope and remaining limitations.
