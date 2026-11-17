import * as vscode from "vscode";
import { READINESS_MESSAGE } from "./core";

/** Expose readiness without collecting a key before compatibility is established. */
export function activate(context: vscode.ExtensionContext): void {
  const openStatus = async (): Promise<void> => {
    const report = vscode.Uri.joinPath(context.extensionUri, "compatibility-report.md");
    const document = await vscode.workspace.openTextDocument(report);
    await vscode.window.showTextDocument(document, { preview: true });
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("routero.integrationStatus", openStatus),
    vscode.commands.registerCommand("routero.connect", async () => {
      const action = "View Integration Status";
      const selected = await vscode.window.showInformationMessage(
        `Routero Connect: ${READINESS_MESSAGE}`,
        action,
      );
      if (selected === action) {
        await openStatus();
      }
    }),
  );
}
