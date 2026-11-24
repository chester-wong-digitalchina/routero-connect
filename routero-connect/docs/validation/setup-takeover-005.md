# Isolated setup validation and live coding validation

Date: 2026-11-24 (Asia/Singapore). Extension/CLI fix: 0.0.5. Native Codex: 0.172.0. Target: Routero UAT, `openai/gpt-6-luna`.

## Outcome

We completed the real shared `SetupController` and `NodeCliRunner` workflow using the existing `uat-luna-parity` credential reference and private helper 0.0.6. The reviewed configuration was applied to the dedicated validation home, with private recovery outside Git. The normal Codex configuration had an identical SHA-256 before and after setup. No key was replaced, printed, or embedded in the configuration. The gateway was unchanged.

Native Codex then used that generated command-backed authentication to read the calculator, add subtraction and four tests, run all six tests successfully, and complete a resumed conversation. The continuation returned `5` for `subtract(-3, -8)` and reran all six tests successfully. This establishes basic plugin-generated CLI coding parity for this exact combination. Setup used the actual shared controller with predetermined authorized selections, rather than GUI clicks. The live run used compiled project code; installed-artifact smoke checks remain separately reported.

## Repaired blockers

- The official Windows installation links its stable `bin` directory to a versioned release. The old detector rejected this directory link as `client-unavailable`. Read-only selection now resolves and verifies the canonical executable; configuration and recovery write-path protections remain strict. Apply rejects a changed executable target after preview.
- The gateway returned HTTP 200 with 16 model entries, including two printable aliases outside the CLI's supported model-ID syntax. Previously those aliases invalidated the entire listing. Valid IDs now remain available, with a count-only exclusion warning. Malformed, secret-bearing and duplicate valid IDs still fail closed.
- Generic GUI rejection hid the actionable diagnostic. Recognized structured failures now display a bounded, redacted diagnostic code and message.
- Windows helper path matching now respects filesystem casing, including the existing manifest's lowercase drive letter.

## Local execution and sandbox

The fresh home had no Windows sandbox selection. The first live turn authenticated but command execution was blocked by local policy; exit code zero alone did not establish success. We then used the same `windows.sandbox="elevated"` choice as the successful manual setup, with `--approve-for-me` and `--no-daemon`. The coding task and resumed continuation passed. No approval or sandbox bypass was used. A proposed persistent `--trust` flag was rejected by automatic review and was not executed; the successful runs did not use it.

The optional local launcher in `tmp/validation/start-routero-codex.cmd` selects only the isolated home and the elevated Windows sandbox for that invocation. It clears temporary API-key overrides and does not edit the normal Codex home. Native model-catalog decoding and curated-plugin synchronization warnings were observed; neither prevented the recorded coding task. These warnings are not equivalent to general client compatibility approval.

## Recovery and evidence

- Configuration: `tmp/validation/codex-plugin-validation/codex-home/config.toml`.
- Completed calculator: `tmp/validation/codex-plugin-validation/calculator`.
- Transaction: `e84ea179-8f27-4028-acad-df4203dd38dc`.
- Private recovery: `%LOCALAPPDATA%\RouteroConnect\recovery\takeover-de5bec02-defd-4df8-94c4-ba5c1a6f6434`.
- Local ignored evidence: `tmp/validation/takeover-setup-result.json` and `takeover-codex-*.jsonl`.

The setup harness did not save the recovery shortcut in VS Code global state. Recovery remains available through the standalone CLI using the explicit configuration, recovery directory and transaction ID above. Completed calculator files must not be overwritten for another baseline test.

## Spend and remaining scope

Three live turns were run: one locally blocked task, one successful coding task, and one successful continuation. Reported usage totals were 158,624 input tokens and 3,138 output tokens. Applying the supplied $0.11/$0.52 per-million rates without cache discounts gives about $0.0191. This is an estimate, not a gateway invoice; actual gateway charges remain unconfirmed. Read-only model listing also ran. No unbounded retry loop was used.

Exact context/output limits remain unavailable, so ordinary model approval stays blocked. DeepSeek protocol failures, Codex IDE support, long-context behavior, broader lifecycle/recovery acceptance and authoritative billing remain separate work. This result closes the immediate isolated CLI setup blocker without asserting complete Phase 7 or production readiness.

## Regression and installation checks

Type checking, lint and all 123 unit tests passed. New coverage includes the linked executable directory, changed executable after preview, unsupported model aliases and redacted actionable UI failures. The 0.0.5 VSIX passed archive inspection and both installed-extension host checks on VS Code 1.146.0. Those host checks cover activation, command registration and the packaged report; they do not simulate a live GUI wizard.

The corrective 0.0.5 extension was installed in the existing normal VS Code extension directory under the isolated setup validation authorization. Its installed CLI bundle matched the audited build. A local doctor run against the actual isolated configuration passed client, helper, environment and configuration inspection. Its expected nonzero result still indicates incomplete general coding approval, not a failed local prerequisite. The active VS Code extension host needs a window reload to load the replacement bundle; setup and live coding validation are already complete independently of that reload.
