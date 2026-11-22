# Secure credentials and the helper

Phase 4 adds an explicit way to store a Routero key on Windows and let a client retrieve it later. It does not change Codex settings, solve the Phase 2 tool errors, or make automatic connection available.

## What is stored where

The external CLI/helper uses **Windows Credential Manager**, through the Windows `CredReadW`, `CredWriteW`, and `CredDeleteW` APIs. Entries are generic credentials persisted for the current Windows user on this machine. No plaintext key file, environment-variable fallback, dashboard session, or global `OPENAI_API_KEY` change is used.

VS Code's own `SecretStorage` is a different store. Codex is not assumed to read it. The extension currently collects no key; future VS Code setup must explicitly transfer a user-entered key through memory/stdin to the external helper when enabling external clients. The native VS Code provider can use SecretStorage when that feature is implemented.

Each entry records the gateway origin, credential reference ID, owning profile IDs, and key inside the OS credential blob. The target name starts with `RouteroConnect/v1/` and hashes the origin/reference pair; it contains no key. The native entry also has application ownership markers. Other applications' entries and malformed/foreign entries are never overwritten or deleted by these commands.

Changing the origin or credential reference addresses a different entry. Keys are never automatically reused between UAT, production, a custom domain, or a different port. Profile and reference IDs are case-sensitive and must be short non-secret identifiers.

## Ownership and replacement

- Creating an existing credential fails unless replacement is explicitly requested by an owning profile.
- Linking another profile requires an existing owner and the same origin/reference.
- Shared credentials cannot be replaced silently: create a separate reference if different keys are needed.
- Deleting a profile's reference retains the credential while another profile owns it. Only the final owner removes the underlying entry.
- Updates use compare-and-exchange under a named Windows mutex. A conflicting update fails without retrying or overwriting it. A timeout during a mutation can leave its outcome uncertain; check the state before retrying.

Ownership prevents accidental cross-profile changes. It is not an access boundary against another malicious process running as the same Windows user, which may itself access that user's vault. Do not use the helper as a defense against a compromised Windows account.

## Dependency choice

The Windows adapter uses bundled, auditable PowerShell/C# source rather than adding a third-party native npm module. This avoids runtime package downloads and per-Node-ABI addon builds, at the cost of requiring Windows PowerShell/.NET, temporary compilation, and startup headroom. Restricted language/security policies can make the store unavailable; they are not bypassed. No external security-review sign-off is implied by implementation tests.

## Key entry

These commands are explicit OS-store operations, unlike offline `status`, `doctor`, and `validate-url`. Development tests must use mock storage or receive authorization before creating an actual dummy vault entry. Real keys must never be committed, included in process arguments, or written to scratch files.

After building, an authorized user can enter a key in PowerShell through a hidden prompt:

```powershell
$routeroSecret = Read-Host "Routero UAT key" -AsSecureString
[System.Net.NetworkCredential]::new("", $routeroSecret).Password |
  node .\dist\cli.js credential store --profile uat --api-root https://api-uat.routero.ai
Remove-Variable routeroSecret
```

The key travels as piped data, not a command argument. Store refuses an interactive/echoing stdin and limits input size/time. Only one Routero-shaped key is accepted; no validation request is sent to the gateway. Passing validation is not proof the key is valid or authorized. Managed-runtime strings cannot be reliably wiped from memory; plaintext is confined to the processes and pipes that need it.

Operations (use the same origin/reference each time):

```powershell
# Explicit replacement, with a new key supplied through the same hidden-input pipe:
node .\dist\cli.js credential store --profile uat --api-root https://api-uat.routero.ai --replace

# Link a second profile to an existing reference, without revealing the key:
node .\dist\cli.js credential link --profile uat-second --from-profile uat --api-root https://api-uat.routero.ai --credential-ref uat

# Detach the first profile; the second profile still owns the key:
node .\dist\cli.js credential delete --profile uat --api-root https://api-uat.routero.ai

# Remove the last profile/reference when no longer needed:
node .\dist\cli.js credential delete --profile uat-second --api-root https://api-uat.routero.ai --credential-ref uat
```

The replacement command above requires piped input, like the first example; do not type the key as another argument. No operation reads a hidden global profile file: origin, profile, and optional reference are explicit. Omitting `--credential-ref` uses the profile ID as the reference ID. Persistent connection-profile management comes later.

`credential print` is for client authentication commands. **Its successful stdout is deliberately the key and nothing else**; do not run it in a shared terminal, copy its output into documentation, or include it in a diagnostic capture. Failure writes a fixed redacted message to stderr and no token to stdout. Other credential commands never print the key.

## Stable helper staging and installation

The helper is a self-contained bundled script with no runtime npm dependencies. It requires a tested **Node.js 24.18.0 or later Node 24** executable, plus Windows PowerShell/.NET and the Windows credential APIs. It makes no executable download or gateway request during credential access.

```powershell
node .\dist\cli.js helper stage --destination .\tmp\reviewed-helper
```

This creates a **new** directory containing `routero-connect.cjs` and a non-secret `helper-manifest.json` with the helper version, script path, Node executable path, and bundle hash. Existing directories/files and symlinked ancestors are refused. On Windows the new directory is protected for the current user and SYSTEM before executable files are written. A partial failure may leave a new incomplete directory; inspect it rather than overwriting it. There is no automatic global install, PATH change, or automatic removal.

The Phase 4 user-install location is `%LOCALAPPDATA%\RouteroConnect\helper\0.0.3\`. Phase 6 retains that helper and stages changed CLI bundles at a new **0.0.4** path; no installed helper was changed or revalidated natively in Phase 6. These paths are independent of VS Code extension-version directories. Installing outside the project requires authorization under the development boundary. Versions are pinned by path; extension updates do not replace them. The Node executable must remain installed at its recorded absolute path; Node upgrades/removal can require revalidation or restaging. No global CLI installation is required.

For future Codex configuration, use the manifest's absolute Node path as `auth.command` and its absolute script path as the first `auth.args` entry, followed by:

```text
credential print --profile uat --api-root https://api-uat.routero.ai
```

Each argument is a separate string. There is no concatenated shell command or `.cmd` quoting dependency, including when paths contain spaces. Configure only command-backed authentication: do not combine it with `env_key`, `experimental_bearer_token`, or `requires_openai_auth`. A 10000 ms client helper timeout allows headroom for a cold Windows PowerShell/.NET startup; the bridge has its own shorter per-call timeout. Do not apply client configuration as part of Phase 4; the configuration engine/adapter are later work.

## Implementation and limitations

- The credential service is independent of the OS adapter and tested with an in-memory backend. Core URL/profile/compatibility rules remain independent of Windows and VS Code.
- A bundled, fixed PowerShell/C# bridge calls the Windows APIs. Only trusted static source is supplied in arguments; request data is JSON on stdin, never interpolated code. It uses `-NoProfile`, no execution-policy change, an absolute system executable, and a minimal child environment.
- Temporary compiler files contain static bridge source, not keys; their directory stays beside the helper or under the explicitly selected test directory. The bridge never writes request data to files, and raw PowerShell stderr is never forwarded.
- A per-user global named mutex protects native read/compare/write/delete, including multiple processes/logon sessions. Abandoned locks require re-reading actual state. Credential blobs are bounded to 2560 bytes and ownership to 16 profiles.
- Missing stores, restricted PowerShell/.NET, unsupported runtime/platform, malformed data, timeouts, and conflicts fail explicitly. No plaintext or environment-based fallback is attempted.
- Process-restart tests do not prove Windows reboot behavior, an actual GUI launch, Windows policy compatibility on every machine, or live gateway authentication. These require separately recorded acceptance evidence.
- Uninstalling the extension does not delete OS credentials or the independent helper. Explicitly detach all owned profiles before manually removing a helper version. Do not delete other applications' credentials from Windows Credential Manager.

Official references: [generic credential structure and persistence](https://learn.microsoft.com/en-us/windows/win32/api/wincred/ns-wincred-credentialw), [read](https://learn.microsoft.com/en-us/windows/win32/api/wincred/nf-wincred-credreadw), [write](https://learn.microsoft.com/en-us/windows/win32/api/wincred/nf-wincred-credwritew), and [delete](https://learn.microsoft.com/en-us/windows/win32/api/wincred/nf-wincred-creddeletew).
