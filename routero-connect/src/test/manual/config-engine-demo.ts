/** Offline demonstration. Every file is a dummy fixture under project tmp/. */
import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { CodexConfigEngine } from "../../config/engine";

async function main(): Promise<void> {
  const project = resolve(__dirname, "../../..");
  const parent = join(project, "tmp", "validation");
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, "config-demo-"));
  const settings = join(root, "dummy settings");
  await mkdir(settings);
  const file = join(settings, "config.toml");
  await writeFile(file, '# Dummy local fixture, not your Codex settings.\nmodel="personal"\nmodel_provider="personal"\n[windows]\nsandbox="elevated"\n');
  const engine = new CodexConfigEngine({ configFile: file, allowedConfigDirectory: settings, recoveryDirectory: join(root, "private recovery"), allowInRepositoryForTests: true });
  const plan = await engine.plan([
    { path: ["model"], value: "fixture/model", replaceExisting: true },
    { path: ["model_provider"], value: "routero", replaceExisting: true },
    { path: ["model_providers", "routero", "name"], value: "Routero fixture" },
  ]);
  console.log("Redacted preview:", JSON.stringify(plan, null, 2));
  const applied = await engine.apply(plan);
  assert.equal(applied.status, "applied");
  const content = await readFile(file, "utf8");
  await writeFile(file, content.replace('model="fixture/model"', 'model="my-later-choice"') + "\n# A later user comment to preserve.\n");
  const restored = await engine.rollback(applied.changeId!);
  assert.equal(restored.status, "conflict");
  const final = await readFile(file, "utf8");
  assert.ok(final.includes('model="my-later-choice"'));
  assert.ok(final.includes("# A later user comment to preserve."));
  assert.ok(final.includes('[windows]\nsandbox="elevated"'));
  console.log(JSON.stringify({ demonstration: "project-local dummy configuration only", apply: applied.status, rollback: restored.status, preservedLaterEdit: true, conflicts: restored.conflicts, fixtureDirectory: root, liveConfigurationChanged: false, gatewayRequests: 0 }, null, 2));
}

main().catch(() => {
  process.stderr.write("The project-local configuration demo failed. No live Codex configuration was selected.\n");
  process.exitCode = 1;
});
