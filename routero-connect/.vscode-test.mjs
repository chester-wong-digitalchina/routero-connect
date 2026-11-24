import { defineConfig } from '@vscode/test-cli';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

const root = resolve('tmp/validation/phase-7-host');
for (const name of ['user-data', 'extensions', 'profile', 'appdata', 'localappdata', 'temp']) {
	mkdirSync(resolve(root, name), { recursive: true });
}
mkdirSync(resolve(root, 'user-data', 'User'), { recursive: true });
writeFileSync(resolve(root, 'user-data', 'User', 'settings.json'), JSON.stringify({
	'chat.disableAIFeatures': true,
	'telemetry.telemetryLevel': 'off',
	'extensions.ignoreRecommendations': true,
	'workbench.startupEditor': 'none',
	'update.mode': 'none',
}));

export default defineConfig({
	files: 'out/test/extension.test.js',
	version: '1.146.0',
	mocha: { timeout: 15000 },
	useInstallation: { fromMachine: false },
	launchArgs: [
		'--user-data-dir=' + resolve(root, 'user-data'),
		'--extensions-dir=' + resolve(root, 'extensions'),
		'--disable-telemetry', '--disable-updates', '--skip-welcome', '--skip-release-notes',
	],
	env: {
		USERPROFILE: resolve(root, 'profile'), APPDATA: resolve(root, 'appdata'),
		LOCALAPPDATA: resolve(root, 'localappdata'), TEMP: resolve(root, 'temp'), TMP: resolve(root, 'temp'),
		NODE_OPTIONS: undefined, NODE_PATH: undefined, OPENAI_API_KEY: undefined, CODEX_HOME: undefined,
		VSCODE_CODE_CACHE_PATH: undefined, NODE_COMPILE_CACHE: resolve(root, 'temp', 'node-compile-cache'),
	},
});
