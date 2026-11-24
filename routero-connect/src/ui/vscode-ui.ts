import * as vscode from "vscode";
import { isAbsolute } from "node:path";
import { redactDetails, redactText } from "../core/diagnostics";
import { validChangeId } from "../config/history";
import type { Choice, RecoveryRecord, SetupUi } from "./controller";

export class VscodeSetupUi implements SetupUi {
  constructor(private readonly context: vscode.ExtensionContext, private readonly output: vscode.OutputChannel) {}

  async pick(title: string, choices: readonly Choice[]): Promise<string | undefined> {
    return (await vscode.window.showQuickPick(choices.map((choice) => ({ ...choice, description: choice.detail })), { title, ignoreFocusOut: true, matchOnDescription: true }))?.id;
  }
  input(title: string, value?: string, password = false): Promise<string | undefined> {
    return Promise.resolve(vscode.window.showInputBox({ title, value, password, ignoreFocusOut: true }));
  }
  async path(title: string, kind: "file" | "config" | "directory"): Promise<string | undefined> {
    if (kind === "config") { return (await vscode.window.showSaveDialog({ title, saveLabel: "Select path (do not save)", filters: { "Codex configuration": ["toml"] } }))?.fsPath; }
    return (await vscode.window.showOpenDialog({ title, canSelectMany: false, canSelectFiles: kind === "file", canSelectFolders: kind === "directory", openLabel: "Select" }))?.[0]?.fsPath;
  }
  async confirm(message: string, action: string): Promise<boolean> { return await vscode.window.showWarningMessage(redactText(message), { modal: true }, action) === action; }
  async preview(text: string): Promise<void> {
    const document = await vscode.workspace.openTextDocument({ language: "json", content: text });
    await vscode.window.showTextDocument(document, { preview: true });
  }
  notify(message: string, warning = false): void {
    if (warning) { void vscode.window.showWarningMessage(redactText(message)); }
    else { void vscode.window.showInformationMessage(redactText(message)); }
  }
  log(value: unknown): void { this.output.appendLine(JSON.stringify(redactDetails(value))); this.output.show(true); }
  progress<T>(title: string, cancellable: boolean, action: (signal: AbortSignal) => Promise<T>): Promise<T> {
    return Promise.resolve(vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title, cancellable }, async (_progress, token) => {
      const controller = new AbortController();
      const listener = token.onCancellationRequested(() => controller.abort());
      try { if (token.isCancellationRequested) { controller.abort(); } return await action(controller.signal); }
      finally { listener.dispose(); }
    }));
  }
  async saveRecovery(record: RecoveryRecord): Promise<void> { await this.context.globalState.update("routero.lastRecovery.v1", record); }
  lastRecovery(): RecoveryRecord | undefined {
    const value = this.context.globalState.get<RecoveryRecord>("routero.lastRecovery.v1");
    if (!value || ![value.node, value.config, value.recovery].every((path) => typeof path === "string" && path.length <= 4096 && isAbsolute(path) && !/[\u0000-\u001f\u007f]|\bsk-/iu.test(path)) || typeof value.changeId !== "string" || !validChangeId(value.changeId)) { return undefined; }
    return value;
  }
}
