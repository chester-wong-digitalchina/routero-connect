/** Exact client versions with recorded command-auth protocol checks; not model approval. */
export const CODEX_CLI_VERSIONS = ["0.157.1", "0.172.0"] as const;

export function isInspectedCodexVersion(version: string | undefined): boolean {
  return CODEX_CLI_VERSIONS.some((candidate) => candidate === version);
}
