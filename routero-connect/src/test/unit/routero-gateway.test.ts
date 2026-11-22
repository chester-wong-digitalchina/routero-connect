import { strict as assert } from "node:assert";
import { test } from "node:test";
import { RouteroGateway } from "../../adapters/codex/gateway";
import { CodexWorkflowError } from "../../adapters/codex/errors";
import { createConnectionProfile, createCredentialReference } from "../../core/profiles";

const profile = createConnectionProfile({ id: "test", name: "Test", apiRoot: "https://fixture.invalid", credential: createCredentialReference("test", "https://fixture.invalid") });
const token = "sk-test-dummy-never-forward-to-logs";
function gateway(response: (url: string, options: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; options: RequestInit }[] = [];
  const fetcher: typeof fetch = async (url, options) => { calls.push({ url: String(url), options: options! }); return response(String(url), options!); };
  return { service: new RouteroGateway(async () => token, fetcher), calls };
}

test("model listing uses one normalized HTTPS endpoint with no redirects or inference", async () => {
  const f = gateway(() => Response.json({ data: [{ id: "fixture/one" }] }));
  assert.deepEqual(await f.service.listModels(profile), ["fixture/one"]);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, "https://fixture.invalid/v1/models");
  assert.equal(f.calls[0].options.method, "GET");
  assert.equal(f.calls[0].options.redirect, "error");
  assert.equal((f.calls[0].options.headers as Record<string, string>).Authorization, `Bearer ${token}`);
});

test("invalid, oversized, secret-bearing, duplicate and malformed lists fail closed", async () => {
  for (const value of [{}, { data: [{ id: token }] }, { data: [{ id: "x" }, { id: "x" }] }, { data: [{ id: "bad\nvalue" }] }]) {
    await assert.rejects(gateway(() => Response.json(value)).service.listModels(profile), CodexWorkflowError);
  }
  await assert.rejects(gateway(() => new Response("{" )).service.listModels(profile), CodexWorkflowError);
  await assert.rejects(gateway(() => new Response("x".repeat(1024 * 1024 + 1))).service.listModels(profile), CodexWorkflowError);
});

test("HTTP failures are categorized without printing bodies or retrying", async () => {
  for (const [status, code] of [[401, "authentication"], [403, "access-denied"], [404, "route-or-model"], [429, "limit-unknown"], [500, "server-failure"]] as const) {
    const f = gateway(() => new Response(token, { status }));
    await assert.rejects(f.service.listModels(profile), (e: unknown) => e instanceof CodexWorkflowError && e.diagnostics[0].code === code && !JSON.stringify(e).includes(token));
    assert.equal(f.calls.length, 1);
  }
});

test("TLS, network and aborted requests have fixed diagnostics and no retry", async () => {
  for (const [cause, expected] of [[{ code: "CERT_HAS_EXPIRED" }, "tls"], [{ code: "ECONNRESET" }, "network"]] as const) {
    const f = gateway(() => { throw Object.assign(new Error(token), { cause }); });
    await assert.rejects(f.service.listModels(profile), (e: unknown) => e instanceof CodexWorkflowError && e.diagnostics[0].code === expected && !e.message.includes(token));
    assert.equal(f.calls.length, 1);
  }
});

test("explicit probe uses fixed text, a token bound, no tools or retries, and cannot approve coding", async () => {
  const f = gateway((url, options) => {
    if (url.endsWith("/models")) { return Response.json({ data: [{ id: "fixture/one" }] }); }
    const body = JSON.parse(options.body as string);
    assert.equal(body.model, "fixture/one");
    assert.equal(body.max_output_tokens, 64);
    assert.equal(body.stream, false);
    assert.equal(body.store, false);
    assert.equal(body.tools, undefined);
    return Response.json({ object: "response", status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "READY" }] }] });
  });
  assert.deepEqual(await f.service.testModel(profile, "fixture/one"), { completed: true, codingCompatibility: "not-tested" });
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[1].url, "https://fixture.invalid/v1/responses");
});

test("probe rejects invisible models and tool/incomplete/plain HTTP-success responses", async () => {
  const absent = gateway(() => Response.json({ data: [] }));
  await assert.rejects(absent.service.testModel(profile, "fixture/one"), CodexWorkflowError);
  assert.equal(absent.calls.length, 1);
  for (const response of [{}, { object: "response", status: "incomplete", output: [] }, { object: "response", status: "completed", output: [{ type: "function_call" }] }]) {
    const f = gateway((url) => Response.json(url.endsWith("/models") ? { data: [{ id: "fixture/one" }] } : response));
    await assert.rejects(f.service.testModel(profile, "fixture/one"), CodexWorkflowError);
    assert.equal(f.calls.length, 2);
  }
});

test("cancellation aborts an in-flight request and stops a pre-cancelled request before credentials", async () => {
  const controller = new AbortController();
  let calls = 0;
  let reads = 0;
  const request: typeof fetch = async (_url, options) => {
    calls++;
    return new Promise((_done, reject) => {
      options!.signal!.addEventListener("abort", () => reject(new Error("cancelled")), { once: true });
      controller.abort();
    });
  };
  const service = new RouteroGateway(async () => { reads++; return token; }, request, controller.signal);
  await assert.rejects(service.listModels(profile), (e: unknown) => e instanceof CodexWorkflowError && e.diagnostics[0].code === "cancelled");
  assert.equal(calls, 1);
  await assert.rejects(service.listModels(profile), CodexWorkflowError);
  assert.equal(calls, 1);
  assert.equal(reads, 1);
});

test("request deadline aborts without retrying or exposing raw transport output", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let entered!: () => void;
  const started = new Promise<void>((done) => { entered = done; });
  let calls = 0;
  const request: typeof fetch = async (_url, options) => {
    calls++;
    return new Promise((_done, reject) => {
      options!.signal!.addEventListener("abort", () => reject(new Error(token)), { once: true });
      entered();
    });
  };
  const pending = new RouteroGateway(async () => token, request).listModels(profile);
  await started;
  context.mock.timers.tick(15000);
  await assert.rejects(pending, (e: unknown) => e instanceof CodexWorkflowError && e.diagnostics[0].code === "timeout" && !JSON.stringify(e).includes(token));
  assert.equal(calls, 1);
});
