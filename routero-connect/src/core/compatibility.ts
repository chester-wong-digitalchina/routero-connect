import { normalizeApiRoot } from "./api-root";

export const CLIENTS = ["codex-cli", "codex-vscode", "claude-code-cli", "claude-code-vscode", "vscode-chat"] as const;
export type ClientId = typeof CLIENTS[number];
export type Protocol = "responses" | "messages" | "chat-completions";
export type CompatibilityStatus = "verified" | "experimental" | "unverified" | "unsupported";

export interface CompatibilityRecord {
  readonly id: string;
  readonly modelId: string;
  readonly client: ClientId;
  readonly origin: string;
  readonly clientVersions: { readonly minimum: string; readonly maximumExclusive: string };
  readonly protocol: Protocol;
  readonly status: CompatibilityStatus;
  readonly contextWindow: number | null;
  readonly maxOutputTokens: number | null;
  readonly capabilities: { readonly streaming: boolean | null; readonly tools: boolean | null };
  readonly continuation: { readonly supported: boolean | null; readonly limitations: readonly string[] };
  readonly compaction: { readonly mode: "unknown" | "unsupported" | "local" | "remote"; readonly limitations: readonly string[] };
  readonly validation: {
    readonly date: string;
    readonly result: "passed" | "partial" | "failed" | "not-tested";
    readonly evidence: readonly { readonly kind: "manual" | "automated" | "source"; readonly reference: string }[];
  };
  readonly limitations: readonly string[];
}

export interface CompatibilityCatalog {
  readonly schemaVersion: 1;
  readonly records: readonly CompatibilityRecord[];
}

export class CompatibilityDataError extends Error {
  constructor() {
    super("Compatibility data is invalid. No model can be activated from this data.");
    this.name = "CompatibilityDataError";
  }
}

function fail(): never {
  throw new CompatibilityDataError();
}

function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fail();
  }
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some((key) => !keys.includes(key)) || keys.some((key) => !Object.hasOwn(result, key))) {
    return fail();
  }
  return result;
}

function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 2048 || /[\u0000-\u001f\u007f]|\bsk-/iu.test(value)) {
    return fail();
  }
  return value;
}

function choice<T extends string>(value: unknown, values: readonly T[]): T {
  return typeof value === "string" && values.includes(value as T) ? value as T : fail();
}

function texts(value: unknown): readonly string[] {
  return Array.isArray(value) ? Object.freeze(value.map(text)) : fail();
}

function booleanOrUnknown(value: unknown): boolean | null {
  return value === null || typeof value === "boolean" ? value : fail();
}

function limit(value: unknown): number | null {
  return value === null || (typeof value === "number" && Number.isSafeInteger(value) && value > 0) ? value : fail();
}

/** Only stable three-part versions are supported initially; prereleases fail closed. */
function version(value: string): readonly number[] | undefined {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.test(value)) {
    return undefined;
  }
  const parts = value.split(".").map(Number);
  return parts.every(Number.isSafeInteger) ? parts : undefined;
}

function compare(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < 3; index++) {
    if (left[index] !== right[index]) {
      return left[index] < right[index] ? -1 : 1;
    }
  }
  return 0;
}

function completeCapabilities(record: CompatibilityRecord): boolean {
  return record.contextWindow !== null && record.maxOutputTokens !== null
    && record.maxOutputTokens <= record.contextWindow
    && record.capabilities.streaming === true && record.capabilities.tools === true
    && record.continuation.supported === true && record.compaction.mode !== "unknown";
}

function parseRecord(value: unknown): CompatibilityRecord {
  const row = object(value, ["id", "modelId", "client", "origin", "clientVersions", "protocol", "status", "contextWindow", "maxOutputTokens", "capabilities", "continuation", "compaction", "validation", "limitations"]);
  const range = object(row.clientVersions, ["minimum", "maximumExclusive"]);
  const minimum = text(range.minimum);
  const maximumExclusive = text(range.maximumExclusive);
  const lower = version(minimum);
  const upper = version(maximumExclusive);
  if (!lower || !upper || compare(lower, upper) >= 0) {
    return fail();
  }
  const caps = object(row.capabilities, ["streaming", "tools"]);
  const continuation = object(row.continuation, ["supported", "limitations"]);
  const compaction = object(row.compaction, ["mode", "limitations"]);
  const validation = object(row.validation, ["date", "result", "evidence"]);
  const date = text(validation.date);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
    return fail();
  }
  if (!Array.isArray(validation.evidence) || validation.evidence.length === 0) {
    return fail();
  }
  const evidence = validation.evidence.map((entry: unknown) => {
    const item = object(entry, ["kind", "reference"]);
    const reference = text(item.reference);
    if (reference.startsWith("https://")) {
      let url: URL;
      try {
        url = new URL(reference);
      } catch {
        return fail();
      }
      if (url.username || url.password || url.search || url.hash) {
        return fail();
      }
    } else if (!/^[a-z0-9/_.-]+$/iu.test(reference) || reference.includes("..") || reference.startsWith("/")) {
      return fail();
    }
    return Object.freeze({ kind: choice(item.kind, ["manual", "automated", "source"] as const), reference });
  });
  const origin = text(row.origin);
  try {
    if (normalizeApiRoot(origin).origin !== origin) {
      return fail();
    }
  } catch {
    return fail();
  }
  const record: CompatibilityRecord = Object.freeze({
    id: text(row.id), modelId: text(row.modelId), client: choice(row.client, CLIENTS), origin,
    clientVersions: Object.freeze({ minimum, maximumExclusive }),
    protocol: choice(row.protocol, ["responses", "messages", "chat-completions"] as const),
    status: choice(row.status, ["verified", "experimental", "unverified", "unsupported"] as const),
    contextWindow: limit(row.contextWindow), maxOutputTokens: limit(row.maxOutputTokens),
    capabilities: Object.freeze({ streaming: booleanOrUnknown(caps.streaming), tools: booleanOrUnknown(caps.tools) }),
    continuation: Object.freeze({ supported: booleanOrUnknown(continuation.supported), limitations: texts(continuation.limitations) }),
    compaction: Object.freeze({ mode: choice(compaction.mode, ["unknown", "unsupported", "local", "remote"] as const), limitations: texts(compaction.limitations) }),
    validation: Object.freeze({ date, result: choice(validation.result, ["passed", "partial", "failed", "not-tested"] as const), evidence: Object.freeze(evidence) }),
    limitations: texts(row.limitations),
  });
  if ((record.contextWindow !== null && record.maxOutputTokens !== null && record.maxOutputTokens > record.contextWindow)
    || (record.status === "verified" && (!completeCapabilities(record) || record.validation.result !== "passed" || !evidence.some((item) => item.kind !== "source")))) {
    return fail();
  }
  return record;
}

/** Parse at the data boundary. Reject extra fields rather than persisting secrets. */
export function parseCompatibilityCatalog(value: unknown): CompatibilityCatalog {
  const data = object(value, ["schemaVersion", "records"]);
  if (data.schemaVersion !== 1 || !Array.isArray(data.records)) {
    return fail();
  }
  const records = data.records.map(parseRecord);
  if (new Set(records.map((record) => record.id)).size !== records.length) {
    return fail();
  }
  return Object.freeze({ schemaVersion: 1, records: Object.freeze(records) });
}

export interface ActivationDecision {
  readonly allowed: boolean;
  readonly status: CompatibilityStatus;
  readonly reason: "verified" | "experimental-opt-in" | "isolated-validation-opt-in" | "model-not-visible" | "no-matching-evidence" | "ambiguous-evidence" | "validation-required" | "unsupported" | "opt-in-required" | "capabilities-incomplete";
  readonly recordId?: string;
}

export function evaluateActivation(catalog: CompatibilityCatalog, input: {
  modelId: string;
  visibleModelIds: readonly string[];
  client: ClientId;
  clientVersion: string;
  protocol: Protocol;
  apiRoot: string;
  allowExperimental?: boolean;
}): ActivationDecision {
  if (!input.visibleModelIds.includes(input.modelId)) {
    return { allowed: false, status: "unverified", reason: "model-not-visible" };
  }
  const origin = normalizeApiRoot(input.apiRoot).origin;
  const clientVersion = version(input.clientVersion);
  const matches = catalog.records.filter((record) => record.modelId === input.modelId
    && record.client === input.client && record.origin === origin && record.protocol === input.protocol
    && clientVersion && compare(clientVersion, version(record.clientVersions.minimum)!) >= 0
    && compare(clientVersion, version(record.clientVersions.maximumExclusive)!) < 0);
  if (matches.length !== 1) {
    return { allowed: false, status: "unverified", reason: matches.length ? "ambiguous-evidence" : "no-matching-evidence" };
  }
  const record = matches[0];
  const result = { status: record.status, recordId: record.id };
  if (record.status === "unsupported" || record.status === "unverified") {
    return { ...result, allowed: false, reason: record.status === "unsupported" ? "unsupported" : "validation-required" };
  }
  if (!completeCapabilities(record) || record.validation.result === "failed" || record.validation.result === "not-tested") {
    return { ...result, allowed: false, reason: "capabilities-incomplete" };
  }
  if (record.status === "experimental" && !input.allowExperimental) {
    return { ...result, allowed: false, reason: "opt-in-required" };
  }
  return { ...result, allowed: true, reason: record.status === "verified" ? "verified" : "experimental-opt-in" };
}
