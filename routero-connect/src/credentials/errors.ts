export type CredentialErrorCode = "unsupported-platform" | "unsupported-runtime" | "store-unavailable" | "timeout" | "missing" | "foreign-entry" | "invalid-entry" | "invalid-secret" | "already-exists" | "not-owner" | "shared-credential" | "conflict" | "invalid-arguments" | "helper-stage-failed";

const MESSAGES: Record<CredentialErrorCode, string> = {
  "unsupported-platform": "External credentials currently require Windows.",
  "unsupported-runtime": "The helper requires Node.js 24.18.0 or a later Node.js 24 release.",
  "store-unavailable": "Windows credential storage is unavailable. No plaintext fallback was used.",
  timeout: "The credential helper timed out. Check its availability before trying again.",
  missing: "No credential exists for this profile, origin, and reference.",
  "foreign-entry": "The entry is not owned by Routero Connect and was left unchanged.",
  "invalid-entry": "The stored credential metadata is invalid. The entry was left unchanged.",
  "invalid-secret": "Supply one Routero key through stdin, without spaces or extra lines.",
  "already-exists": "A credential already exists. Use explicit replacement or link an authorized profile.",
  "not-owner": "This profile does not own the credential reference. The entry was left unchanged.",
  "shared-credential": "Other profiles use this credential. Create a separate reference before replacing it.",
  conflict: "The credential changed concurrently. No conflicting update was applied.",
  "invalid-arguments": "Invalid credential arguments. Run --help; never pass a key as an argument.",
  "helper-stage-failed": "Helper staging failed. Use a new directory without symlinked ancestors; existing files were not overwritten.",
};

/** Fixed messages only; never attach subprocess output, keys, or raw exceptions. */
export class CredentialError extends Error {
  constructor(readonly code: CredentialErrorCode) {
    super(MESSAGES[code]);
    this.name = "CredentialError";
  }
}
