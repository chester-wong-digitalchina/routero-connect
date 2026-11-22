import { isAbsolute } from "node:path";
import { normalizeApiRoot } from "../core/api-root";
import { ConfigError } from "./errors";

export type ManagedValue = string | boolean | number | readonly string[];
export interface SettingChange {
  readonly path: readonly string[];
  readonly value: ManagedValue | undefined;
  readonly replaceExisting?: boolean;
}

const ROOT = new Set(["model", "model_provider"]);
const PROVIDER = new Set(["name", "base_url", "wire_api", "supports_websockets", "request_max_retries", "stream_max_retries", "stream_idle_timeout_ms", "env_key", "requires_openai_auth"]);
const AUTH = new Set(["command", "args", "timeout_ms", "refresh_interval_ms"]);

export function isManagedPath(path: readonly string[]): boolean {
  return (path.length === 1 && ROOT.has(path[0]))
    || (path.length === 3 && path[0] === "model_providers" && path[1] === "routero" && PROVIDER.has(path[2]))
    || (path.length === 4 && path[0] === "model_providers" && path[1] === "routero" && path[2] === "auth" && AUTH.has(path[3]));
}

export function pathKey(path: readonly string[]): string { return JSON.stringify(path); }

function safeString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 4096
    && !/[\u0000-\u001f\u007f]|\bsk-|\bBearer\s|\beyJ[a-z0-9_-]+\.[a-z0-9_-]+\./iu.test(value);
}

export function validateChanges(input: readonly SettingChange[]): readonly SettingChange[] {
  const seen = new Set<string>();
  if (!Array.isArray(input) || input.length > 32) { throw new ConfigError("invalid-change"); }
  return Object.freeze(input.map((change) => {
    if (!change || !Array.isArray(change.path) || !isManagedPath(change.path) || seen.has(pathKey(change.path))
      || (change.replaceExisting !== undefined && typeof change.replaceExisting !== "boolean")) {
      throw new ConfigError("invalid-change");
    }
    seen.add(pathKey(change.path));
    const value = change.value;
    const leaf = change.path.at(-1)!;
    let valid = value === undefined;
    if (value !== undefined) {
      if (["model", "name"].includes(leaf)) { valid = safeString(value); }
      else if (leaf === "model_provider") { valid = value === "routero"; }
      else if (leaf === "wire_api") { valid = value === "responses"; }
      else if (leaf === "base_url" && safeString(value)) {
        try { valid = normalizeApiRoot(value).apiBase === value; } catch { valid = false; }
      } else if (leaf === "command") { valid = safeString(value) && isAbsolute(value); }
      else if (leaf === "args") { valid = Array.isArray(value) && value.length > 0 && value.length <= 24 && value.every(safeString) && !value.some((item) => /^--(?:api[-_]?key|token|password|secret)$/iu.test(item)); }
      else if (leaf === "supports_websockets") { valid = typeof value === "boolean"; }
      else if (["timeout_ms", "refresh_interval_ms", "request_max_retries", "stream_max_retries", "stream_idle_timeout_ms"].includes(leaf)) { valid = typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
      // Existing env-based auth may be removed explicitly, but never introduced.
    }
    if (!valid) { throw new ConfigError("invalid-change"); }
    return Object.freeze({ path: Object.freeze([...change.path]), value: Array.isArray(value) ? Object.freeze([...value]) : value, replaceExisting: change.replaceExisting });
  }));
}
