# Phase 4 credential validation

Updated: 2026-11-18 (Asia/Singapore). Branch: `phase-4`.

## What works now

The CLI has explicit Windows credential commands and a separate, version-pinned helper. Users can store and replace a key without putting it in configuration files, link profiles to a shared key, and detach a profile without deleting a key still used elsewhere. The helper can return the key to a client without relying on a terminal's key environment variable.

This is credential infrastructure. Automatic Codex setup and a successful real coding task are not claimed. The existing Phase 2 tool failures remain open.

## Evidence

- **42 offline TypeScript tests passed**, including type checking and zero-warning lint. Credential tests cover lifecycle, cross-origin separation, ownership, shared-key preservation, explicit replacement, conflicts, malformed/foreign entries, input bounds, fixed/redacted errors, token-only output, and safe staging with spaces in paths.
- Production extension and CLI bundles build. The known esbuild ancestor-directory restriction required an approved build outside the sandbox; outputs remain inside the project.
- The approved native Windows test used one uniquely named **dummy** key/reference, never the supplied UAT keys. Windows read/write/replace/share/detach/delete checks passed, and final absence of the dummy entry was confirmed.
- The installed helper returned exactly the dummy token plus newline in two separate processes with no stderr. The test environment did not include PATH, model-provider key variables, NODE_OPTIONS, or the active agent's configuration.
- Codex CLI `0.157.1` and the IDE-bundled engine `0.169.0-alpha.11.1` each obtained that dummy credential through command-backed authentication and sent it in exactly one Responses POST to a local server. The server deliberately returned HTTP 418; no model inference occurred. An expected nonzero Codex result is not an authentication failure in this fixture.
- The private helper directory uses explicit current-user and SYSTEM access on Windows. Script/node paths are separate arguments, so no shell concatenation or `.cmd` quoting is needed.

Selected non-secret measurements are in [the evidence record](validation/phase-4-evidence.json). Temporary compiler files, logs, and scratch state remain ignored. No real token is part of committed evidence.

## Native compilation correction

The first helper (`0.0.1`) failed during static C# bridge compilation because `FILETIME` referred ambiguously to two Windows/.NET types. The failure happened before its credential request was processed. The type is now fully qualified, and a missing-entry read plus the full native test passed with `0.0.2`.

The failed version's two files were verified against their manifest/hash, archived inside ignored project scratch space, and removed along with its empty directory. No recursive cleanup or unrelated credential deletion was used. The working `0.0.2` version was retained as a rollback copy. The final runtime/blob-size guards were pinned separately as `0.0.3`, without overwriting an installed version.

## Authorized external changes

Normal source/test/documentation edits stayed inside this project. The following exceptions were explicitly approved:

1. Fast-forward `phase-4` to the committed Phase 3 baseline through the enclosing repository's Git metadata.
2. Build outside the sandbox while keeping outputs project-local.
3. Install the pinned helper under `%LOCALAPPDATA%\RouteroConnect\helper\0.0.3\`, create/remove one unique dummy Windows credential, and retire the failed `0.0.1` test installation.

No gateway settings, normal Codex settings, global environment variables, or real account keys were changed. Phase 4 inference spending is **$0**. Earlier user-run Phase 2 cost remains unknown.

## Still unverified

Windows reboot behavior, actual VS Code GUI authentication, live Routero authentication with this helper, and enterprise-restricted Windows policy variants have not been tested. Testing the IDE's bundled binary is not a GUI test. Locked/unavailable-store, timeout, and conflict behavior is covered by mocked failure tests; the machine's real store was not intentionally locked.

The runtime still requires an installed supported Node executable and Windows PowerShell/.NET. Automatic helper updates, public distribution, VSIX installation, persistent profile management, credential entry in the VS Code wizard, safe config changes, and complete client adapters remain later work. No model compatibility status was upgraded.

See [credential design and recovery](credentials.md) for ownership rules, helper usage, and uninstall guidance. The Phase 4 implementation is a tested Windows increment, not a claim that every original release acceptance condition is complete.

## Final-build follow-up

Final helper 0.0.3 includes early runtime validation and oversized/capacity guards. Its native lifecycle and separate-process printing passed. One installed-path IDE-engine attempt failed without sufficient diagnostics; it is not hidden as a success or assigned a cause. The identical final bundle subsequently passed both engine checks from a project-local directory with spaces. A targeted rerun using the existing installed helper verified its hash first and passed native lifecycle, separate-process printing, and both engine checks, with confirmed cleanup. The earlier failed attempt remains in the evidence history; its cause is not asserted.

A native write test inside the sandbox was rejected with a fixed store-unavailable error and cleaned up. Approved host-context testing is necessary here; this does not mean the CLI requires an administrator account on normal Windows installations. Tests never used plaintext fallback or disabled Windows policy to force access.
