import { createHash } from "node:crypto";
import { createConnectionProfile, type ConnectionProfile } from "../core/profiles";
import { CredentialError } from "./errors";

export const CREDENTIAL_NAMESPACE = "RouteroConnect/v1/";

/** Values are opaque private blobs. Implementations must not log any of them. */
export interface CredentialBackend {
  read(target: string): Promise<string | undefined>;
  compareExchange(target: string, expected: string | undefined, next: string | undefined): Promise<boolean>;
}

interface Envelope {
  schemaVersion: 1;
  application: "routero-connect";
  origin: string;
  referenceId: string;
  owners: string[];
  token: string;
}

export function validateSecret(value: string): string {
  if (!/^sk-[a-z0-9_-]{16,1020}$/iu.test(value)) {
    throw new CredentialError("invalid-secret");
  }
  return value;
}

export function credentialTarget(profile: ConnectionProfile): string {
  const checked = createConnectionProfile({ id: profile.id, name: profile.name, apiRoot: profile.api.origin, credential: profile.credential });
  const digest = createHash("sha256").update(JSON.stringify([checked.api.origin, checked.credential.id])).digest("hex");
  return `${CREDENTIAL_NAMESPACE}${digest}`;
}

function decode(raw: string, profile: ConnectionProfile): Envelope {
  try {
    if (Buffer.byteLength(raw, "utf8") > 2560) {
      throw new Error();
    }
    const value = JSON.parse(raw) as Envelope;
    const fields = ["schemaVersion", "application", "origin", "referenceId", "owners", "token"];
    if (!value || typeof value !== "object" || Object.keys(value).length !== fields.length
      || Object.keys(value).some((key) => !fields.includes(key)) || value.schemaVersion !== 1
      || value.application !== "routero-connect" || value.origin !== profile.api.origin
      || value.referenceId !== profile.credential.id || !Array.isArray(value.owners)
      || value.owners.length === 0 || value.owners.length > 16
      || new Set(value.owners).size !== value.owners.length
      || value.owners.some((owner) => typeof owner !== "string" || !/^[a-z0-9][a-z0-9._-]{0,63}$/iu.test(owner) || /^sk-/iu.test(owner))
      || typeof value.token !== "string") {
      throw new Error();
    }
    validateSecret(value.token);
    return value;
  } catch {
    throw new CredentialError("invalid-entry");
  }
}

function encode(value: Envelope): string {
  const encoded = JSON.stringify(value);
  // Windows CREDENTIALW allows at most 2560 bytes in a generic credential blob.
  if (value.owners.length > 16 || Buffer.byteLength(encoded, "utf8") > 2560) {
    throw new CredentialError("invalid-entry");
  }
  return encoded;
}

export class CredentialService {
  constructor(private readonly backend: CredentialBackend) {}

  async read(profile: ConnectionProfile): Promise<string> {
    const raw = await this.backend.read(credentialTarget(profile));
    if (raw === undefined) {
      throw new CredentialError("missing");
    }
    const value = decode(raw, profile);
    if (!value.owners.includes(profile.id)) {
      throw new CredentialError("not-owner");
    }
    return value.token;
  }

  async store(profile: ConnectionProfile, token: string, replace = false): Promise<void> {
    validateSecret(token);
    const target = credentialTarget(profile);
    const raw = await this.backend.read(target);
    let owners = [profile.id];
    if (raw !== undefined) {
      const value = decode(raw, profile);
      if (!value.owners.includes(profile.id)) {
        throw new CredentialError("not-owner");
      }
      if (!replace) {
        throw new CredentialError("already-exists");
      }
      if (value.owners.length > 1) {
        throw new CredentialError("shared-credential");
      }
      owners = value.owners;
    } else if (replace) {
      throw new CredentialError("missing");
    }
    const next = encode({ schemaVersion: 1, application: "routero-connect", origin: profile.api.origin, referenceId: profile.credential.id, owners, token });
    if (!await this.backend.compareExchange(target, raw, next)) {
      throw new CredentialError("conflict");
    }
  }

  /** Linking requires an already authorized owner, not knowledge of a target name. */
  async link(existing: ConnectionProfile, added: ConnectionProfile): Promise<void> {
    const target = credentialTarget(existing);
    if (target !== credentialTarget(added)) {
      throw new CredentialError("invalid-arguments");
    }
    const raw = await this.backend.read(target);
    if (raw === undefined) {
      throw new CredentialError("missing");
    }
    const value = decode(raw, existing);
    if (!value.owners.includes(existing.id)) {
      throw new CredentialError("not-owner");
    }
    if (value.owners.includes(added.id)) {
      return;
    }
    const next = encode({ ...value, owners: [...value.owners, added.id] });
    if (!await this.backend.compareExchange(target, raw, next)) {
      throw new CredentialError("conflict");
    }
  }

  async remove(profile: ConnectionProfile): Promise<"deleted" | "retained"> {
    const target = credentialTarget(profile);
    const raw = await this.backend.read(target);
    if (raw === undefined) {
      throw new CredentialError("missing");
    }
    const value = decode(raw, profile);
    if (!value.owners.includes(profile.id)) {
      throw new CredentialError("not-owner");
    }
    const owners = value.owners.filter((owner) => owner !== profile.id);
    const next = owners.length ? encode({ ...value, owners }) : undefined;
    if (!await this.backend.compareExchange(target, raw, next)) {
      throw new CredentialError("conflict");
    }
    return owners.length ? "retained" : "deleted";
  }
}
