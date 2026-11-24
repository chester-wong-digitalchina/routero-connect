import { CredentialError } from "./errors";

export function assertCredentialRuntime(platform: NodeJS.Platform = process.platform, nodeVersion = process.versions.node): void {
  if (platform !== "win32") {
    throw new CredentialError("unsupported-platform");
  }
  const version = /^24\.(\d+)\.\d+$/u.exec(nodeVersion);
  if (!version || Number(version[1]) < 18) {
    throw new CredentialError("unsupported-runtime");
  }
}
