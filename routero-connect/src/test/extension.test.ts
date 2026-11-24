import { strict as assert } from "node:assert";
import * as vscode from "vscode";
import { relative, isAbsolute } from "node:path";

suite("Routero extension host smoke", () => {
  test("activates and registers the public setup controls without running setup", async () => {
    const extension = vscode.extensions.getExtension("routero-internal.routero-connect");
    assert.ok(extension);
    if (process.env.ROUTERO_TEST_EXTENSIONS_DIR) {
      const path = relative(process.env.ROUTERO_TEST_EXTENSIONS_DIR, extension.extensionPath);
      assert.ok(path && !path.startsWith("..") && !isAbsolute(path), "Expected the actual installed VSIX, not the development source extension");
    }
    await extension.activate();
    assert.equal(extension.isActive, true);
    const commands = await vscode.commands.getCommands(true);
    for (const id of ["connect", "doctor", "testModel", "disconnect", "storeCredential", "stageHelper", "integrationStatus"]) {
      assert.ok(commands.includes("routero." + id));
    }
    assert.equal(extension.packageJSON.capabilities.untrustedWorkspaces.supported, false);
    assert.deepEqual(extension.packageJSON.extensionKind, ["ui"]);
  });

  test("opens the packaged project progress report without invoking a model", async () => {
    await vscode.commands.executeCommand("routero.integrationStatus");
    assert.ok(vscode.window.activeTextEditor?.document.uri.path.endsWith("/compatibility-report.md"));
    assert.ok(vscode.window.activeTextEditor?.document.getText().includes("Phase 7"));
  });
});
