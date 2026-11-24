// Internal artifacts only. No publish/install commands or credential access.
const { createVSIX } = require('@vscode/vsce');
const yauzl = require('yauzl');
const { createHash } = require('node:crypto');
const { mkdir, readFile, writeFile, copyFile } = require('node:fs/promises');
const path = require('node:path');

async function audit(vsix) {
  const files = [];
  await new Promise((done, reject) => yauzl.open(vsix, { lazyEntries: true }, (error, zip) => {
    if (error) { reject(error); return; }
    const fail = (reason) => { zip.close(); reject(new Error(reason)); };
    zip.on('error', reject);
    zip.on('end', done);
    zip.on('entry', (entry) => {
      const name = entry.fileName;
      const allowed = /^(?:\[Content_Types\]\.xml|extension\.vsixmanifest|extension\/(?:package\.json|(?:README|CHANGELOG|compatibility-report)\.md|dist\/(?:extension|cli)\.js|(?:docs|compatibility)\/[a-z0-9/_.-]+\.(?:md|json)))$/iu;
      if (!allowed.test(name) || name.includes('..') || entry.uncompressedSize > 8 * 1024 * 1024 || files.includes(name)) { fail('Unexpected or oversized VSIX entry: ' + name); return; }
      files.push(name);
      zip.openReadStream(entry, (streamError, stream) => {
        if (streamError) { fail('Cannot inspect VSIX entry.'); return; }
        const chunks = [];
        let size = 0;
        stream.on('error', () => fail('Cannot inspect VSIX content.'));
        stream.on('data', (chunk) => { size += chunk.length; if (size > 8 * 1024 * 1024) { stream.destroy(); fail('VSIX content exceeded inspection bound.'); } else { chunks.push(chunk); } });
        stream.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if (/\bsk-v2-[a-z0-9_-]{40,}/iu.test(text) || /Synthetic test fixture only|fixture\/one/u.test(text)) { fail('Unexpected key-shaped or synthetic test content in package.'); return; }
          zip.readEntry();
        });
      });
    });
    zip.readEntry();
  }));
  for (const name of ['extension/package.json', 'extension/dist/extension.js', 'extension/dist/cli.js', 'extension/docs/vscode-setup.md']) {
    if (!files.includes(name)) { throw new Error('Required package entry missing: ' + name); }
  }
  return files.sort();
}

async function main() {
  const root = path.resolve(__dirname, '..');
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  if (!/^\d+\.\d+\.\d+$/u.test(pkg.version)) { throw new Error('Invalid package version.'); }
  const dist = path.join(root, 'dist');
  await mkdir(dist, { recursive: true });
  process.env.npm_config_cache = path.join(root, 'tmp', 'npm-cache');
  const vsix = path.join(dist, `routero-connect-${pkg.version}-win32-x64.vsix`);
  await createVSIX({ cwd: root, packagePath: vsix, dependencies: false, skipLicense: true, target: 'win32-x64', rewriteRelativeLinks: false });
  const files = await audit(vsix);
  const cliDirectory = path.join(dist, 'internal-cli');
  await mkdir(cliDirectory, { recursive: true });
  const cli = path.join(cliDirectory, `routero-connect-${pkg.version}.cjs`);
  await copyFile(path.join(dist, 'cli.js'), cli);
  for (const name of ['codex-cli.md', 'credentials.md', 'configuration-engine.md', 'vscode-setup.md']) { await copyFile(path.join(root, 'docs', name), path.join(cliDirectory, name)); }
  await writeFile(path.join(cliDirectory, 'README.md'), `# Routero Connect internal CLI ${pkg.version}\n\nRequires Windows and Node.js 24.18+ in Node 24. Run node routero-connect-${pkg.version}.cjs --help. No npm/global installation is needed. See codex-cli.md for explicit paths, compatibility, credit notices and transaction recovery. No coding model is approved in this build. Keep this entire directory outside the extension installation for independent recovery. This package does not install Node or a credential helper.\n`);
  const hash = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
  const manifest = { schemaVersion: 1, version: pkg.version, scope: 'internal-windows-cli-ui-unverified-coding', vsix: { file: path.basename(vsix), sha256: await hash(vsix), inspectedEntries: files }, cli: { file: path.relative(dist, cli).replaceAll('\\', '/'), sha256: await hash(cli) }, published: false, installed: false };
  await writeFile(path.join(dist, 'internal-artifacts.json'), JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(path.join(cliDirectory, 'manifest.json'), JSON.stringify({ version: pkg.version, file: path.basename(cli), sha256: manifest.cli.sha256 }, null, 2) + '\n');
  console.log(JSON.stringify({ version: pkg.version, vsix, cli, inspectedEntries: files.length, published: false, installed: false }, null, 2));
}

if (require.main === module) { main().catch((error) => { console.error(error.message); process.exitCode = 1; }); }
module.exports = { audit };
