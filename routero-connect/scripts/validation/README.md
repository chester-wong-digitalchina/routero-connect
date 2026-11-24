# Phase 2 validation tools

These are development-only scripts, excluded from VSIX packaging. They use the Python standard library and do not implement production credential storage or client configuration. Run from the repository root.

## Offline tests

```powershell
python -m unittest discover -s scripts/validation -p 'test_*.py' -v
python -m unittest discover -s fixtures/validation/calculator -v
```

The discovery tests cover scoped GETs, no retries, redirect refusal, allowlisted key-info fields, error/metadata redaction, malformed responses, and response-size limits. Calculator tests establish only the pre-agent baseline.

## Read-only UAT discovery

```powershell
python scripts/validation/discover_uat.py --profile both
```

Enter each key only at its hidden terminal prompt. Piped/non-interactive input is refused. The script makes two GET requests per profile: `/v1/models` and `/key/info`, without organization overrides, expanded model scope, or secret query parameters. TLS verification remains enabled and redirects are refused. There are no inference requests or retries.

The identifying User-Agent is `Routero-Connect-Validation/0.0.1`. Initial default Python requests received HTTP 403; identified requests subsequently reached Routero. This is an observed client-header difference, not proof of its edge-policy cause.

Only allowlisted, redacted fields are saved under ignored `tmp/validation/discovery/`. The current self key-info error is documented; **do not retry or investigate it further without a new reason**. Current model lists were already collected successfully.

## Loopback command-auth probe

```powershell
python scripts/validation/probe_codex_auth.py --label standalone --executable 'C:\path\to\codex.exe'
python scripts/validation/probe_codex_auth.py --label ide-bundled --executable 'C:\path\to\extension\bin\windows-x86_64\codex.exe'
```

Supply the actual installed binary path. Each run:

1. Creates isolated child state, configuration, temporary files, and a dummy helper entirely inside ignored `tmp/validation/auth-probe-<label>/`.
2. Passes the child a minimal environment; the active agent's environment/configuration stays unchanged. No real gateway key is used.
3. Starts a loopback-only HTTP server with an empty Codex-shaped model catalog and intentional HTTP 418 rejection of Responses requests.
4. Runs `codex exec --strict-config --ephemeral` with command-backed dummy authentication, read-only sandbox, and zero provider retries. No model tool is executed.
5. Records whether exactly one Responses POST carried the dummy bearer token, plus requested tool types and executable hash. Stops the child after 35 seconds if necessary.

A passing **probe script** returns zero even though **Codex** returns nonzero for the intentional HTTP 418. Missing model metadata is expected from the empty local catalog. Do not interpret these outcomes as a real gateway/model pass. Executing the IDE-bundled binary is not IDE UI acceptance.

Production URLs remain HTTPS. The HTTP loopback server is a development fixture with a fixed dummy token, not a recommended provider configuration.

See [manual validation](../../docs/phase-2-manual-validation.md) for the real coding task and reporting template. Keep real inference within the authorized aggregate $10 ceiling and require spending visibility first.
