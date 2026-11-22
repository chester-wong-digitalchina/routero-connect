#!/usr/bin/env node
import { runCli } from "./run";
import { join, resolve } from "node:path";
import { parseCredentialCommand, executeCredentialCommand } from "./credentials";
import { CredentialError } from "../credentials/errors";
import { CredentialService } from "../credentials/service";
import { WindowsCredentialBackend, createWindowsBridge } from "../credentials/windows-backend";
import { stageHelper } from "../credentials/stage-helper";
import { assertCredentialRuntime } from "../credentials/runtime";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const output = {
    stdout: (text) => process.stdout.write(`${text}\n`),
    stderr: (text) => process.stderr.write(`${text}\n`),
  } satisfies import("./run").CliOutput;
  try {
    if (args[0] === "credential") {
      const command = parseCredentialCommand(args.slice(1));
      assertCredentialRuntime();
      const backend = new WindowsCredentialBackend(createWindowsBridge(join(__dirname, "credential-runtime")));
      process.exitCode = await executeCredentialCommand(command, new CredentialService(backend), process.stdin, output);
    } else if (args[0] === "helper") {
      if (args.length !== 4 || args[1] !== "stage" || args[2] !== "--destination" || !args[3]) {
        throw new CredentialError("invalid-arguments");
      }
      assertCredentialRuntime();
      const manifest = await stageHelper(__filename, resolve(args[3]));
      output.stdout(JSON.stringify(manifest, null, 2));
      process.exitCode = 0;
    } else {
      process.exitCode = runCli(args, output);
    }
  } catch (error) {
    // No raw subprocess/exception output, input arguments, or secret values.
    const safe = error instanceof CredentialError ? error : new CredentialError("store-unavailable");
    output.stderr(`${safe.code}: ${safe.message}`);
    process.exitCode = 1;
  }
}

void main();
