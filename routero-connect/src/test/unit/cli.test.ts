import { strict as assert } from "node:assert";
import { test } from "node:test";
import { runCli } from "../../cli/run";

function invoke(args: readonly string[]) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCode = runCli(args, { stdout: (text) => stdout.push(text), stderr: (text) => stderr.push(text) });
  return { exitCode, stdout: stdout.join("\n"), stderr: stderr.join("\n") };
}

test("CLI help and status are honest about unavailable setup", () => {
  assert.equal(invoke([]).exitCode, 0);
  assert.match(invoke(["--help"]).stdout, /bare doctor, and validate-url make no network requests/u);
  assert.match(invoke(["status"]).stdout, /not yet verified/u);
});

test("URL command returns normalized endpoints without running a request", () => {
  const result = invoke(["validate-url", "https://api.example/v1/"]);
  assert.equal(result.exitCode, 0);
  assert.equal(JSON.parse(result.stdout).responses, "https://api.example/v1/responses");
});

test("rejected CLI input is never echoed", () => {
  for (const args of [["validate-url", "https://private:secret@api.example"], ["connect", "private-secret"], ["validate-url"], ["doctor", "private-secret"]]) {
    const result = invoke(args);
    assert.equal(result.exitCode, 2);
    assert.ok(!(result.stdout + result.stderr).includes("private"));
    assert.ok(!(result.stdout + result.stderr).includes("secret@"));
  }
});

test("offline doctor separates all diagnostic levels and does not imply a pass", () => {
  const result = invoke(["doctor"]);
  assert.equal(result.exitCode, 1);
  const report = JSON.parse(result.stdout) as { scope: string; diagnostics: { category: string; outcome: string }[] };
  assert.equal(report.scope, "offline-project-readiness");
  assert.deepEqual(report.diagnostics.map((d) => d.category), ["configuration", "connectivity", "model-list", "protocol", "real-client"]);
  assert.ok(report.diagnostics.every((d) => d.outcome !== "passed"));
});
