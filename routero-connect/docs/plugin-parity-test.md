# Test the plugin against the successful manual run

Updated: 2026-11-24 (Asia/Singapore). Internal extension/CLI **0.0.5**, new helper **0.0.7**.

The manual `openai/gpt-6-luna` run on Codex **0.172.0** passed file reading, edits, six tests and a follow-up. We independently reran all six tests. [Evidence and limitations](validation/codex-01720-gpt6luna-success.md) remain separate from a plugin-managed connection.

We decided to provide isolated experimental validation because Routero does not show exact context/output limits. This mode applies only to **Routero UAT + openai/gpt-6-luna + Codex CLI 0.172.0**. It needs explicit consent and a dedicated home. It does not grant ordinary setup approval, advertise unknown limits, or enable the Codex IDE adapter.

## Prepared test directory

The original successful manual run was preserved. The initial baseline had the layout below. That local calculator now contains the completed six-test result and must be preserved. For a new run, copy the committed baseline files from `fixtures/validation/calculator/` into another fresh validation root:

```text
tmp/validation/codex-plugin-validation/
├─ codex-home/             # new config.toml target, initially empty
└─ calculator/
   ├─ calculator.py        # original add/multiply only
   └─ test_calculator.py   # original two passing tests
```

For later runs, use a new parent directory with a child still named `codex-plugin-validation`; do not overwrite completed results.

## Install and prepare credentials

1. Install `dist/routero-connect-0.0.5-win32-x64.vsix` in a separate VS Code test profile using **Extensions → … → Install from VSIX**. Hashes and inspected entries are in `dist/internal-artifacts.json`; the independent recovery CLI is in `dist/internal-cli/`. Packaging does not install into a normal profile.
2. Use trusted local Windows and VS Code 1.146.0+. The managed GUI-to-CLI process excludes host `CODEX_HOME`, provider keys and Node injection flags, and records their names without values. No manual environment cleanup is required for that managed process. A separate VS Code profile alone does not isolate Codex; the explicit config target does.
3. Run **Routero: Stage Codex Credential Helper**. Select actual **Node 24.18+ `node.exe`**, not Code.exe/npm.cmd. Choose a new private directory such as an expanded absolute `%LOCALAPPDATA%\RouteroConnect\helper\0.0.7` path, then confirm. Existing versions are not overwritten.
4. Run **Routero: Store Key for Codex**. Choose UAT and a new non-secret profile/reference such as `uat-luna-parity`. Enter an authorized UAT key with access to the recorded model in the masked field and confirm OS storage. Never paste it into chat, a file or an argument. Existing entries are not replaced; use the documented explicit CLI ownership/replacement commands when needed.

These steps require explicit confirmation before writing the OS credential store or staging a helper. Keys remain stored until explicitly detached. Use the same Node path for helper staging and connection.

## Configure through the plugin

Run **Routero: Connect**, then select:

1. **Codex CLI on Windows**.
2. **Isolated coding validation — GPT-6 Luna / Codex 0.172.0**; accept the unknown-limit/bounded-task warning.
3. The prepared **codex-plugin-validation** directory. Its `codex-home` child must already exist. The plugin derives `codex-home/config.toml` and refuses normal Codex configuration as a validation target.
4. The external Node executable, standalone **0.172.0** `codex.exe`, and staged helper directory.
5. A private recovery directory **outside Git**, such as an expanded absolute `%LOCALAPPDATA%\RouteroConnect\recovery\luna-parity` path. A new directory can be created during apply; do not select an unrelated existing directory. The test-only repository recovery exception is not enabled.
6. UAT and the exact profile/reference used to store the key.

Confirm model listing, then choose `openai/gpt-6-luna`, labeled experimental with `isolated-validation-opt-in`. Missing key visibility, another model/origin/version, or missing evidence remains blocked. Preserve existing fields for this fresh target and review conflicts rather than blindly replacing them.

Review the masked plan and confirm apply. The shared CLI checks the reviewed revision and current model/helper/client state and writes private recovery before replacement. Keep the returned change ID and recovery directory.

The generated model, URL, Responses, WebSocket and retry settings match the manual run. Authentication changes from a temporary environment key to the command-backed Windows helper. No context/output values are invented: this bounded task exercises the same native client defaults as the successful run. It is not long-context or unrestricted workload validation.

## Repeat the task using the plugin-generated configuration

Open a **separate PowerShell window**:

```powershell
$routeroTestRoot = "C:\Users\Acer\Downloads\Routero\routero-connect\routero-connect\tmp\validation\codex-plugin-validation"
$env:CODEX_HOME = Join-Path $routeroTestRoot "codex-home"
Remove-Item Env:ROUTERO_TEST_KEY -ErrorAction SilentlyContinue
Set-Location (Join-Path $routeroTestRoot "calculator")
codex --version
codex --no-daemon
```

Do not re-enter a key environment variable. Authentication should now come from the configured helper. Confirm version **0.172.0** and model **openai/gpt-6-luna**. Use the normal Windows sandbox setup if prompted; the plugin does not weaken it. `--no-daemon` avoids the long socket-path failure. Do not launch the normal VS Code instance from this test terminal.

In a fresh conversation, send:

> Read calculator.py and explain its contents. Do not edit files or run tests.

Then:

> Read calculator.py and test_calculator.py. Add subtract(left, right), with tests covering positive, negative, equal, and fractional operands. Preserve the existing functions and tests. Edit the files, run python -m unittest -v, and explain the results. Work only inside this calculator project.

Finally, in the same conversation:

> What does subtract(-3, -8) return? Explain briefly using the added implementation, and rerun the tests to confirm addition and multiplication still pass.

Independently inspect both files and run `python -m unittest -v`. Expect correct subtraction, four focused new tests, six passing tests, and follow-up answer **5**. Wording and tool choices may differ. Stop after a failure and retain the redacted error/copied request IDs rather than repeatedly retrying.

## Report and restore

Record plugin/client versions, model, key label (not value), actual editing tool, test output, title/request statuses, and actual charges. The reported $0.11/$0.52 per-million rates are not a complete run bill; keep the combined $10 testing ceiling. The subsequent authorized takeover used live inference; results and usage are recorded in the isolated setup validation record.

Exit the isolated Codex process after the task. In the original VS Code test window, run local **Routero: Doctor** and **Routero: Disconnect** for the recorded transaction. Review conflicts before restarting: later user/client edits are preserved and restoration can be partial. Keys/helpers remain available; remove only the owned test reference when no longer needed. Preserve recovery IDs and the standalone CLI for recovery after uninstall.

Restart without an environment key, switching/reverse-order restoration, cancellation, GUI/helper lifecycle, accounting and authoritative model limits remain further acceptance checks. Passing this isolated CLI parity task does not establish general model support or Codex IDE compatibility.

## Completed takeover

The shared setup controller and native Codex coding/continuation checks now pass with the existing 0.0.6 helper and stored credential. The fresh validation calculator now contains completed subtraction tests; preserve it as evidence. Further baseline runs require another fresh directory. See [the setup validation record](validation/setup-takeover-005.md).
