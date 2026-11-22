import { strict as assert } from "node:assert";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { stageHelper } from "../../credentials/stage-helper";

test("helper stages a pinned independent bundle with paths containing spaces", async () => {
  // Project-local output only; the parent is created by test compilation/build.
  const root = await mkdtemp(resolve("out/helper-stage-"));
  const source = join(root, "source.cjs");
  await writeFile(source, "console.log('test-only helper');\n");
  const destination = join(root, "stable helper");
  const manifest = await stageHelper(source, destination);
  assert.equal(await readFile(manifest.helperScript, "utf8"), await readFile(source, "utf8"));
  assert.equal(manifest.nodeExecutable, process.execPath);
  assert.match(manifest.sha256, /^[a-f0-9]{64}$/u);
  assert.equal(JSON.parse(await readFile(join(destination, "helper-manifest.json"), "utf8")).helperVersion, "0.0.3");
  await writeFile(source, "changed source");
  assert.ok(!(await readFile(manifest.helperScript, "utf8")).includes("changed"));
  await assert.rejects(stageHelper(source, destination));
  assert.ok(!(await readFile(manifest.helperScript, "utf8")).includes("changed"));
});
