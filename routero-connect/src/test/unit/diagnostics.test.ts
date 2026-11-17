import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createDiagnostic, httpDiagnostic, redactDetails, redactText, transportDiagnostic } from "../../core/diagnostics";

test("redaction covers explicit secrets, bearer tokens, and Routero-style keys", () => {
  const value = redactText("private-fragment Bearer other-token sk-test-not-a-real-key", ["private-fragment", ""]);
  for (const secret of ["private-fragment", "other-token", "sk-test-not-a-real-key"]) {
    assert.ok(!value.includes(secret));
  }
});

test("redaction removes URL credentials, queries, and fragments", () => {
  const value = redactText("https://user:password@api.example/v1 https://api.example/v1?key=hidden#secret");
  for (const secret of ["user", "password", "hidden", "secret"]) {
    assert.ok(!value.includes(secret));
  }
});

test("common credential assignments and Basic authorization are redacted", () => {
  const value = redactText('Authorization: Basic cHJpdmF0ZQ== api_key="hidden value" password=private');
  for (const secret of ["cHJpdmF0ZQ==", "hidden value", "private"]) {
    assert.ok(!value.includes(secret));
  }
});

test("diagnostic details mask secret-bearing fields and handle cycles", () => {
  const details: Record<string, unknown> = { authorization: "Basic private", api_key: "private", nested: [{ message: "private-raw" }], useful: "safe" };
  details.circular = details;
  const sanitized = JSON.stringify(redactDetails(details, ["private-raw"]));
  assert.ok(!sanitized.includes("private"));
  assert.ok(sanitized.includes("safe"));
  assert.ok(sanitized.includes("[OMITTED]"));
});

test("diagnostic factory sanitizes messages, codes, and structured details", () => {
  const diagnostic = createDiagnostic({ category: "protocol", outcome: "failed", code: "private", message: "Error: private", details: { token: "private" } }, ["private"]);
  assert.ok(!JSON.stringify(diagnostic).includes("private"));
  assert.equal(diagnostic.category, "protocol");
});

test("rate and budget limits are distinguished only with backend evidence", () => {
  assert.equal(httpDiagnostic(429).code, "limit-unknown");
  assert.equal(httpDiagnostic(429, "budget-limit").code, "budget-limit");
  assert.equal(httpDiagnostic(429, "rate-limit").code, "rate-limit");
  assert.equal(httpDiagnostic(400).code, "request-rejected");
  assert.equal(httpDiagnostic(404).code, "route-or-model");
  assert.equal(httpDiagnostic(401).code, "authentication");
  assert.equal(httpDiagnostic(403).code, "access-denied");
  assert.equal(httpDiagnostic(503).code, "server-failure");
  assert.equal(httpDiagnostic(200).outcome, "not-run");
});

test("transport failures distinguish TLS, timeout, cancellation, and network", () => {
  for (const reason of ["tls", "timeout", "cancelled", "network"] as const) {
    assert.equal(transportDiagnostic(reason).code, reason);
  }
  assert.match(transportDiagnostic("tls").message, /keep TLS verification enabled/u);
  assert.match(transportDiagnostic("cancelled").message, /Do not retry/u);
});
