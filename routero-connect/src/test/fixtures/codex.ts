import { parseCompatibilityCatalog, type CompatibilityRecord } from "../../core/compatibility";

export function fixtureCatalog() {
  const record: CompatibilityRecord = {
    id: "fixture-one", modelId: "fixture/one", client: "codex-cli", origin: "https://fixture.invalid",
    clientVersions: { minimum: "0.157.1", maximumExclusive: "0.157.2" }, protocol: "responses", status: "verified",
    contextWindow: 32000, maxOutputTokens: 1024, capabilities: { streaming: true, tools: true },
    continuation: { supported: true, limitations: [] }, compaction: { mode: "local", limitations: [] },
    validation: { date: "2026-11-23", result: "passed", evidence: [{ kind: "automated", reference: "docs/phase-6-validation.md" }] }, limitations: ["Synthetic test fixture only. Not production evidence."],
  };
  return parseCompatibilityCatalog({ schemaVersion: 1, records: [record, { ...record, id: "fixture-two", modelId: "fixture/two" }] });
}

