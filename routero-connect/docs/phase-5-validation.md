# Phase 5 configuration validation

> Historical checkpoint: results and restrictions below describe this phase at the time of its checks. For the current 0.0.5 state, handoff priorities and validated scope, start with the [maintainer handoff](handoff.md). Later results do not retroactively change earlier test evidence.

Updated: 2026-11-22 (Asia/Singapore). Branch: `phase-5`.

## What was added

A shared engine can now read a selected Codex TOML file, prepare a redacted preview, apply reviewed field changes, and restore managed fields without silently discarding later edits. Private recovery records are created before replacement. This is preparation for the client adapter, not automatic Codex setup.

All configuration targets in this phase were dummy files under project-local `out/` or `tmp/validation/`. Live Codex settings, `auth.json`, Windows credentials, installed helper files, and gateway files were not changed. No model request or billable inference ran.

## Validation results

- **68 TypeScript tests passed**, including the earlier 42 foundation/credential tests and 26 configuration tests. `npm test` also passed type checking and zero-warning lint.
- Production extension and CLI bundles built with `npm run package`. The known esbuild ancestor-directory restriction required an approved build outside the sandbox; bundle/cache outputs remained inside the project. The configuration library is checked by compilation/tests and runs through the fixture demo; it is not yet connected to a production config-write command.
- `npm run demo:config` passed: it previewed/applied fixture settings, then preserved a simulated later user edit and returned the expected rollback conflict.
- The pinned parser is `toml-eslint-parser` **1.0.3**, installed with package scripts disabled and a project-local npm cache. The lockfile records its resolution/integrity. No runtime parser download is performed.

Tests cover:

- Empty and missing files, existing settings/providers, comments, CRLF, UTF-8 BOM, Unicode/spaces in paths, quoted/dotted keys, large integers/dates, and unrelated arrays/tables.
- Correct top-level placement and reuse of existing tables; repeated application without duplicate settings or new recovery transactions.
- Redacted previews, explicit replacement consent, single-use/foreign-plan rejection, metadata/content changes after preview, and last-moment edits before replacement.
- Simulated write failure and post-replacement interference; recovery evidence is retained rather than blindly restoring the whole file.
- Three-way rollback, later managed/unmanaged edits, comments inside values, dependency preservation when a user adds settings to a tool-created table, repeat rollback, and recovery through a fresh engine instance.
- Windows private recovery permissions, no values/keys in manifests, corrupted snapshot rejection, unsafe links/junctions/hard links, invalid UTF-8, stale locks, unmarked directories, and refusal of normal repository-local recovery.
- The 2 MiB file/snapshot size bound, narrow managed-field allowlist, and rejection of direct credential-bearing changes.

The parser initially rejected a BOM. The editor now parses without that marker while retaining and adjusting the original source ranges; the preservation test passes. No whole-file reserialization is used.

## Limits retained explicitly

Some inline/dotted/array-table edits are intentionally unsupported and leave the file unchanged. New/changed managed values may use a different value layout. Public previews mask every field value, and a future setup screen must separately display its validated non-secret selections.

The lock coordinates this tool, not all editors. The final check and atomic rename are not a universal OS-level compare-and-swap; a narrow race remains. Full power-loss durability and complete Codex schema/authentication validation are not claimed. A partial rollback must be reviewed rather than followed by an automatic client restart. A new empty configuration file is retained on rollback instead of deleted.

The private recovery storage intentionally retains snapshots until reviewed cleanup. Tests opt into repository-local recovery only for ignored fixtures; normal recovery rejects repository locations. No real user snapshots were collected. POSIX permission code is not a claim of macOS/Linux release acceptance; Windows is the current validation platform.

## Repository and next step

The branch already contained uncommitted Phase 4 work; it was preserved without reset, commit, or unrelated edits. Phase 5 adds configuration modules/tests, a fixture demo, parser dependency, documentation, and ignore rules for transient engine files. No remote issue was changed.

Phase 6 can integrate the engine with credential references, current model permissions, client/version checks, and the real CLI flow. Phase 2's last reported coding failures remain unverified and have not been bypassed or reclassified by this work.

See [configuration behavior, recovery, and limitations](configuration-engine.md) and the [project progress report](../compatibility-report.md).
