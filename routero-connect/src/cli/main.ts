#!/usr/bin/env node
import { runCli } from "./run";

try {
  process.exitCode = runCli(process.argv.slice(2), {
    stdout: (text) => process.stdout.write(`${text}\n`),
    stderr: (text) => process.stderr.write(`${text}\n`),
  });
} catch {
  // Unexpected exceptions may contain process/environment data: never print raw.
  process.stderr.write("Routero Connect could not complete the offline check. No client setup was applied.\n");
  process.exitCode = 1;
}
