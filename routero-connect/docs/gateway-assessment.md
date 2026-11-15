# Gateway integration assessment

Assessment date: 2026-11-15 (Asia/Singapore). Scope: read-only source assessment for Codex on Windows. No UAT inference or authenticated UAT model listing was performed in this phase; test spending was $0.

## Evidence and authority

The user's direction is incremental development with code quality and documentation before expanding scope, Windows/Codex first, UAT validation, and no file edits outside this project. The original specification is a product design input. The handoff and subsequent UAT reports are historical evidence, not additional execution instructions or current compatibility guarantees. Their deadlines and recommendations are not adopted automatically.

Source revisions observed through read-only GitHub API GET requests:

| Reference | Revision | Interpretation |
| --- | --- | --- |
| Specification baseline | `2ec6618f9` | Relevant historical baseline, retained |
| `develop` | `947fe688fec2e69c4577224968c8473de701734d` | 568 commits ahead of baseline, zero behind |
| `uat` | `bc75f9067ee404ae09b9ee8b3a106451c677cddd` | 284 commits ahead of baseline, zero behind |

At inspection, `develop` was 284 commits ahead of `uat`, zero behind. These compare results describe ancestry, not deployment state. Branch heads can move after this assessment.

GitHub blob hashes provide a focused baseline comparison:

| File | Baseline blob | UAT blob | Result |
| --- | --- | --- | --- |
| Responses endpoints | `616a302b832e127af97d3dffaf5d27bee57acde7` | `616a302b832e127af97d3dffaf5d27bee57acde7` | Identical |
| Responses-to-Chat transformation | `44576690cc0dd8b8e123cf73e5b36bb7e524daca` | `8f7fb1e74c7ae293f7ca882104ae9f130a0947c1` | Changed |
| Model-list endpoints | `becaf974d100589a0dc8d7776ed8e5429cceb757` | `becaf974d100589a0dc8d7776ed8e5429cceb757` | Identical |

The baseline remains relevant for endpoint structure, while tool transformation has evolved. This is a targeted comparison, not an exhaustive audit of the 284 intervening commits.

The inspected [deployment workflow](https://github.com/Filigrain/llmrouter/blob/947fe688fec2e69c4577224968c8473de701734d/.github/workflows/cd.yml) lists `main` and `uat` as push triggers and gates UAT test-service builds on `uat`. Therefore `develop` should not be treated as confirmed deployed UAT source. The exact commit serving `api-uat.routero.ai` remains unknown; obtain deployment evidence from the backend owner before claiming a source fix is live.

## Source findings and client implications

Links below pin the inspected `uat` revision unless otherwise stated. Source and test presence do not imply tests were executed or that the deployed endpoint behaves identically.

### Responses protocol

[Responses endpoints](https://github.com/Filigrain/llmrouter/blob/bc75f9067ee404ae09b9ee8b3a106451c677cddd/backend/proxy/litellm/proxy/routers/control_plane/response_api/endpoints.py) register `/v1/responses`, `/responses`, and `/openai/v1/responses` with `user_api_key_auth`. The normal creation path calls `ProxyBaseLLMRequestProcessing.base_process_llm_request` with `route_type="aresponses"`.

For Codex, plan for the UAT provider base `https://api-uat.routero.ai/v1` and Responses transport. Exact client configuration and helper authentication syntax remain version-dependent and unvalidated. Do not copy the specification's example into the user's settings in Phase 1.

The file also registers response retrieval/deletion, `/v1/responses/compact`, and `/v1/responses/{response_id}/cancel`. Route existence is insufficient to enable remote compaction or guarantee cancellation on a particular deployment. Validate those independently; disconnecting a live stream and cancelling a background response are distinct operations. WebSocket support is not established by this assessment.

The endpoint catches `ModifyResponseException` and can return a guardrail message as a Responses object with HTTP 200. Acceptance must inspect response content, terminal events, and gateway evidence rather than equating HTTP success with a permitted inference.

### Codex tool formats

[Translation implementation](https://github.com/Filigrain/llmrouter/blob/bc75f9067ee404ae09b9ee8b3a106451c677cddd/backend/proxy/litellm/responses/litellm_completion_transformation/transformation.py) contains `NamespacedToolPlan`, `encode_namespaced_tool_name`, and `plan_namespaced_tools`. These map Responses namespace tools to flat Chat Completions function names, handle collisions, and distinguish namespaced custom tools from functions.

[Streaming translation](https://github.com/Filigrain/llmrouter/blob/bc75f9067ee404ae09b9ee8b3a106451c677cddd/backend/proxy/litellm/responses/litellm_completion_transformation/streaming_iterator.py) uses the tool plan and custom-tool input conversion. [Gateway streaming tests](https://github.com/Filigrain/llmrouter/blob/bc75f9067ee404ae09b9ee8b3a106451c677cddd/backend/proxy/tests/test_litellm/responses/litellm_completion_transformation/test_tool_call_streaming_transformation.py) include namespace restoration, custom-tool calls, late tool names, argument chunking, and mixed custom/function streams consumable by an SDK.

These findings are consistent with work addressing the historical HTTP 422 `namespace` failure. They do not establish that DeepSeek currently passes. Test real Codex shell and `apply_patch` round trips, tool IDs/namespaces, incremental arguments, tool output replay, and follow-up before verification. Protocol translation belongs to the gateway, not a workaround inside the setup extension.

### Model discovery and authorization

[Model listing](https://github.com/Filigrain/llmrouter/blob/bc75f9067ee404ae09b9ee8b3a106451c677cddd/backend/proxy/litellm/proxy/routers/data_plane/model/main.py) registers authenticated `GET /v1/models`. Its normal path calls `get_available_models_for_user`, then filters by selected organization. A separate `scope=expand` path can widen listing for eligible administrators. An `anthropic-version` header selects a different response shape.

Connect should request the ordinary OpenAI-shaped list with the supplied Virtual Key, without `scope=expand`, organization overrides, or Anthropic headers. Do not infer key privileges from the organization label "Admin Group". Verify actual restricted-key behavior. An empty list is a supported diagnostic outcome, not permission to use a guessed model.

Discovery is not a Codex model catalog. Context/output limits and tool/compaction capabilities require separately maintained compatibility evidence. Aliases or auto-routing may select different downstream deployments; record the public model and actual deployment evidence where available.

[Token validation](https://github.com/Filigrain/llmrouter/blob/bc75f9067ee404ae09b9ee8b3a106451c677cddd/backend/proxy/litellm/proxy/auth/user_api_key_auth/token_validator.py) contains expiry, access, organization-balance, and budget checks. Their presence does not establish the test keys' current restrictions or an aggregate $10 cap. Diagnostic messages must use backend reason information when available; historical permission failures used differing HTTP codes, so status alone is insufficient to identify the cause.

### Policy and capability behavior

[Request-time policy resolution](https://github.com/Filigrain/llmrouter/blob/bc75f9067ee404ae09b9ee8b3a106451c677cddd/backend/proxy/litellm/proxy/policy_engine/policy_runtime.py) merges model-bound and key-bound capabilities per type. Override-mode capabilities preserve explicit request values; stack-mode capabilities merge policy values with caller values. Guardrails are described as stacking enforcement. Missing policies and dangling capability bindings can be skipped; the resolver documents fail-open handling for resolution errors.

Consequently, successful inference is not evidence that a policy was applied. Record actual policy state and test observable effects. Do not set request-level capability overrides in the baseline or configure policy management in the plugin. Policies remain manually managed.

The inspected `develop` [common request processor](https://github.com/Filigrain/llmrouter/blob/947fe688fec2e69c4577224968c8473de701734d/backend/proxy/litellm/proxy/common_request_processing.py) includes pre-call, during-call, success/failure, and streaming hooks around `aresponses`. This is evidence of pipeline infrastructure, not proof that every capability handles every Responses input/tool type correctly.

[Key/auth design](https://github.com/Filigrain/llmrouter/blob/947fe688fec2e69c4577224968c8473de701734d/docs/key-and-auth-design.md) distinguishes programmatic API keys from UI sessions and describes model, route, organization, and budget controls. [AI capabilities/MCP design](https://github.com/Filigrain/llmrouter/blob/947fe688fec2e69c4577224968c8473de701734d/docs/ai-capabilities-mcp-design.md) distinguishes inference interceptors from explicit MCP tools. MCP configuration is separate from inference-provider configuration and is deferred.

## Historical UAT evidence

Source documents supplied by the user: `Routero Week 4-6 Third-Party Integration Test.md`, `Routero Week 2-3 Documentation.md`, and `Routero UAT — n8n and Dify.md`. They are not copied wholesale into this repository because they contain environment-specific material and embedded links. Refer to their named sections when reproducing tests.

| Historical observation | Assessment treatment |
| --- | --- |
| Codex CLI v0.157.1 read `calculator.py` through an OpenAI-backed Routero model; exact public ID not provided in text | Strong first candidate; still needs current model identification and full edit/test/follow-up validation |
| DeepSeek failed on namespace tools | Regression candidate; source now contains translation; deployed behavior unknown |
| Codex prompt management and guardrails initially failed | Later report updates say they work; preserve chronology and revalidate, do not call them current defects |
| Semantic caching and memory issues followed by successful updates | Historical regression cases, not confirmed defects |
| Repeating a Codex prompt produced no exact cache hit | Inconclusive: conversation history/tool state can change request bodies; isolate full requests and inspect cache evidence |
| `preferred_auth_method` ignored; `env_key` worked in a historical client | Version-specific evidence, not an approved secure helper implementation |
| Prior missing metadata and unusually high token reporting | Unresolved until client reporting is reconciled with gateway usage and actual billing |
| n8n/Dify Chat Completions and explicit MCP workflow successes | Useful policy/control examples; do not substitute for Codex Responses acceptance |

## Integration contract to carry forward

1. A connection binds one HTTPS origin, credential reference, and public model ID. Never reuse a key on a different origin automatically. Normalize root versus `/v1` exactly once; reject unknown paths, credentials, query strings, and fragments.
2. List models with the ordinary key, intersect with versioned compatibility evidence, and activate only appropriately validated combinations. No model is verified by Phase 1.
3. Keep core and CLI logic independent of VS Code. A Codex adapter handles configuration, not inference translation or tool execution.
4. No key in repository files, arguments, previews, backups/manifests, or diagnostics. Validate Windows OS storage and command-backed auth before applying external-client configuration.
5. Preview changes, preserve unrelated TOML/comments, detect concurrent edits, write atomically, verify parsing, and use conflict-aware three-way rollback. Do not touch Codex auth, sandbox, approval, or MCP settings.
6. No billable automatic discovery probes. Explicit model tests use fixed benign content, bounded requests and duration, recorded costs, and no automatic replay after partial streams/tools.
7. Budget ceiling is $10 combined across keys. Without reliable cost/usage evidence, stop before potentially unbounded agent tests. A request count or timeout alone does not guarantee a dollar cap.
8. Current authorization restricts writes to this project. Future live tests must keep their scratch project/configuration here; writing normal user-level Codex settings requires a later explicit scope change.

## Open questions and Phase 2 gate

- What revision is actually deployed to UAT? Branch ancestry is not deployment confirmation.
- Which accessible public model ID routes to the previously successful OpenAI deployment, with what context/output limits and prices?
- Which exact Windows Codex CLI and IDE versions will be pinned? Is secure command-backed authentication supported?
- What are the current key/model policy bindings and restrictions? Test baseline without optional capability changes first; request manual policy changes only for isolated capability cases.
- Where can usage and billed cost be read safely, and is a combined server-side cap available? Backend owner/intermediary still unidentified.
- Do actual tools, continuation, cancellation, context boundaries, budgets, and permissions behave correctly through the deployed Responses path?

No source inspection here establishes an active production bug. Capture reproducible live failures and hand backend issues to their owner without editing the gateway.
