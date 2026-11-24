# GUI environment guard: false block before model listing

> Historical evidence: this record preserves the observed combination and original verification scope. See the [maintainer handoff](../handoff.md) for the current status and subsequent validation.

Recorded: 2026-11-24 (Asia/Singapore). Fixed internal extension version: **0.0.4**.

## Finding

The isolated Connect flow stopped at model listing with the GUI message that authentication or Codex environment overrides were present. Reopening VS Code did not resolve the reported failure. The message did not identify the variable names, and no values were requested or captured for this investigation.

The UI bridge called `assertCleanEnvironment` on the VS Code host environment before constructing its already allowlisted CLI child environment. A host variable such as a provider key, CODEX_HOME or Node injection option could therefore block the operation even though the managed child would never receive it. This is a plugin guard-ordering issue, independent of the earlier gateway title/tool-history failures. The exact variable in the reported host was not established and is not asserted here.

## Decision and implementation

We decided to check the environment actually supplied to the managed Node/CLI process. The UI reads host state once, builds the existing explicit allowlist and validates the resulting child environment. It does not mutate VS Code, permanent environment settings, other terminals, stored credentials or login files.

The allowlist retains only required Windows/profile/temp fields. Provider keys, Codex overrides, NODE_OPTIONS, NODE_PATH and ELECTRON_RUN_AS_NODE are not inherited. A structured `managed-cli-environment` message lists ignored canonical variable names only. Arbitrary environment names and all values remain undisclosed. Explicit target/profile arguments and the selected credential helper remain authoritative.

The standalone CLI's environment guard is unchanged. A direct CLI invocation from a terminal with conflicting routing/authentication variables still requires resolving that terminal's overrides. The GUI bridge's cleaned process is a separate case, not a global bypass.

The CLI/helper bundle remains unchanged, so existing helper **0.0.6** and previously stored profile/reference credentials remain usable. No helper overwrite, key replacement or gateway change is required.

## Verification and next action

Regression tests start an actual dummy Node process while its simulated host contains a key, private home, invalid module injection, module path and Electron Node mode. Model-list execution is no longer blocked, all those variables are absent from the child, diagnostics contain names without values, and the original host object is unchanged. Existing token-print rejection, secret stdin transfer, framing, cancellation and wizard tests remain in place.

Install the refreshed `dist/routero-connect-0.0.4-win32-x64.vsix`, reload the extension host when prompted, and retry the isolated Connect flow with the existing helper/profile/reference. Repeating key storage or helper staging is unnecessary. The Output Channel should show any ignored override names followed by the actual CLI/model-list result. A later credential, network, model or configuration failure must be investigated on its own evidence rather than treated as the old environment block.

The fix does not establish live coding parity or model/IDE support. No real credential, normal Codex setting, global environment variable or gateway file was modified during implementation.
