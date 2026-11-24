import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { normalizeApiRoot } from "../core/api-root";
import { evaluateActivation, type CompatibilityCatalog } from "../core/compatibility";
import { createConnectionProfile, createCredentialReference } from "../core/profiles";
import { redactDetails, redactText } from "../core/diagnostics";
import { validateSecret } from "../credentials/service";
import { validChangeId } from "../config/history";
import { COST_NOTICE } from "../cli/codex";
import { type CliRunner, type CliReply, UiError } from "./cli-runner";
import { CODEX_CLI_VERSIONS } from "../core/codex-versions";
import { CODING_VALIDATION_NOTICE, evaluateCodingValidation } from "../core/coding-validation";

export interface Choice { readonly id: string; readonly label: string; readonly detail?: string; }
export interface SetupPaths { readonly node: string; readonly codex: string; readonly config: string; readonly recovery: string; readonly helper: string; readonly origin: string; readonly profile: string; readonly reference: string; }
export interface RecoveryRecord { readonly node: string; readonly config: string; readonly recovery: string; readonly changeId: string; }
type CredentialSelection = Pick<SetupPaths, "node" | "origin" | "profile" | "reference">;
export interface SetupUi {
  pick(title: string, choices: readonly Choice[]): Promise<string | undefined>;
  input(title: string, value?: string, password?: boolean): Promise<string | undefined>;
  path(title: string, kind: "file" | "config" | "directory"): Promise<string | undefined>;
  confirm(message: string, action: string): Promise<boolean>;
  preview(text: string): Promise<void>;
  notify(message: string, warning?: boolean): void;
  log(value: unknown): void;
  progress<T>(title: string, cancellable: boolean, action: (signal: AbortSignal) => Promise<T>): Promise<T>;
  saveRecovery(record: RecoveryRecord): Promise<void>;
  lastRecovery(): RecoveryRecord | undefined;
}

class Cancelled extends Error {}
function required(value: string | undefined): string { if (value === undefined) { throw new Cancelled(); } return value; }
function absolute(value: string): string {
  if (!isAbsolute(value) || /[\u0000-\u001f\u007f]|\bsk-/iu.test(value)) { throw new UiError("Use an absolute local path without credentials or control characters."); }
  return value;
}
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) { throw new UiError("The CLI reply did not match the expected workflow response."); } return value as Record<string, unknown>; }

/** Testable orchestration; all filesystem/credential writes stay in the shared CLI. */
export class SetupController {
  private busy = false;
  private paths?: SetupPaths;
  constructor(private readonly ui: SetupUi, private readonly runner: CliRunner, private readonly catalog: CompatibilityCatalog) {}

  async perform(action: "connect" | "doctor" | "test" | "disconnect" | "credential" | "helper"): Promise<void> {
    if (this.busy) { this.ui.notify("Another Routero setup operation is still running.", true); return; }
    this.busy = true;
    try { await this[action](); }
    catch (error) {
      if (error instanceof Cancelled) { this.ui.notify("Setup cancelled. No later steps were run."); }
      else {
        // Raw exceptions can contain entered secrets, arguments, and process output.
        const message = error instanceof UiError ? error.message : "The operation could not finish. Review the selected paths, credentials, compatibility report, and recovery records before retrying.";
        this.ui.log({ outcome: "failed", message: redactText(message) });
        this.ui.notify(redactText(message), true);
      }
    } finally { this.busy = false; }
  }

  private async settings(validationRoot?: string): Promise<SetupPaths> {
    if (this.paths && (!validationRoot || this.paths.config === join(validationRoot, "codex-home", "config.toml")) && await this.ui.confirm("Reuse the setup paths and credential reference selected earlier in this window? No key value is remembered.", "Reuse selection")) { return this.paths; }
    const node = absolute(required(await this.ui.path("Select Node.js 24.18+ node.exe (not Code.exe)", "file")));
    const codex = absolute(required(await this.ui.path(`Select Codex CLI codex.exe (inspected versions: ${CODEX_CLI_VERSIONS.join(", ")})`, "file")));
    const config = validationRoot ? join(validationRoot, "codex-home", "config.toml") : absolute(required(await this.ui.path("Select the Codex config.toml to review; this dialog does not save it", "config")));
    if (!/[\\/]config\.toml$/u.test(config)) { throw new UiError("Select a file named config.toml. Its parent directory must already exist."); }
    const helper = absolute(required(await this.ui.path("Select an existing private Routero helper directory", "directory")));
    const recovery = absolute(required(await this.ui.input("Private recovery directory outside Git (created only during apply)")));
    if (dirname(config) === recovery) { throw new UiError("Keep recovery separate from the configuration directory."); }
    this.paths = Object.freeze({ node, codex, config, helper, recovery, ...await this.identity() });
    if (validationRoot && this.paths.origin !== "https://api-uat.routero.ai") { this.paths = undefined; throw new UiError("This isolated validation record applies to Routero UAT only. No key was read and no settings changed."); }
    return this.paths;
  }

  private async identity(): Promise<Omit<CredentialSelection, "node">> {
    const originChoice = required(await this.ui.pick("Routero environment (keys are never reused across origins)", [
      { id: "uat", label: "Routero UAT", detail: "https://api-uat.routero.ai" }, { id: "custom", label: "Enter another HTTPS API root", detail: "Requires its own credential and compatibility evidence" },
    ]));
    const origin = normalizeApiRoot(originChoice === "uat" ? "https://api-uat.routero.ai" : required(await this.ui.input("HTTPS API root; no key, username, query, or fragment"))).origin;
    const profile = required(await this.ui.input("Non-secret owning profile ID", "uat"));
    const reference = required(await this.ui.input("Non-secret credential reference ID", profile));
    createConnectionProfile({ id: profile, name: profile, apiRoot: origin, credential: createCredentialReference(reference, origin) });
    return { origin, profile, reference };
  }

  private profileArgs(paths: CredentialSelection): string[] { return ["--profile", paths.profile, "--api-root", paths.origin, "--credential-ref", paths.reference]; }
  private pathArgs(paths: SetupPaths): string[] { return ["--config", paths.config, "--recovery", paths.recovery, "--codex", paths.codex, "--helper", paths.helper]; }
  private async call(paths: Pick<SetupPaths, "node">, args: string[], cancellable = false, secret?: string): Promise<CliReply> {
    const reply = await this.ui.progress("Routero: " + args[0], cancellable, (signal) => this.runner.run(paths.node, args, { ...(cancellable ? { signal } : {}), ...(secret ? { secret } : {}) }));
    for (const message of reply.messages) { this.ui.log(redactDetails(message)); }
    return reply;
  }
  private ensure(reply: CliReply): void {
    if (reply.code === 0) { return; }
    for (const message of reply.messages) {
      const candidate = message.diagnostic;
      if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
        const diagnostic = candidate as Record<string, unknown>;
        if (typeof diagnostic.code === "string" && /^[a-z0-9-]{1,80}$/u.test(diagnostic.code) && typeof diagnostic.message === "string") {
          throw new UiError(`${diagnostic.code}: ${redactText(diagnostic.message).slice(0, 600)} Review the redacted output; check recovery before retrying.`);
        }
      }
    }
    throw new UiError("The CLI rejected the operation. Review the redacted Routero output and compatibility report; check recovery before retrying.");
  }

  private async connect(): Promise<void> {
    const target = required(await this.ui.pick("Which Codex interface?", [
      { id: "cli", label: "Codex CLI on Windows", detail: "Setup is gated on versioned coding evidence" },
      { id: "ide", label: "Codex VS Code interface — not validated", detail: "CLI results do not establish IDE support" },
    ]));
    if (target !== "cli") { this.ui.notify("The Codex IDE adapter and separate IDE coding acceptance are still pending. No settings changed.", true); return; }
    const candidates = this.catalog.records.filter((row) => row.client === "codex-cli" && CODEX_CLI_VERSIONS.some((clientVersion) => evaluateActivation(this.catalog, { modelId: row.modelId, client: "codex-cli", clientVersion, protocol: "responses", apiRoot: row.origin, visibleModelIds: [row.modelId], allowExperimental: true }).allowed));
    const validation = evaluateCodingValidation(this.catalog, { modelId: "openai/gpt-6-luna", client: "codex-cli", clientVersion: "0.172.0", protocol: "responses", apiRoot: "https://api-uat.routero.ai", visibleModelIds: ["openai/gpt-6-luna"] }).allowed;
    if (!candidates.length && !validation) { this.ui.notify("No Codex model is yet approved for automatic setup or isolated validation in this build. No key was requested and no settings changed.", true); return; }
    const choices: Choice[] = candidates.length ? [{ id: "verified", label: "Verified models only" }, { id: "experimental", label: "Include experimental models", detail: "Normal capability/metadata requirements remain enforced" }] : [];
    if (validation) { choices.push({ id: "validation", label: "Isolated coding validation — GPT-6 Luna / Codex 0.172.0", detail: "Basic coding loop passed; exact limits and full plugin lifecycle remain unverified" }); }
    const experimental = await this.ui.pick("Model support level", choices);
    if (!experimental) { throw new Cancelled(); }
    let validationRoot: string | undefined;
    if (experimental === "validation") {
      if (!validation || !await this.ui.confirm(CODING_VALIDATION_NOTICE, "Continue isolated validation")) { return; }
      validationRoot = resolve(absolute(required(await this.ui.path("Select the dedicated codex-plugin-validation directory (create its codex-home child first)", "directory"))));
      if (basename(validationRoot) !== "codex-plugin-validation") { throw new UiError("Select a dedicated directory named codex-plugin-validation. The normal Codex home is not an allowed target."); }
    }
    const paths = await this.settings(validationRoot);
    const flags = validationRoot ? ["--isolated-validation", "--validation-root", validationRoot] : experimental === "experimental" ? ["--allow-experimental"] : [];
    if (!await this.ui.confirm(`List the selected credential's model access at ${paths.origin}? This reads Windows Credential Manager and sends one model-list request, without inference.`, "List models")) { return; }
    const listed = await this.call(paths, ["models", "--codex", paths.codex, ...this.profileArgs(paths), ...flags], true);
    this.ensure(listed);
    const models = this.models(listed);
    const selected = required(await this.ui.pick("Select a key-visible Codex model", models.map((row) => ({ id: row.modelId, label: `${row.modelId} — ${row.status}`, detail: row.allowed ? "Available for reviewed setup" : `Unavailable: ${row.reason}` }))));
    const model = models.find((row) => row.modelId === selected);
    if (!model?.allowed) { this.ui.notify("This combination is not approved. Existing settings and credentials were preserved.", true); return; }
    const replace = await this.ui.pick("Existing managed settings", [{ id: "preserve", label: "Preserve existing values; report conflicts" }, { id: "replace", label: "Allow replacing reviewed Routero/model fields", detail: "Unrelated settings and login files remain untouched" }]);
    if (!replace) { throw new Cancelled(); }
    const args = ["connect", ...this.pathArgs(paths), ...this.profileArgs(paths), "--model", selected, ...flags, ...(replace === "replace" ? ["--replace-existing"] : [])];
    const planned = await this.call(paths, args, true);
    const planMessage = planned.messages.find((item) => item.scope === "connection-preview");
    if (planMessage) { await this.ui.preview(JSON.stringify(planMessage, null, 2)); }
    this.ensure(planned);
    const plan = object(planMessage?.plan);
    const files = plan.files;
    if (!Array.isArray(files) || files.length !== 1 || !Array.isArray(plan.conflicts) || plan.conflicts.length) { throw new UiError("Resolve the preview conflicts before applying; no settings were changed."); }
    const revision = object(files[0]).expectedRevision;
    if (typeof revision !== "string" || !/^(?:absent|[a-f0-9]{64})$/u.test(revision)) { throw new UiError(); }
    if (!await this.ui.confirm(`Apply the displayed plan to ${paths.config} for ${paths.origin} / ${selected}? Private recovery will be written to ${paths.recovery}. This changes the selected settings only and does not run a model.`, "Apply reviewed plan")) { return; }
    const applied = await this.call(paths, [...args, "--apply", "--expected-revision", revision]);
    const result = applied.messages.find((item) => typeof item.status === "string");
    if (result && typeof result.changeId === "string" && validChangeId(result.changeId)) {
      const record = { node: paths.node, config: paths.config, recovery: paths.recovery, changeId: result.changeId };
      try { await this.ui.saveRecovery(record); } catch { this.ui.notify("Settings may have changed, but the recovery shortcut could not be saved. Keep the displayed recovery ID and directory.", true); }
      await this.ui.preview(JSON.stringify({ recovery: record, instructions: "Keep this change ID and directory. Restore switches in reverse order using Disconnect or the standalone CLI." }, null, 2));
    }
    this.ensure(applied);
    if (!result || !["applied", "unchanged"].includes(String(result.status))) { throw new UiError(); }
    this.ui.notify(validationRoot ? `Isolated validation settings are configured. In a separate terminal set CODEX_HOME to ${join(validationRoot, "codex-home")} and run codex --no-daemon from a fresh calculator. Keep normal VS Code unchanged; this is not full model or IDE support.` : "Codex CLI settings are configured. Restart that CLI yourself and run the documented coding acceptance task. This does not verify the Codex IDE interface.");
  }

  private models(reply: CliReply): { modelId: string; allowed: boolean; status: string; reason: string }[] {
    const message = reply.messages.find((item) => item.scope === "key-visible-models");
    if (!message || !Array.isArray(message.models)) { throw new UiError("No valid model list was returned."); }
    if (Number(message.total) > Number(message.displayed)) { this.ui.notify("This CLI displays the first 50 visible models. The complete list is not shown.", true); }
    const models = message.models.map((item: unknown) => { const row = object(item); if (typeof row.modelId !== "string" || typeof row.allowed !== "boolean" || typeof row.status !== "string" || typeof row.reason !== "string") { throw new UiError(); } return { modelId: row.modelId, allowed: row.allowed, status: row.status, reason: row.reason }; });
    if (!models.length) { throw new UiError("No models are visible to the selected credential. Ask your gateway administrator to review its policy."); }
    return models;
  }

  private async doctor(): Promise<void> {
    const paths = await this.settings();
    const scope = required(await this.ui.pick("Doctor scope", [{ id: "local", label: "Local checks only", detail: "No key read, network request, or inference" }, { id: "online", label: "Also check key-visible models", detail: "Reads the selected credential and lists models; no inference" }]));
    const result = await this.call(paths, ["doctor", ...this.pathArgs(paths), ...(scope === "online" ? ["--online", ...this.profileArgs(paths)] : [])], true);
    await this.ui.preview(JSON.stringify(result.messages, null, 2));
    this.ui.notify("Doctor report is available. Passing local checks does not establish coding compatibility; the current report remains unverified.", true);
  }

  private async test(): Promise<void> {
    const paths = this.paths ?? { node: absolute(required(await this.ui.path("Select Node.js 24.18+ node.exe", "file"))), codex: absolute(required(await this.ui.path("Select Codex CLI codex.exe", "file"))), ...await this.identity() };
    if (!await this.ui.confirm(`List models for ${paths.origin} using the selected stored credential? No inference yet.`, "List models")) { return; }
    const listed = await this.call(paths, ["models", "--codex", paths.codex, ...this.profileArgs(paths)], true);
    this.ensure(listed);
    const models = this.models(listed);
    const model = required(await this.ui.pick("Select a model for a text-only test (not coding approval)", models.map((row) => ({ id: row.modelId, label: row.modelId, detail: `${row.status}: ${row.reason}` }))));
    if (!await this.ui.confirm(`${COST_NOTICE}\nOrigin: ${paths.origin}\nModel: ${model}`, "Run one paid text test")) { return; }
    const reply = await this.call(paths, ["test-model", ...this.profileArgs(paths), "--model", model, "--confirm-cost"], true);
    this.ensure(reply);
    this.ui.notify("The text probe completed. Tool use, editing, test execution, and coding compatibility have not been verified.");
  }

  private async credential(): Promise<void> {
    const paths: CredentialSelection = this.paths ?? { node: absolute(required(await this.ui.path("Select Node.js 24.18+ node.exe", "file"))), ...await this.identity() };
    let secret: string | undefined = required(await this.ui.input("Routero key for the selected origin (hidden; never copied to clipboard)", undefined, true));
    try {
      validateSecret(secret);
      if (!await this.ui.confirm(`Store this key in Windows Credential Manager for ${paths.origin}, owner ${paths.profile}, reference ${paths.reference}? It remains stored even if no compatible model is available. Existing entries are not replaced.`, "Store key")) { return; }
      const reply = await this.call(paths, ["credential", "store", ...this.profileArgs(paths)], false, secret);
      this.ensure(reply);
      this.ui.notify("The key was stored for the selected origin. No Codex settings were changed. Use the standalone CLI for explicit replacement, sharing, or deletion.");
    } finally { secret = undefined; } // Managed-runtime strings cannot be reliably erased.
  }

  private async helper(): Promise<void> {
    const node = absolute(required(await this.ui.path("Select Node.js 24.18+ node.exe", "file")));
    const destination = absolute(required(await this.ui.input("New private helper directory; use a stable path independent of extension versions")));
    if (!await this.ui.confirm(`Create a new pinned helper under ${destination}? This writes outside the extension when you choose such a path. Existing installations are not overwritten; no runtime is downloaded.`, "Create helper")) { return; }
    this.ensure(await this.call({ node }, ["helper", "stage", "--destination", destination]));
    this.ui.notify("Helper staged. Keep Node installed at its recorded path. New helper versions still need native acceptance before release.");
  }

  private async disconnect(): Promise<void> {
    const last = this.ui.lastRecovery();
    const node = last?.node ?? absolute(required(await this.ui.path("Select Node.js 24.18+ node.exe for recovery", "file")));
    const config = absolute(required(await this.ui.input("Configuration file to restore", last?.config)));
    const recovery = absolute(required(await this.ui.input("Private recovery directory", last?.recovery)));
    const changeId = required(await this.ui.input("Change ID to restore (restore switches in reverse order)", last?.changeId));
    if (!validChangeId(changeId)) { throw new UiError("Enter a valid recovery transaction UUID."); }
    const args = ["disconnect", "--config", config, "--recovery", recovery, "--change-id", changeId];
    const preview = await this.call({ node }, args);
    this.ensure(preview);
    await this.ui.preview(JSON.stringify(preview.messages, null, 2));
    if (!await this.ui.confirm(`Restore unchanged managed fields for transaction ${changeId}? Later edits, keys, and helpers will be retained. Conflicts can mean partial restoration. Restart only after reviewing the result.`, "Restore transaction")) { return; }
    const reply = await this.call({ node }, [...args, "--apply"]);
    this.ensure(reply);
    this.ui.notify("Transaction restored. Review the result and restart Codex yourself. Other switch transactions may still need restoration; keys and helpers were retained.");
  }
}
