# Routero Connect in VS Code

Updated: 2026-11-24 (Asia/Singapore). Internal build: **0.0.5**, Windows x64.

The extension has native setup controls and a real manual coding success for GPT-6 Luna on Codex 0.172.0. **Ordinary model approval remains blocked by unknown metadata and remaining acceptance checks.** We decided to add isolated coding validation in build 0.0.3 for this exact UAT/model/version, with separate opt-in and a dedicated home. Follow the [plugin parity procedure](plugin-parity-test.md); this does not enable other failed/unverified combinations or grant full support.

The wizard targets the **Codex CLI on Windows**. The Codex VS Code interface is shown as unavailable because its adapter and coding acceptance need separate work. Configuring the CLI does not establish IDE support. Doctor, explicit key/helper setup, and the small text test remain independently available.

## Internal installation

Build with `npm run package:internal`. The build produces:

- `dist/routero-connect-0.0.5-win32-x64.vsix`: the internal extension.
- `dist/internal-cli/`: a self-contained CLI script, version/hash manifest, and recovery instructions. Node must be installed separately.
- `dist/internal-artifacts.json`: hashes and the inspected VSIX file list.

Nothing is published or installed by packaging. The separate automated installation smoke check uses a project-local test profile only; it has passed activation/report checks without a model or key. Source, tests, scratch files, dependencies, logs, credential runtime files, other archives, and private recovery records are excluded by a package allowlist and archive inspection. A package scan is not a complete independent security audit. The internal publisher label `routero-internal` is a local package identifier, not a Marketplace publication or verified publisher claim. The project remains unlicensed for redistribution; no license grant is implied.

For a separately authorized manual installation, use **Extensions → … → Install from VSIX** in a fresh VS Code profile. Review the artifact manifest first. Keep the `internal-cli` directory outside the extension installation so recovery remains available after uninstall. Packaging never installs into a normal profile. The separately authorized 0.0.5 setup validation did install the corrective extension; this is a recorded local setup action, not build behavior.

The manifest requires VS Code **1.146.0 or later in 1.x**, matching the existing API baseline. Packaging alone does not prove that the installed VS Code version satisfies this requirement. Setup is limited to trusted workspaces on local Windows. Remote SSH, WSL, containers, virtual workspaces, macOS, and Linux are not enabled.

## Commands

| Command Palette entry | What happens |
| --- | --- |
| **Routero: Connect** | Chooses the CLI or explains the unavailable IDE target; approved CLI combinations can proceed through model selection, masked preview, and explicit apply |
| **Routero: Doctor** | Reviews selected local prerequisites; optionally reads a stored key to list model permissions; never runs inference |
| **Routero: Test Model** | Lists visible models, then asks separately for credit consent before one bounded text request; it cannot approve coding compatibility |
| **Routero: Disconnect** | Reviews and restores one recovery transaction; later edits and credentials are retained |
| **Routero: Store Key for Codex** | Collects a key in a masked input and explicitly stores it in Windows Credential Manager through stdin; existing entries are not replaced |
| **Routero: Stage Codex Credential Helper** | Explicitly creates a new helper directory; existing installations are not overwritten and nothing is downloaded |
| **Routero: Integration Status** | Opens the packaged progress report without accessing a key or model |

Opening VS Code or activating this extension does not read credentials, contact Routero, install helpers, or change Codex settings. The Output Channel is named **Routero Connect**. It contains redacted workflow reports, not raw subprocess output, key values, response bodies, or project prompts/code. Configuration previews open as temporary editor documents rather than saved workspace files.

## Runtime and credentials

Select a real **Node.js 24.18.0 or later Node 24 `node.exe`**, not `Code.exe`, `npm.cmd`, a PATH alias, or a shell command. VS Code runs on Electron; its executable cannot be used as the external authentication runtime. The extension validates the selected Node version and launches the bundled CLI without a shell, Node injection options, or inherited provider keys.

For CLI diagnostics/model listing, select an inspected **Codex CLI 0.157.1 or 0.172.0 `codex.exe`**. Newer versions need their own compatibility evidence; IDE-bundled version detection does not grant CLI support. The GUI launches its managed CLI with an explicit environment allowlist, so host authentication/Codex overrides are excluded without changing the running VS Code session or deleting login files. The Output Channel records ignored variable names only. Direct standalone CLI invocation retains its environment-conflict checks.

Credentials use Windows Credential Manager through the external helper. Codex is not assumed to read VS Code SecretStorage. **Store Key** asks for an origin, profile ID, reference ID, and masked key, followed by a storage confirmation. The key is passed only through memory/stdin, never an argument or clipboard. It stays stored even if no compatible model is available; storage is a separate explicit action. Use a different origin/reference for another environment. Keys are not remembered in VS Code settings, global state, or wizard selections. Managed-runtime strings cannot be reliably erased from memory.

Use the standalone [credential commands](credentials.md) for explicit replacement, sharing, and removal. The UI never silently replaces a key or deletes one during disconnect.

New helper staging uses version **0.0.7** in a new private directory, independent of extension-version paths. Existing reviewed 0.0.3, 0.0.4, 0.0.5 and 0.0.6 manifests remain accepted; nothing upgrades an installed helper automatically. Keep Node installed at its recorded path. The existing 0.0.6 helper passed real command-backed authentication during the isolated setup validation; new helper staging and broader GUI lifecycle checks remain separate. Do not stage over the existing helper or change its manifest to make it pass a check.

## Connection, preview, and recovery

For ordinary approved combinations, Connect asks for explicit paths to `codex.exe`, the selected `config.toml`, an existing helper directory, and private recovery storage outside Git. The configuration parent must already exist. It lists the selected key's models, shows support states, and permits only approved combinations. Experimental models require explicit opt-in; failed/unverified models remain unavailable.

Review the selected origin/model and masked field plan. Replacing existing managed fields requires a separate choice. Apply is a modal confirmation of the target and recovery directory. The CLI applies only against the reviewed file revision and rechecks prerequisites/model permissions. Changes after preview require another review. The CLI retains ownership of configuration editing; Codex retains its own tools, approvals, sandbox, and existing login data.

After an actual change, keep the displayed change ID and recovery directory. The extension also stores a non-secret shortcut to the most recent transaction in its local global state; it is not a full transaction registry. Paths/selections are otherwise remembered only for this extension-host session. The filesystem recovery records are authoritative even if the shortcut cannot be saved.

Restart the affected Codex CLI manually after a successful apply. The UI says settings are configured, not that a live coding workflow has been verified. It does not restart a client, replay a request, execute project code, edit `auth.json`, or alter MCP/sandbox/approval settings.

Disconnect can run after Codex or the helper is removed. Restore model-switch transactions in **reverse order** and then restore the original connection. It restores only unchanged managed fields and reports conflicts; a conflict can leave a partially restored configuration. Review results before restarting. Keys, helpers, and recovery snapshots are retained for explicit review/cleanup.

After uninstalling the extension, use the independent CLI:

```powershell
node .\routero-connect-0.0.5.cjs disconnect --config <absolute-config.toml> --recovery <absolute-private-directory> --change-id <uuid>
node .\routero-connect-0.0.5.cjs disconnect --config <absolute-config.toml> --recovery <absolute-private-directory> --change-id <uuid> --apply
```

The first command describes the requested operation, not a field-by-field rollback diff. Keep the complete CLI directory and [recovery instructions](configuration-engine.md). Never restore a whole backup over later user edits or delete other applications' credentials.

## Cancellation, credit use, and acceptance

Escape cancels selection steps. Read-only/network steps can be cancelled from progress notifications. Cancelling a text probe cannot guarantee the server did not process it; there is no automatic retry. Apply, native credential storage, helper staging, and rollback are deliberately not interruptible through the UI. A subprocess failure/timeout can leave an uncertain outcome: inspect current state and private recovery records before retrying.

Test Model displays the credit notice and requires **Run one paid text test**. It sends one fixed text prompt, at most 64 output tokens, no tools, no streaming, and no project/code input. A passing `READY` response does not validate editing, tool-result history, execution, continuation, compaction, or billing. The existing $10 aggregate test ceiling still applies; a token limit is not a server-side dollar cap. No billable test ran during this development phase.

See [Phase 7 validation and remaining work](phase-7-validation.md). Real IDE setup, fresh-profile installation, coding/restart/switching tests, model metadata, and billed-cost acceptance remain prerequisites for claiming a working Codex plugin.
