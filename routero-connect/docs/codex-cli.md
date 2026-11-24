# Codex CLI workflow

Updated: 2026-11-24 (Asia/Singapore). Internal CLI/extension: **0.0.5**; new helper staging: **0.0.7**.

The CLI joins credential storage, compatibility checks and transactional configuration. VS Code setup controls invoke this same CLI through a selected external Node executable. The isolated UAT + `openai/gpt-6-luna` + Codex 0.172.0 setup has passed a real coding task and resumed continuation using command-backed authentication. Ordinary model approval remains gated by unknown model limits and further acceptance checks; experimental validation does not approve arbitrary combinations. See [the handoff](handoff.md) and [isolated validation procedure](plugin-parity-test.md).

## Build and prerequisites

Use the [documented Node/npm versions](development.md), Windows, and `npm run package`. Commands below run `node .\dist\cli.js`; no global installation is needed. CLI versions **0.157.1 and 0.172.0** have recorded command-authentication checks; only 0.172.0 has the Luna coding evidence. Other versions and the IDE interface require independent validation. A detected version alone does not prove model compatibility.

Store a key only through the existing [credential commands](credentials.md). The workflow references an existing profile/origin/credential ID and never collects a key in an argument, stores a plaintext key, or falls back to an existing personal login. Models, connect, online doctor, and the explicit model test read the selected Windows credential; local doctor does not.

Supply absolute paths rather than relying on automatic home-directory or executable discovery:

- `--codex`: the selected `codex.exe`. Detection executes only `--version`, with bounded time/output and a minimal environment, without a shell.
- `--config`: the selected `config.toml`, whose parent directory must already exist. `auth.json`, Codex internals, sandbox, approval, MCP, and unrelated providers are not edited.
- `--helper`: a private helper directory containing its script and manifest. Reviewed helpers **0.0.3?0.0.6** remain accepted; new staging uses **0.0.7**. No installed version is updated automatically. Manifest hash checks detect accidental changes, not a malicious process with the current user's Windows identity. The manifest must name the currently running Node executable.
- `--recovery`: a separate private recovery directory outside Git. Unmarked existing directories are refused. Keep it and each returned change ID until restoration and review are complete.

Development checks use project-local fixtures. The separately authorized live setup reused an existing Windows credential/helper and created an isolated configuration with private recovery outside Git. Normal Codex configuration and the gateway were unchanged.

## Inspect without running a model

`status` and bare `doctor` retain their offline project-summary behavior. A local doctor inspects the explicitly selected executable, helper, environment, and TOML without listing models or invoking the helper:

```powershell
node .\dist\cli.js doctor --config $config --recovery $recovery --codex $codex --helper $helper
```

Each variable above must hold an absolute, explicitly selected path. Doctor returns exit code 1 while coding compatibility is unverified, even if local prerequisites pass. It does not certify effective runtime authentication or model limits.

Listing is an explicit authenticated GET, without inference:

```powershell
node .\dist\cli.js models --codex $codex --profile uat --api-root https://api-uat.routero.ai
node .\dist\cli.js doctor --config $config --recovery $recovery --codex $codex --helper $helper --online --profile uat --api-root https://api-uat.routero.ai
```

Use `--credential-ref` when the credential reference differs from the profile ID. Results distinguish key visibility from compatibility approval, and display up to 50 models with explicit total/displayed counts. An empty list, an inaccessible key, or a network error does not trigger inference or a configuration change. The tool never manages gateway policies.

## Preview, connect, and switch models

The following describes the implemented flow **after a combination has real evidence and is approved in the bundled catalog**. It is not a workaround for today's blocked catalog. There is no custom-catalog or force-activation CLI option.

1. Select a permitted model from `models` and run `connect` with the selected paths, profile, origin, and `--model`. This is a read-only preview; model listing is the only gateway request.
2. Review the selected origin/model, masked field changes, conflicts, and restart instructions. Replacing existing managed values additionally requires `--replace-existing`. Conflicting/unsupported auth, profile, and feature overrides are preserved and reported.
3. Repeat the reviewed command with `--apply --expected-revision <revision-from-preview>`. A changed file revision requires a new review. The adapter rechecks client, helper, and current model permissions; the engine checks for concurrent edits and keeps private recovery records before replacing the file.
4. Keep the returned `changeId` and recovery directory. Restart the affected Codex CLI manually. This tool never automatically restarts a client or executes project code.

The provider uses normalized `/v1` URLs, Responses, separate executable/argument strings for command-backed authentication, a 10000 ms helper timeout, disabled WebSockets, and zero request/stream retries. Explicitly reviewed environment-auth settings are removed from the Routero provider only; other providers and existing login files remain intact. Existing authentication/Codex override environment variables must be resolved in a clean terminal, without printing their values.

Switch models by previewing and applying `connect` again for the new approved model. An identical configuration produces `unchanged` without a new recovery transaction. Each actual switch has its own change ID; **restore switches in reverse order**, then restore the original connection. This increment uses explicit arguments and recovery IDs rather than a persistent connection registry. Do not switch profile/origin and delete an older credential while its configuration may still need restoration.

Model-specific metadata, context/compaction behavior, hosted tools, and the complete coding loop must be revalidated against the pinned client before any combination is approved. This increment does not invent metadata, alter Codex's model identity, or claim a supported workflow from fixture success.

## Test a small text response

`test-model` is the only new command that makes an inference request. It prints a credit notice and requires `--confirm-cost`:

```powershell
node .\dist\cli.js test-model --profile uat --api-root https://api-uat.routero.ai --model <visible-model-id> --confirm-cost
```

It lists current permissions, then sends one fixed Responses text prompt with `max_output_tokens=64`, no tools, `stream=false`, and `store=false`. It does not display the response body, accept project/code input, or promote a compatibility record. Success means only the expected completed `READY` response was returned. It does not validate streaming, tool results, edits, tests, continuation, compaction, or billed cost. A token bound is not a dollar budget; retain the existing aggregate testing ceiling and coordinate spend visibility separately. No such request was run during Phase 6 implementation.

Requests use a 15-second deadline, bounded response size, TLS verification, no redirects, and no automatic retries. Ctrl+C aborts pending network requests. It does not interrupt an atomic filesystem recovery operation midway. After a timeout/cancellation, inspect actual state before manually retrying; cancellation cannot prove the server did not process a request.

## Disconnect and recover

Review the transaction to restore, then explicitly apply its rollback:

```powershell
node .\dist\cli.js disconnect --config $config --recovery $recovery --change-id <uuid>
node .\dist\cli.js disconnect --config $config --recovery $recovery --change-id <uuid> --apply
```

The first command describes the requested operation; it is not a field-by-field rollback diff. The second uses the private transaction to restore unchanged managed values and report preserved later edits. It needs neither Codex nor the credential helper to be installed. A conflict may mean partial restoration: inspect the reported fields and do not automatically restart. Follow the [configuration recovery guide](configuration-engine.md) for retained snapshots, permissions, concurrent edits, and unsupported TOML layouts.

Disconnect retains keys and helpers, including shared credentials. Detach an unwanted profile only through the explicit credential deletion command after confirming it is no longer needed. Recovery does not delete other profiles' secrets or clean up snapshots automatically.

Workflow exit codes: `0` for successful listing/preview/apply/restoration/text probe, `2` for malformed CLI syntax, `1` for rejected prerequisites, conflicts, unavailable support, or failed checks. Errors contain fixed/redacted messages rather than raw gateway bodies or subprocess output. HTTP 401/403/404/429/server errors and TLS/network/timeout/cancellation are separated; a generic 429 is not guessed to be a budget error.
