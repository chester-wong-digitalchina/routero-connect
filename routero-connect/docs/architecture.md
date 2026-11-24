# Shared foundations

Phase 3 added shared foundations, Phase 4 added Windows credentials, Phase 5 added the configuration engine, and Phase 6 joins them in the Codex CLI adapter. The outstanding live coding tests have not passed. Development validation selects project-local fixtures rather than live settings, and the production compatibility catalog still blocks activation.

## Code boundaries

| Location | Responsibility | Excluded behavior |
| --- | --- | --- |
| `src/core/` | API-root validation, origin-bound profiles, compatibility decisions, redacted diagnostics, project readiness | No VS Code dependency, filesystem, network, credential-store implementation, or tool execution |
| `src/cli/run.ts` | Parse the small offline command set and format shared-core results | No setup, discovery, inference, or configuration writes |
| `src/cli/credentials.ts` | Explicit credential arguments and bounded stdin; token-only helper output | No secret arguments, gateway calls, or client settings |
| `src/cli/codex.ts` | Explicit workflow arguments, reviewed revision, output and credit consent | No home discovery, compatibility bypass, or persistent profile registry |
| `src/adapters/codex/` | Pinned detection, helper/config/auth checks, model permissions, Responses text probe, configuration-engine delegation | No client tool execution, automatic restart/retry, login deletion, or catalog promotion |
| `src/credentials/` | Ownership-aware lifecycle, native Windows backend, safe helper staging | No plaintext fallback or implicit global installation |
| `src/config/` | Source-preserving TOML edits, sealed previews, atomic writes, private recovery, three-way rollback | No credential-store access, model activation, home-directory discovery, or live adapter |
| `src/cli/main.ts` | Process arguments, output streams, and exit codes | No raw exception or argument dumps |
| `src/extension.ts` | VS Code commands, notifications, and opening the progress report | No duplicated URL/compatibility logic or inference |
| `src/ui/controller.ts` | Testable native wizard sequencing, explicit consent, preview/revision, recovery shortcut | No separate configuration writer, credential backend, or compatibility bypass |
| `src/ui/cli-runner.ts` | Selected Node executable, minimal environment, bounded shell-free process and stdin pipe, validated/redacted replies | No Code.exe runtime, raw output forwarding, token-print command, or key arguments |
| `src/ui/vscode-ui.ts` | Quick Pick, masked input, progress, ephemeral preview documents and non-secret recovery shortcut | No credential in settings/global state; Codex is not assumed to read SecretStorage |
| `src/adapters/contracts.ts` | Shared client detection, plans, apply, diagnostics, and rollback interfaces | Implementations remain separate from the types |
| `compatibility/models.json` | Versioned compatibility evidence maintained with tests and review | No keys, inferred limits, live catalog URL, or automatically trusted remote update |

These boundaries live in the existing package. Splitting into independently published packages is deferred until distribution requires it; the core is already importable independently of VS Code.

Phase 7 adds native controls that invoke the same packaged CLI, rather than running the Windows credential bridge inside Electron. A separately selected Node 24 executable remains the helper's runtime identity. The wizard's CLI target and unavailable Codex IDE target are distinct. Activation only registers commands/output; it does not read a key, call a model, install a helper, or change client configuration. See [VS Code setup](vscode-setup.md).

## API URLs and credentials

`normalizeApiRoot` accepts HTTPS origins and their `/v1` forms, with an optional single trailing slash. It produces one canonical origin and explicit Models, Responses, and Chat Completions URLs. The caller uses the root origin for future Messages setup.

It rejects other paths, doubled `/v1`, path traversal (even if a URL parser could normalize it), encoded path variants, embedded credentials, queries/fragments, backslashes, and control characters. Errors do not repeat user input. HTTPS custom ports are preserved; TLS is never disabled. The HTTP loopback server in Phase 2 is a separate development-only test fixture, not an allowed production profile root.

A profile contains a connection name, validated endpoint URLs, and a credential reference: an opaque identifier plus the canonical origin. It contains no key value. Changing from UAT to production, a custom domain, or a different port requires a credential reference bound to that origin. Normalizing `/v1` does not change an origin or allow cross-domain credential reuse. Profile creation is in-memory only; persistent profile management remains future work; Windows credential storage is implemented separately.

## Compatibility data and activation

The catalog parser accepts schema version 1, validates required fields, rejects unknown fields, and freezes accepted records. It rejects invalid dates/ranges, duplicate record IDs, invalid limits, and a verified claim without complete capability data and passed client-test evidence. A source-code reference alone cannot justify a verified claim. Errors do not include rejected payloads.

`evaluateActivation` requires exact model, client, API origin, protocol, and a matching client-version range. The caller supplies the model IDs returned by the current key's ordinary model-list request. The function cannot itself prove that its caller supplied a real or current key-scoped list. The implemented CLI adapter fetches this list from the gateway rather than supplying a global catalog or guessed IDs.

- Models absent from that list cannot activate, even with verified catalog evidence.
- Unknown, unverified, or unsupported combinations remain unavailable; model names cannot imply capabilities.
- Experimental records need explicit opt-in **and** complete limits, streaming/tools/continuation data, a known compaction mode, and a non-failed tested result.
- Verified records also require passed validation and manual or automated client evidence.
- Overlapping matching records fail closed; none is silently chosen over another.
- Version ranges are minimum-inclusive and maximum-exclusive. Initially only stable three-part versions are accepted. Prereleases and malformed versions remain unverified. The IDE extension version and its bundled engine version must not be interchanged.

Limits and capabilities remain unknown (`null`) when the evidence does not establish them. The catalog preserves two failed CLI combinations and the partial Luna coding result. It contains **no ordinarily activatable model**; the separate isolated-validation gate permits only the recorded UAT/Luna/0.172.0 combination. These records describe reported runs, not a permanent judgment about every deployment. Their referenced reports preserve the unknown deployed gateway revision and unconfirmed root cause.

Compatibility decisions are advisory data, not authorization tokens. The adapter must recheck current permissions, version, environment, and file revisions before applying a plan; it must not trust an old or caller-forged `allowed` flag.

## Diagnostics

Configuration, connectivity, model listing, protocol checks, and real-client acceptance remain separate categories. An HTTP response alone is not a completed coding-task result. Rate and budget limits are distinguished only when the backend supplies that reason; a generic 429 stays ambiguous. TLS, network, timeout, and cancellation have distinct results. Cancellation/partial-response failures do not imply permission to retry.

Factories redact known secret values, Routero-style key strings, bearer/Basic authorization, credential assignments, sensitive detail fields, and URL credentials/query/fragment values. Structured details are bounded and tolerate cycles. This is defense in depth, not a guarantee that arbitrary raw logs are safe: never pass complete headers, requests, environment variables, user prompts, source code, or raw exception objects into diagnostics. Prefer fixed messages, reason codes, and non-secret request references.

## Adapter contracts and next steps

The adapter contract separates `detect`, `plan`, `apply`, `diagnose`, and `rollback`. Plans describe target files, revision expectations, changed fields, redacted diffs, conflicts, and restart instructions. Results distinguish successful changes, conflicts, and failures. The contract types themselves perform no file patch, backup, credential access or rollback; the concrete adapter delegates those operations to their respective components.

Phase 4 implements Windows Credential Manager storage and a version-pinned helper; see [credential design](credentials.md) and [validation](phase-4-validation.md). VS Code SecretStorage remains separate. Phase 5 implements configuration editing and three-way rollback; see [the configuration guide](configuration-engine.md). Phase 6 delegates to that engine and re-evaluates compatibility rather than trusting caller-supplied approval. Before apply it rechecks client/helper/permissions; the CLI additionally requires the reviewed file revision. Recovery needs no client/helper or gateway access and retains credentials. See [CLI behavior](codex-cli.md). The isolated CLI coding/continuation task now passes; unknown limits and remaining lifecycle checks prevent general support claims. See [the decision record](design-decisions.md) and [handoff](handoff.md).
