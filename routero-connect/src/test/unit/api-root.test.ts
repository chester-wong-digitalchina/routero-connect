import { strict as assert } from "node:assert";
import { test } from "node:test";
import { ApiRootError, normalizeApiRoot } from "../../core/api-root";
import { createConnectionProfile, createCredentialReference } from "../../core/profiles";

test("root and /v1 forms produce identical endpoint URLs", () => {
  const expected = normalizeApiRoot("https://api.routero.ai");
  for (const input of ["https://api.routero.ai/", "https://api.routero.ai/v1", "https://api.routero.ai/v1/", " https://API.ROUTERO.AI:443/v1 "]) {
    assert.deepEqual(normalizeApiRoot(input), expected);
  }
  assert.equal(expected.responses, "https://api.routero.ai/v1/responses");
  assert.equal(expected.models, "https://api.routero.ai/v1/models");
  assert.equal(expected.chatCompletions, "https://api.routero.ai/v1/chat/completions");
});

test("custom HTTPS ports and hosts remain distinct", () => {
  assert.equal(normalizeApiRoot("https://gateway.example:8443/v1").origin, "https://gateway.example:8443");
  assert.equal(normalizeApiRoot("https://[::1]:8443").responses, "https://[::1]:8443/v1/responses");
});

test("invalid roots are rejected before URL normalization can conceal paths", () => {
  for (const input of [
    "", "http://api.example", "file:///etc/passwd", "https://", "api.example",
    "https://api.example/v1/v1", "https://api.example/v1/models", "https://api.example//",
    "https://api.example/./v1", "https://api.example/a/../v1", "https://api.example/%76%31",
    "https://api.example/V1", "https://user:password@api.example", "https://@api.example",
    "https://api.example?", "https://api.example#", "https://api.example/v1?token=private",
    "https://api.example\\v1", "https://api.example/v1\n", "https://api.example:99999",
    "https://sk-test-dummy-key.example",
    "https://%73%6b-test-dummy-key.example",
  ]) {
    assert.throws(() => normalizeApiRoot(input), ApiRootError, input);
  }
});

test("invalid URLs do not echo embedded credentials", () => {
  assert.throws(() => normalizeApiRoot("https://private-user:private-value@api.example"), (error: unknown) => {
    assert.ok(error instanceof ApiRootError);
    assert.ok(!error.message.includes("private"));
    return true;
  });
});

test("profiles contain only an origin-bound credential reference", () => {
  const credential = createCredentialReference("uat-key", "https://api-uat.routero.ai/v1");
  const profile = createConnectionProfile({ id: "uat", name: " UAT ", apiRoot: "https://api-uat.routero.ai", credential });
  assert.equal(profile.name, "UAT");
  assert.deepEqual(profile.credential, { id: "uat-key", origin: "https://api-uat.routero.ai" });
  assert.ok(Object.isFrozen(profile));
  assert.ok(Object.isFrozen(profile.credential));
});

test("changing domains or ports requires a different credential reference", () => {
  const credential = createCredentialReference("uat-key", "https://api-uat.routero.ai");
  for (const apiRoot of ["https://api.routero.ai", "https://api-uat.routero.ai:8443", "https://custom.example"]) {
    assert.throws(() => createConnectionProfile({ id: "other", name: "Other", apiRoot, credential }), /different origin/u);
  }
});

test("profile names and identifiers cannot masquerade as credential storage", () => {
  assert.throws(() => createCredentialReference("sk-test-dummy-key", "https://api.example"));
  assert.throws(() => createConnectionProfile({ id: "p", name: "sk-test-dummy-key", apiRoot: "https://api.example", credential: { id: "ref", origin: "https://api.example" } }));
  assert.throws(() => createCredentialReference("invalid reference\n", "https://api.example"));
});
