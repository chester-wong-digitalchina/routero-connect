// Installs ONLY into project-local test directories; no model/credential setup.
const { downloadAndUnzipVSCode, runTests } = require('@vscode/test-electron');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { createHash } = require('node:crypto');
const { mkdir, readFile, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { audit } = require('./package-internal.cjs');

async function main() {
  if (process.platform !== 'win32') { throw new Error('Installed VSIX smoke currently requires Windows.'); }
  const root = path.resolve(__dirname, '..');
  const work = path.join(root, 'tmp', 'validation', 'phase-7-installed');
  const artifact = JSON.parse(await readFile(path.join(root, 'dist', 'internal-artifacts.json'), 'utf8'));
  const version = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version;
  if (artifact.version !== version || path.basename(artifact.vsix.file) !== artifact.vsix.file) { throw new Error('Package/version mismatch.'); }
  const vsix = path.join(root, 'dist', artifact.vsix.file);
  if (createHash('sha256').update(await readFile(vsix)).digest('hex') !== artifact.vsix.sha256) { throw new Error('Artifact hash mismatch.'); }
  await audit(vsix);
  for (const name of ['user-data/User', 'extensions', 'profile', 'appdata', 'localappdata', 'temp', 'harness']) { await mkdir(path.join(work, name), { recursive: true }); }
  await writeFile(path.join(work, 'user-data', 'User', 'settings.json'), JSON.stringify({ 'chat.disableAIFeatures': true, 'telemetry.telemetryLevel': 'off', 'extensions.ignoreRecommendations': true, 'workbench.startupEditor': 'none', 'update.mode': 'none' }));
  await writeFile(path.join(work, 'harness', 'package.json'), JSON.stringify({ name: 'routero-smoke-harness', publisher: 'routero-internal', version: '0.0.1', engines: { vscode: '^1.146.0' }, main: './main.js' }));
  await writeFile(path.join(work, 'harness', 'main.js'), 'exports.activate = () => {};\n');
  const env = { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, USERPROFILE: path.join(work, 'profile'), APPDATA: path.join(work, 'appdata'), LOCALAPPDATA: path.join(work, 'localappdata'), TEMP: path.join(work, 'temp'), TMP: path.join(work, 'temp') };
  const exe = await downloadAndUnzipVSCode({ version: '1.146.0', cachePath: path.join(root, '.vscode-test') });
  const flags = ['--user-data-dir=' + path.join(work, 'user-data'), '--extensions-dir=' + path.join(work, 'extensions')];
  const run = promisify(execFile);
  // New Windows builds keep app resources under a versioned directory. Read the
  // official launcher for its fixed module path, without executing a .cmd shell.
  const launcher = await readFile(path.join(path.dirname(exe), 'bin', 'code.cmd'), 'utf8');
  const modulePath = /"%~dp0([a-z0-9\\/_.-]*resources\\app\\out\\cli\.js)"/iu.exec(launcher)?.[1];
  if (!modulePath) { throw new Error('Cannot resolve the official VS Code CLI module.'); }
  const cli = path.resolve(path.dirname(exe), 'bin', modulePath);
  const relativeCli = path.relative(path.dirname(exe), cli);
  if (relativeCli.startsWith('..') || path.isAbsolute(relativeCli)) { throw new Error('CLI module escaped test installation.'); }
  const installed = await run(exe, [cli, ...flags, '--install-extension', vsix, '--force'], { cwd: work, env: { ...env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, timeout: 60000, maxBuffer: 1024 * 1024 });
  await writeFile(path.join(work, 'install.log'), installed.stdout + installed.stderr);
  const listed = await run(exe, [cli, ...flags, '--list-extensions', '--show-versions'], { cwd: work, env: { ...env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, timeout: 30000 });
  if (!listed.stdout.includes('routero-internal.routero-connect@' + version)) { throw new Error('VSIX not listed in isolated installation.'); }
  await runTests({ vscodeExecutablePath: exe, extensionDevelopmentPath: path.join(work, 'harness'), extensionTestsPath: path.join(root, 'out', 'test', 'installed-host.js'), launchArgs: [...flags, '--disable-telemetry', '--disable-updates', '--skip-welcome', '--skip-release-notes'], extensionTestsEnv: { ...env, ROUTERO_TEST_EXTENSIONS_DIR: path.join(work, 'extensions'), ELECTRON_RUN_AS_NODE: undefined, VSCODE_CLI: undefined, VSCODE_PID: undefined, VSCODE_IPC_HOOK_CLI: undefined, NODE_OPTIONS: undefined, NODE_PATH: undefined, OPENAI_API_KEY: undefined, CODEX_HOME: undefined, VSCODE_CODE_CACHE_PATH: undefined, NODE_COMPILE_CACHE: path.join(work, 'temp', 'node-compile-cache') } });
  const result = { version, vscodeVersion: '1.146.0', isolatedVsixInstalled: true, installedHostChecks: 2, codexTaskRun: false, nativeCredentialWritten: false, normalProfileChanged: false, inferenceRequests: 0, costUsd: 0 };
  await writeFile(path.join(work, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
