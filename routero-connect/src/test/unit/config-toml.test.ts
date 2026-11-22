import { strict as assert } from "node:assert";
import { test } from "node:test";
import { validateChanges } from "../../config/changes";
import { ConfigError } from "../../config/errors";
import { editField, fieldFingerprint, parseDocument, pruneCreatedTables, renderValue, valueFingerprint } from "../../config/toml";

test("TOML editing preserves BOM, CRLF, Unicode, comments, and unrelated values", async () => {
  const source = '\uFEFF# 説明 🚀\r\nmodel = \'old\' # keep inline\r\n[windows]\r\nsandbox = "elevated"\r\n';
  let document = await parseDocument(source);
  document = (await editField(document, ["model"], renderValue("new"))).document;
  assert.equal(document.text, source.replace("'old'", '"new"'));
  document = (await editField(document, ["model_provider"], '"routero"')).document;
  assert.ok(document.text.startsWith('\uFEFF"model_provider" = "routero"\r\n'));
  assert.ok(document.text.includes('[windows]\r\nsandbox = "elevated"\r\n'));
  assert.equal(fieldFingerprint(document, ["model_provider"]), valueFingerprint("routero"));
  assert.equal(fieldFingerprint(document, ["windows", "model_provider"]), undefined);
});

test("existing quoted/dotted fields and inline values are edited without rewriting their surroundings", async () => {
  const source = '["model_providers"."routero"]\n"name" = "old" # note\nauth = {command="old-path", args=["keep"]}\n';
  const document = await parseDocument(source);
  const edited = (await editField(document, ["model_providers", "routero", "auth", "command"], '"new-path"')).document;
  assert.equal(edited.text, source.replace('"old-path"', '"new-path"'));
  await assert.rejects(editField(edited, ["model_providers", "routero", "auth", "timeout_ms"], "5000"), (error: unknown) => error instanceof ConfigError && error.code === "unsupported-layout");
});

test("new nested fields create correct tables without duplicating existing ones", async () => {
  let document = await parseDocument('[windows]\nsandbox="elevated"\n[model_providers.routero]\nname="Routero" # keep\n');
  document = (await editField(document, ["model_providers", "routero", "base_url"], '"https://api.example/v1"')).document;
  const result = await editField(document, ["model_providers", "routero", "auth", "command"], '"C:\\\\helper.exe"');
  assert.deepEqual(result.createdTables, [["model_providers", "routero", "auth"]]);
  assert.equal(fieldFingerprint(result.document, ["model_providers", "routero", "base_url"]), valueFingerprint("https://api.example/v1"));
  assert.equal(result.document.ast.body[0].body.filter((entry) => entry.type === "TOMLTable").length, 3);
});

test("inline/dotted table redefinitions fail closed instead of emitting invalid TOML", async () => {
  const source = 'model_providers.routero = { name="old" }\n';
  await assert.rejects(editField(await parseDocument(source), ["model_providers", "routero", "base_url"], '"https://api.example/v1"'), ConfigError);
  assert.equal(source, 'model_providers.routero = { name="old" }\n');
  const array = await parseDocument('[[model_providers.routero]]\nname="old"\n');
  await assert.rejects(editField(array, ["model_providers", "routero", "name"], '"new"'), ConfigError);
});

test("field removal and owned empty-table pruning preserve comments", async () => {
  const result = await editField(await parseDocument("# original\n"), ["model_providers", "routero", "name"], '"Routero"');
  const applied = result.document;
  const withComment = await parseDocument(applied.text.replace('"name" = "Routero"', '"name" = "Routero" # later note'));
  const removed = (await editField(withComment, ["model_providers", "routero", "name"], undefined)).document;
  const cleaned = await pruneCreatedTables(removed, applied, result.createdTables);
  assert.ok(cleaned.text.includes("# original"));
  assert.ok(cleaned.text.includes("# later note"));
  assert.equal(cleaned.tables.size, 0);
});

test("large integers, dates, arrays, and prototype-like unrelated keys are not materialized or changed", async () => {
  const source = 'huge=9223372036854775807\nwhen=1979-05-27T07:32:00-08:00\n__proto__={safe="yes"}\nconstructor="literal"\n[[unrelated]]\nvalue=[1,2]\n';
  const edited = (await editField(await parseDocument(source), ["model"], '"example/model"')).document;
  assert.ok(edited.text.endsWith(source));
  assert.equal(({} as Record<string, unknown>).safe, undefined);
});

test("duplicate tables and malformed TOML produce sanitized locations, not source excerpts", async () => {
  for (const text of ['[windows]\n[windows]\n', 'model="private-unclosed\n', 'x=1\nx=2\n']) {
    await assert.rejects(parseDocument(text), (error: unknown) => {
      assert.ok(error instanceof ConfigError);
      assert.equal(error.code, "invalid-toml");
      assert.ok(!error.message.includes("private"));
      return true;
    });
  }
});

test("only intended Routero fields are writable and new keys cannot enter configuration", () => {
  for (const path of [["sandbox_mode"], ["approval_policy"], ["mcp_servers", "a", "url"], ["model_providers", "other", "name"], ["model_providers", "routero", "experimental_bearer_token"]]) {
    assert.throws(() => validateChanges([{ path, value: "unsafe" }]), ConfigError);
  }
  for (const value of ["sk-test-not-a-real-secret", "Bearer private", "bad\nvalue"]) {
    assert.throws(() => validateChanges([{ path: ["model"], value }]), ConfigError);
  }
  assert.throws(() => validateChanges([{ path: ["model_providers", "routero", "env_key"], value: "OPENAI_API_KEY" }]), ConfigError);
  assert.doesNotThrow(() => validateChanges([{ path: ["model_providers", "routero", "env_key"], value: undefined, replaceExisting: true }]));
  assert.throws(() => validateChanges([{ path: ["model"], value: "a" }, { path: ["model"], value: "b" }]), ConfigError);
});
