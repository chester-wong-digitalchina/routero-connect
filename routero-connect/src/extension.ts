import * as vscode from "vscode";
import { join } from "node:path";
import { bundledCatalog } from "./cli/codex";
import { NodeCliRunner } from "./ui/cli-runner";
import { SetupController } from "./ui/controller";
import { VscodeSetupUi } from "./ui/vscode-ui";

/** Activation registers controls only: no credential/network/configuration work. */
export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("Routero Connect");
  const ui = new VscodeSetupUi(context, output);
  const controller = new SetupController(ui, new NodeCliRunner(join(context.extensionPath, "dist", "cli.js")), bundledCatalog());
  const openStatus = async (): Promise<void> => {
    const report = vscode.Uri.joinPath(context.extensionUri, "compatibility-report.md");
    const document = await vscode.workspace.openTextDocument(report);
    await vscode.window.showTextDocument(document, { preview: true });
  };

  context.subscriptions.push(output,
    vscode.commands.registerCommand("routero.integrationStatus", openStatus),
    ...([
      ["routero.connect", "connect"], ["routero.doctor", "doctor"], ["routero.testModel", "test"],
      ["routero.disconnect", "disconnect"], ["routero.storeCredential", "credential"], ["routero.stageHelper", "helper"],
    ] as const).map(([command, action]) => vscode.commands.registerCommand(command, async () => {
      if (process.platform !== "win32" || vscode.env.remoteName || !vscode.workspace.isTrusted) {
        ui.notify("Routero setup currently requires local Windows and a trusted workspace. Remote, WSL, container, and other platforms are unverified. No setup was performed.", true);
        return;
      }
      await controller.perform(action);
    })),
  );
}
