import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { resolveCodexExecutable } from "../../adapters/codex/runtime";
import { CodexWorkflowError } from "../../adapters/codex/errors";

test("read-only Codex selection resolves an official-style linked bin directory", async () => {
  const root = await mkdtemp(resolve("out/codex-runtime-"));
  const release = join(root, "release");
  await mkdir(release);
  const executable = join(release, "codex.exe");
  await writeFile(executable, "test placeholder; never executed");
  const stable = join(root, "bin");
  await symlink(release, stable, process.platform === "win32" ? "junction" : "dir");
  const actual = await resolveCodexExecutable(join(stable, "codex.exe"));
  assert.equal(actual.toLowerCase(), executable.toLowerCase());
  await assert.rejects(resolveCodexExecutable(join(stable, "codex.cmd")), CodexWorkflowError);
  await assert.rejects(resolveCodexExecutable(join(root, "missing", "codex.exe")), CodexWorkflowError);
  await assert.rejects(resolveCodexExecutable("codex.exe"), CodexWorkflowError);
});
