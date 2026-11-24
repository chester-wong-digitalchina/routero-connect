import type { Readable } from "node:stream";
import { createConnectionProfile, createCredentialReference, type ConnectionProfile } from "../core/profiles";
import { CredentialError } from "../credentials/errors";
import { CredentialService } from "../credentials/service";
import type { CliOutput } from "./run";

export interface CredentialCommand {
  readonly operation: "store" | "print" | "delete" | "link";
  readonly profile: ConnectionProfile;
  readonly replace: boolean;
  readonly from?: ConnectionProfile;
}

/** Non-secret flags only. Profiles are explicit; no hidden profile/global-key lookup. */
export function parseCredentialCommand(args: readonly string[]): CredentialCommand {
  try {
    const operation = args[0];
    if (!["store", "print", "delete", "link"].includes(operation)) {
      throw new Error();
    }
    const values = new Map<string, string>();
    let replace = false;
    for (let index = 1; index < args.length; index++) {
      const flag = args[index];
      if (flag === "--replace" && operation === "store" && !replace) {
        replace = true;
        continue;
      }
      if (!["--profile", "--api-root", "--credential-ref", "--from-profile"].includes(flag)
        || values.has(flag) || index + 1 >= args.length || args[index + 1].startsWith("--")) {
        throw new Error();
      }
      values.set(flag, args[++index]);
    }
    const id = values.get("--profile");
    const apiRoot = values.get("--api-root");
    if (!id || !apiRoot || (operation !== "link" && values.has("--from-profile"))) {
      throw new Error();
    }
    const credential = createCredentialReference(values.get("--credential-ref") ?? id, apiRoot);
    const profile = createConnectionProfile({ id, name: id, apiRoot, credential });
    let from: ConnectionProfile | undefined;
    if (operation === "link") {
      const fromId = values.get("--from-profile");
      if (!fromId || !values.has("--credential-ref")) {
        throw new Error();
      }
      from = createConnectionProfile({ id: fromId, name: fromId, apiRoot, credential });
    }
    return { operation: operation as CredentialCommand["operation"], profile, replace, from };
  } catch {
    throw new CredentialError("invalid-arguments");
  }
}

export async function readSecretStdin(input: Readable, timeoutMs = 15000): Promise<string> {
  if ((input as Readable & { isTTY?: boolean }).isTTY) {
    throw new CredentialError("invalid-secret");
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let length = 0;
    const finish = (error?: CredentialError) => {
      clearTimeout(timer);
      input.off("data", onData);
      input.off("end", onEnd);
      input.off("error", onError);
      input.pause();
      if (error) {
        chunks.forEach((chunk) => chunk.fill(0));
        reject(error);
      }
    };
    const onData = (chunk: Buffer | string) => {
      const bytes = Buffer.isBuffer(chunk) ? Buffer.from(chunk) : Buffer.from(chunk, "utf8");
      chunks.push(bytes);
      length += bytes.length;
      if (length > 2048) {
        finish(new CredentialError("invalid-secret"));
      }
    };
    const onError = () => finish(new CredentialError("invalid-secret"));
    const onEnd = () => {
      const bytes = Buffer.concat(chunks);
      const value = bytes.toString("utf8").replace(/\r?\n$/u, "");
      bytes.fill(0);
      chunks.forEach((chunk) => chunk.fill(0));
      finish();
      resolve(value);
    };
    const timer = setTimeout(() => finish(new CredentialError("timeout")), timeoutMs);
    input.on("data", onData);
    input.on("end", onEnd);
    input.on("error", onError);
  });
}

export async function executeCredentialCommand(command: CredentialCommand, service: CredentialService, input: Readable, output: CliOutput): Promise<number> {
  try {
    if (command.operation === "print") {
      // Intentionally token-only stdout for Codex. No preceding diagnostics/help.
      output.stdout(await service.read(command.profile));
    } else if (command.operation === "store") {
      await service.store(command.profile, await readSecretStdin(input), command.replace);
      output.stdout(command.replace ? "Credential replaced." : "Credential stored.");
    } else if (command.operation === "delete") {
      output.stdout(await service.remove(command.profile) === "deleted" ? "Credential deleted." : "Profile detached; credential retained for other profiles.");
    } else if (command.from) {
      await service.link(command.from, command.profile);
      output.stdout("Profile linked to the shared credential reference.");
    } else {
      throw new CredentialError("invalid-arguments");
    }
    return 0;
  } catch (error) {
    const safe = error instanceof CredentialError ? error : new CredentialError("store-unavailable");
    output.stderr(`${safe.code}: ${safe.message}`);
    return 1;
  }
}
