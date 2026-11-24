export type ConfigErrorCode = "invalid-path" | "invalid-change" | "invalid-toml" | "unsupported-layout" | "conflict" | "busy" | "unsafe-path" | "recovery-unavailable" | "invalid-recovery" | "write-failed" | "verification-failed" | "invalid-plan";

const MESSAGES: Record<ConfigErrorCode, string> = {
  "invalid-path": "Select an absolute config.toml path in the explicitly allowed directory and a separate recovery directory.",
  "invalid-change": "Only supported non-secret Routero settings can be managed. No change was planned.",
  "invalid-toml": "The TOML is invalid. Correct its structure before planning changes.",
  "unsupported-layout": "This managed field uses a layout the editor cannot safely change. The original text was preserved.",
  conflict: "The configuration changed. Review a new plan before applying it.",
  busy: "Another configuration operation holds the lock. No update was attempted.",
  "unsafe-path": "A linked, non-regular, or otherwise unsafe path was refused.",
  "recovery-unavailable": "Private recovery storage could not be prepared. No configuration update was attempted.",
  "invalid-recovery": "Recovery metadata or snapshots failed validation. No restoration was attempted.",
  "write-failed": "The configuration write failed. Inspect the private recovery record before retrying.",
  "verification-failed": "The final file did not match the expected result. Recovery information was retained; later edits were not overwritten automatically.",
  "invalid-plan": "Use an unchanged plan created by this engine instance. Serialized, reused, or foreign plans are not accepted.",
};

/** Never attach source text or a parser/system exception to a public error. */
export class ConfigError extends Error {
  constructor(readonly code: ConfigErrorCode, readonly location?: { readonly line: number; readonly column: number }) {
    super(MESSAGES[code]);
    this.name = "ConfigError";
  }
}
