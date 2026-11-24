import { normalizeApiRoot, type ApiEndpoints } from "./api-root";

export interface CredentialReference {
  readonly id: string;
  readonly origin: string;
}

export interface ConnectionProfile {
  readonly id: string;
  readonly name: string;
  readonly api: ApiEndpoints;
  readonly credential: CredentialReference;
}

function validateId(id: string): void {
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/iu.test(id) || /^sk-/iu.test(id)) {
    throw new Error("Use a short profile or credential reference identifier, never an API key.");
  }
}

/** A reference only: this function neither accepts nor stores a credential value. */
export function createCredentialReference(id: string, apiRoot: string): CredentialReference {
  validateId(id);
  return Object.freeze({ id, origin: normalizeApiRoot(apiRoot).origin });
}

export function createConnectionProfile(input: {
  id: string;
  name: string;
  apiRoot: string;
  credential: CredentialReference;
}): ConnectionProfile {
  validateId(input.id);
  validateId(input.credential.id);
  const name = input.name.trim();
  if (!name || name.length > 80 || /[\u0000-\u001f\u007f]|\bsk-/iu.test(name)) {
    throw new Error("Use a connection name of 1–80 characters without secrets or control characters.");
  }
  const api = normalizeApiRoot(input.apiRoot);
  if (input.credential.origin !== api.origin) {
    throw new Error("This credential reference belongs to a different origin. Select a credential for this connection.");
  }
  return Object.freeze({
    id: input.id,
    name,
    api,
    credential: createCredentialReference(input.credential.id, api.origin),
  });
}
