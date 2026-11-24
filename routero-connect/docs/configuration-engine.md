# Safe configuration changes

The configuration engine prepares reviewed changes, writes private recovery before replacement, and restores only unchanged managed fields. The CLI adapter and VS Code setup controller both use this engine; neither has a separate configuration writer. The isolated Luna setup now passes a real coding/continuation task, while normal Codex configuration remains unchanged. See [current handoff status](handoff.md).

## What this makes possible

Setup shows which settings will change before applying them. Existing settings and comments stay in place instead of being replaced with an example configuration. If the file changed after the preview, the engine asks for a new plan. When restoring settings, it keeps later user edits and reports anything it cannot restore safely.

This reusable component is connected to the CLI adapter and VS Code Connect/Disconnect controls. Model eligibility, credentials, executable installation, and a working gateway connection are separate checks.

## Try it without changing existing client settings

From this repository:

```powershell
npm run demo:config
```

Use `npm.cmd` if PowerShell blocks `npm.ps1`. The demo creates a dummy `config.toml` under ignored `tmp/validation/`, prints a redacted preview, applies fixture settings, simulates a later user edit, and demonstrates a rollback conflict that preserves that edit. It does not select the live user home directory, run Codex, access the credential store, or contact Routero. An expected conflict in this demo is a successful safety check, not a failed real connection.

## How changes work

1. **Read and validate.** Only an explicitly selected `config.toml` in an allowed directory is used. Invalid TOML, invalid UTF-8, linked paths, hard-linked target files, and oversized files are refused before changes are planned.
2. **Prepare a preview.** The plan lists the target, managed field names, redacted differences, conflicts, and restart guidance. All field values are masked, including apparently harmless old values, because existing configuration can contain secrets. The calling setup screen must separately show its validated non-secret selections.
3. **Check for conflicts.** Changing an existing value requires an explicit replacement decision per field. Plans are immutable, single-use, and tied to the engine instance that created them. Reconstructing a plan from JSON does not authorize applying it.
4. **Prepare private recovery.** Original and intended file contents are saved in restricted recovery storage before replacement. Those files may contain existing user secrets. The manifest contains paths, hashes, managed field names, and state, not setting values or keys.
5. **Apply and verify.** The engine re-reads the target, writes and flushes a same-directory temporary file, preserves existing file permissions, rechecks the target immediately before replacement, renames atomically, and re-parses the result. A mismatch or uncertain failure keeps recovery evidence rather than blindly restoring over possible user edits.
6. **Restore carefully.** Rollback compares original, tool-written, and current values. It restores matching fields, leaves changed fields alone, and records unresolved conflicts for a later reviewed attempt. Changes inside a managed value, including new comments or formatting, are treated conservatively as user edits.

If the tool created a provider table and later edits add settings or change its header, rollback retains its dependent managed fields and reports a conflict. It does not remove the surrounding structure and leave the newly added settings without it. Empty table headers created by the tool can otherwise be removed; existing headers and comments are retained.

Applying the same desired settings again returns `unchanged` and creates no new recovery transaction. Rollback of an already restored transaction is also harmless. A newly created configuration file is retained as an empty/whitespace file after full rollback rather than deleted, so later user content is not put at risk.

## Scope of managed settings

The current allowlist covers the top-level `model` and `model_provider`, supported fields under `model_providers.routero`, and command-backed authentication settings under its `auth` table. Existing environment-auth selectors may be removed explicitly but cannot be introduced by this engine. Direct bearer-token settings are not writable.

Other providers, MCP configuration, trust, sandbox settings, and approval policy are not editable through this API. `auth.json` is not an accepted target. New literal keys, token flags, credential-bearing URLs, and known secret-shaped values are rejected; credentials belong in the Phase 4 store. Pattern checks do not replace the calling adapter's obligation to keep all credentials out of configuration inputs.

The engine validates TOML and its narrow field types. It is not a complete Codex schema or authentication-precedence validator. The future adapter must validate the complete planned client configuration, compatible models, helper references, and mutually exclusive authentication modes. A partial rollback can require manual reconciliation; do not automatically restart a client or claim disconnection succeeded after a conflict.

## Formatting support

The pinned `toml-eslint-parser` package validates TOML 1.0 and supplies source ranges. The editor changes only selected value spans. Unrelated text, comments, large integers, dates, arrays, quoted keys, Unicode, line endings, and an initial UTF-8 BOM are retained. It does not convert the whole file into a JavaScript object or reserialize it.

New top-level fields are placed before tables so they cannot accidentally land inside `[windows]` or another section. Existing standard tables are reused; missing standard tables are appended. No duplicate tables are generated.

Existing values inside inline tables can be updated. Adding/removing fields inside inline tables, colliding dotted/array table layouts, and other unrepresentable changes fail closed instead of triggering a whole-file rewrite. An explicitly replaced managed value can change its quoting/layout and any comments inside that value; surrounding comments and unrelated fields are preserved. New values use basic quoted strings and one-line arrays. TOML 1.1-only syntax is not supported by this increment.

## Recovery storage and privacy

Normal recovery storage must be outside a Git repository in a dedicated directory created by the tool. An existing unmarked directory is not claimed or changed. POSIX permissions are private; Windows uses explicit current-user/SYSTEM ACLs and checks them before recovery reads. No Windows execution policy is changed. Permission commands receive paths only, never file contents, and do not inherit provider keys.

Each transaction has private `before.toml` and `applied.toml` snapshots plus `manifest.json`. Hashes are verified before rollback, and recovery is pinned to the engine's selected target. Corrupt records, modified snapshots, path traversal, and unsafe links are refused. A `prepared` record remains usable after a crash or an uncertain commit; it is not proof that the target was changed.

Tests and the demo opt into repository-local recovery explicitly and use only fixtures under ignored `out/` or `tmp/`. This exception must not be exposed as a production setup default. Do not copy real user backups into this repository or publish them with diagnostic reports.

No automatic backup deletion or retention policy is implemented. Keep records while recovery may be needed, and remove only a reviewed transaction in its known private directory. Do not publish snapshots, attach them to GitHub issues, or restore the entire backup over later user edits. The redacted manifest is not a substitute for protecting the snapshots.

## Concurrency and failure limits

An exclusive `.routero-connect.lock` coordinates this tool's operations. Existing/stale locks are not automatically removed; confirm no operation is running before a user manually removes a stale lock. The engine never deletes a replacement lock it does not recognize.

Other editors do not honor this lock. Re-reading immediately before rename detects changes up to that check, but **the final check and rename are not an OS-level compare-and-swap**: a non-cooperating writer can still race that narrow interval. This increment does not claim universal concurrency exclusion or power-loss durability. File data is flushed and replacement is atomic; directory metadata is not guaranteed flushed on every platform. Private snapshots and explicit recovery states reduce damage but do not eliminate these OS limitations.

If a write or verification fails after a commit may have started, the result is `recovery-required`, with a change ID when available. It is not permission to overwrite the file automatically or repeat the operation blindly. Recovery records and current values must be reconciled first. Security against a malicious process running as the same OS user is outside this engine's guarantees.

## Code interface

`CodexConfigEngine` in `src/config/engine.ts` takes explicit absolute paths: `configFile`, `allowedConfigDirectory`, and `recoveryDirectory`. It provides `plan(changes)`, `apply(plan)`, and `rollback(changeId)`. It does not discover or default to the live Codex configuration. Each change has a path, an optional new value (`undefined` means removal), and optional explicit `replaceExisting` consent.

`plan` is read-only and can report sanitized parser line/column information. `apply` returns `applied`, `unchanged`, `conflict`, `failed`, or `recovery-required`. `rollback` returns `restored`, `conflict`, `failed`, or `recovery-required`. A new engine instance can use the private recovery record; an apply plan itself cannot be persisted or reused.

The shared adapter contracts include unchanged and recovery-required outcomes so integration does not conceal uncertainty. Phase 6 now delegates to this engine through the [Codex CLI workflow](codex-cli.md), with compatibility approval and reviewed-revision checks. Phase 5's own validation remains fixture-only.

Parser reference: [official source and AST API](https://github.com/ota-meshi/toml-eslint-parser). The dependency and integrity are pinned in the package manifest and lockfile; no parser update is fetched at runtime.
