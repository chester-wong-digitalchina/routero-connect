import Mocha from "mocha";
import { join } from "node:path";

/** Entry point for the installed-VSIX smoke test, not the development extension. */
export async function run(): Promise<void> {
  const mocha = new Mocha({ ui: "tdd", timeout: 15000 });
  mocha.addFile(join(__dirname, "extension.test.js"));
  await new Promise<void>((done, reject) => mocha.run((failures) => failures ? reject(new Error("Installed extension smoke failed.")) : done()));
}
