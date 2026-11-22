import type { ConnectionProfile } from "../../core/profiles";
import { httpDiagnostic, transportDiagnostic } from "../../core/diagnostics";
import { CodexWorkflowError } from "./errors";

export interface GatewayAccess {
  listModels(profile: ConnectionProfile): Promise<readonly string[]>;
  testModel(profile: ConnectionProfile, modelId: string): Promise<{ readonly completed: true; readonly codingCompatibility: "not-tested" }>;
}

/** No redirects, retries, raw error bodies, prompt logging, or ambient credentials. */
export class RouteroGateway implements GatewayAccess {
  constructor(private readonly readCredential: (profile: ConnectionProfile) => Promise<string>, private readonly request: typeof fetch = fetch, private readonly signal?: AbortSignal) {}

  private async json(profile: ConnectionProfile, probe?: string): Promise<unknown> {
    if (this.signal?.aborted) { throw new CodexWorkflowError("workflow-failed", [transportDiagnostic("cancelled")]); }
    const token = await this.readCredential(profile);
    const controller = new AbortController();
    const cancel = () => controller.abort();
    this.signal?.addEventListener("abort", cancel, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
    try {
      if (this.signal?.aborted) { throw new CodexWorkflowError("workflow-failed", [transportDiagnostic("cancelled")]); }
      const response = await this.request(probe ? profile.api.responses : profile.api.models, {
        method: probe ? "POST" : "GET", redirect: "error", signal: controller.signal,
        headers: { Authorization: `Bearer ${token}`, ...(probe ? { "Content-Type": "application/json" } : {}) },
        ...(probe ? { body: JSON.stringify({ model: probe, input: "Reply with exactly READY. Do not use tools.", max_output_tokens: 64, stream: false, store: false }) } : {}),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new CodexWorkflowError("workflow-failed", [httpDiagnostic(response.status)]);
      }
      if (!response.body) { throw new CodexWorkflowError("model-list-invalid"); }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) { break; }
          size += value.length;
          if (size > 1024 * 1024) { controller.abort(); throw new CodexWorkflowError("model-list-invalid"); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))); }
      catch { throw new CodexWorkflowError(probe ? "probe-invalid" : "model-list-invalid"); }
    } catch (error) {
      if (error instanceof CodexWorkflowError) { throw error; }
      const cause = error as { cause?: { code?: string } };
      const tls = /CERT|TLS|SSL/u.test(cause?.cause?.code ?? "");
      throw new CodexWorkflowError("workflow-failed", [transportDiagnostic(timedOut ? "timeout" : controller.signal.aborted ? "cancelled" : tls ? "tls" : "network")]);
    } finally { clearTimeout(timer); this.signal?.removeEventListener("abort", cancel); }
  }

  async listModels(profile: ConnectionProfile): Promise<readonly string[]> {
    const result = await this.json(profile) as { data?: unknown };
    if (!result || !Array.isArray(result.data) || result.data.length > 4096) { throw new CodexWorkflowError("model-list-invalid"); }
    const ids = result.data.map((item: unknown) => {
      const id = (item as { id?: unknown })?.id;
      if (typeof id !== "string" || !/^[a-z0-9][a-z0-9/_.:-]{0,199}$/iu.test(id) || /\bsk-/iu.test(id)) { throw new CodexWorkflowError("model-list-invalid"); }
      return id;
    });
    if (new Set(ids).size !== ids.length) { throw new CodexWorkflowError("model-list-invalid"); }
    return Object.freeze(ids);
  }

  async testModel(profile: ConnectionProfile, modelId: string) {
    if (!(await this.listModels(profile)).includes(modelId)) { throw new CodexWorkflowError("compatibility-blocked"); }
    const result = await this.json(profile, modelId) as { object?: unknown; status?: unknown; output?: unknown };
    if (!result || result.object !== "response" || result.status !== "completed" || !Array.isArray(result.output)
      || result.output.length !== 1) { throw new CodexWorkflowError("probe-invalid"); }
    const message = result.output[0] as { type?: unknown; role?: unknown; content?: unknown };
    if (message?.type !== "message" || message.role !== "assistant" || !Array.isArray(message.content) || message.content.length !== 1
      || message.content[0]?.type !== "output_text" || message.content[0]?.text !== "READY") { throw new CodexWorkflowError("probe-invalid"); }
    return { completed: true as const, codingCompatibility: "not-tested" as const };
  }
}
