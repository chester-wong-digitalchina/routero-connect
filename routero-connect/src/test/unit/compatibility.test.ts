import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { CompatibilityDataError, evaluateActivation, parseCompatibilityCatalog, type CompatibilityRecord, type CompatibilityStatus } from "../../core/compatibility";

/** Synthetic test evidence only, never shipped in the real compatibility catalog. */
function record(status: CompatibilityStatus = "verified", overrides: Partial<CompatibilityRecord> = {}): CompatibilityRecord {
  return {
    id: "synthetic", modelId: "test/model", client: "codex-cli", origin: "https://test.example",
    clientVersions: { minimum: "1.2.0", maximumExclusive: "1.3.0" }, protocol: "responses", status,
    contextWindow: 1000, maxOutputTokens: 100, capabilities: { streaming: true, tools: true },
    continuation: { supported: true, limitations: [] }, compaction: { mode: "local", limitations: ["Synthetic local fallback."] },
    validation: { date: "2026-11-17", result: "passed", evidence: [{ kind: "automated", reference: "fixtures/synthetic.json" }] },
    limitations: ["Synthetic unit-test record, not a supported real model."], ...overrides,
  };
}

const input = {
  modelId: "test/model", visibleModelIds: ["test/model"], client: "codex-cli" as const,
  clientVersion: "1.2.1", protocol: "responses" as const, apiRoot: "https://test.example/v1",
};

function catalog(rows: readonly CompatibilityRecord[]) {
  return parseCompatibilityCatalog({ schemaVersion: 1, records: rows });
}

test("verified evidence allows a visible model only in the recorded combination", () => {
  const data = catalog([record()]);
  assert.deepEqual(evaluateActivation(data, input), { allowed: true, status: "verified", reason: "verified", recordId: "synthetic" });
  for (const change of [
    { apiRoot: "https://other.example" }, { clientVersion: "1.3.0" }, { clientVersion: "1.1.9" },
    { clientVersion: "1.2.1-alpha.1" }, { clientVersion: "01.2.1" },
    { client: "codex-vscode" as const }, { protocol: "chat-completions" as const },
  ]) {
    assert.equal(evaluateActivation(data, { ...input, ...change }).allowed, false);
  }
  assert.equal(evaluateActivation(data, { ...input, clientVersion: "1.2.0" }).allowed, true);
});

test("verified catalog entries never bypass current key visibility", () => {
  assert.deepEqual(evaluateActivation(catalog([record()]), { ...input, visibleModelIds: [] }), {
    allowed: false, status: "unverified", reason: "model-not-visible",
  });
});

test("experimental activation requires explicit opt-in and complete capability data", () => {
  const data = catalog([record("experimental")]);
  assert.equal(evaluateActivation(data, input).reason, "opt-in-required");
  assert.equal(evaluateActivation(data, { ...input, allowExperimental: true }).allowed, true);
  const incomplete = catalog([record("experimental", { contextWindow: null })]);
  assert.equal(evaluateActivation(incomplete, { ...input, allowExperimental: true }).reason, "capabilities-incomplete");
});

test("unverified and unsupported records cannot be opted into", () => {
  for (const status of ["unverified", "unsupported"] as const) {
    assert.equal(evaluateActivation(catalog([record(status)]), { ...input, allowExperimental: true }).allowed, false);
  }
});

test("model names cannot imply capabilities or support", () => {
  const data = catalog([]);
  assert.equal(evaluateActivation(data, { ...input, modelId: "openai/gpt-5", visibleModelIds: ["openai/gpt-5"] }).reason, "no-matching-evidence");
});

test("overlapping records fail closed instead of picking a favorable entry", () => {
  assert.equal(evaluateActivation(catalog([record(), record("unsupported", { id: "second" })]), input).reason, "ambiguous-evidence");
});

test("invalid data, unknown schema, duplicate IDs, and extra credential fields are rejected", () => {
  for (const value of [null, { schemaVersion: 2, records: [] }, { schemaVersion: 1, records: [record(), record()] },
    { schemaVersion: 1, records: [{ ...record(), apiKey: "dummy" }] },
    { schemaVersion: 1, records: [record("verified", { contextWindow: null })] },
    { schemaVersion: 1, records: [record("verified", { maxOutputTokens: 2000 })] },
    { schemaVersion: 1, records: [record("verified", { validation: { date: "2026-02-30", result: "passed", evidence: [{ kind: "manual", reference: "docs/result.md" }] } })] },
    { schemaVersion: 1, records: [record("verified", { validation: { date: "2026-11-17", result: "passed", evidence: [{ kind: "source", reference: "docs/result.md" }] } })] },
    { schemaVersion: 1, records: [record("verified", { clientVersions: { minimum: "1.3.0", maximumExclusive: "1.2.0" } })] },
  ]) {
    assert.throws(() => parseCompatibilityCatalog(value), CompatibilityDataError);
  }
});

test("real catalog preserves Phase 2 failures and contains no activatable models", () => {
  const path = resolve(__dirname, "../../../compatibility/models.json");
  const data = parseCompatibilityCatalog(JSON.parse(readFileSync(path, "utf8")));
  assert.equal(data.records.length, 2);
  for (const row of data.records) {
    assert.equal(row.status, "unsupported");
    assert.equal(row.contextWindow, null);
    assert.equal(evaluateActivation(data, {
      modelId: row.modelId, visibleModelIds: [row.modelId], client: row.client, clientVersion: "0.157.1",
      apiRoot: row.origin, protocol: row.protocol, allowExperimental: true,
    }).allowed, false);
  }
});
