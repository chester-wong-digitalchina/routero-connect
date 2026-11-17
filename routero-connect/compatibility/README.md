# Compatibility catalog

`models.json` is evidence for specific combinations, not a global model inventory. Schema version 1 is checked by `parseCompatibilityCatalog` in `src/core/compatibility.ts`.

The two real records describe failed Codex CLI 0.157.1 runs against Routero UAT. Neither is activatable. No model limits or capabilities are inferred from an ID; unknown values are `null`. Keep the user-facing [progress report](../compatibility-report.md) consistent with this file.

Each record requires:

| Field | Meaning |
| --- | --- |
| `id` / `modelId` | Unique record identifier and exact public model ID |
| `client` | `codex-cli`, `codex-vscode`, `claude-code-cli`, `claude-code-vscode`, or `vscode-chat` |
| `origin` | Canonical HTTPS gateway origin; UAT evidence does not apply automatically to production |
| `clientVersions` | Stable three-part versions: inclusive `minimum`, exclusive `maximumExclusive` |
| `protocol` | `responses`, `messages`, or `chat-completions` |
| `status` | `verified`, `experimental`, `unverified`, or `unsupported`, scoped to this recorded combination |
| `contextWindow` / `maxOutputTokens` | Positive integer limits or `null`; output cannot exceed context when both are known |
| `capabilities` | `streaming` and `tools`, each boolean or `null` |
| `continuation` | Boolean/unknown `supported`, plus limitations |
| `compaction` | `unknown`, `unsupported`, `local`, or `remote` mode, plus limitations/fallback explanation |
| `validation` | Actual date, `passed`/`partial`/`failed`/`not-tested` result, and evidence kind/reference |
| `limitations` | Known scope restrictions and unresolved issues |

Evidence references are project-relative files or HTTPS URLs without embedded credentials, queries, or fragments. Actual gateway version, client engine details, test results, and uncertainty belong in the referenced report. A source reference can document a potential capability, but cannot alone make a model verified.

For activation, limits, tools, streaming, and continuation must be known and supported, and compaction behavior must be known. A verified record also needs a passed result and manual or automated client evidence. An experimental record requires explicit opt-in and cannot have a failed/not-tested result. Unknown/unsupported combinations cannot be opted into. Overlapping matches are denied pending human resolution.

The current key must independently list the model, and client/version/origin/protocol must match. The Phase 3 library accepts that key-visible list as an input; the future connector is responsible for obtaining it securely and keeping it current. No live listing or model activation is implemented here.

Update records only with reproducible evidence and matching tests. The synthetic verified records used in unit tests are deliberately excluded from this catalog.
