import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const api = process.env.VITE_API_ORIGIN || 'https://passwordmanager.sushandahal.com.np/api';
if (new URL(api).protocol !== 'https:') throw new Error('Release API must use HTTPS');
// Reuse npm's Node executable and CLI on both Vercel/Linux and Windows.
const npmCli = process.env.npm_execpath;
const command = npmCli ? process.execPath : (process.platform === 'win32' ? 'npm.cmd' : 'npm');
const args = [...(npmCli ? [npmCli] : []), 'run', 'build', '--workspace=extension'];
const build = spawnSync(command, args, { cwd: root, env: { ...process.env, VITE_API_ORIGIN: api }, stdio: 'inherit', shell: !npmCli && process.platform === 'win32' });
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status || 1);
const dist = path.join(root, 'apps/extension/dist');
const manifest = JSON.parse(await readFile(path.join(dist, 'manifest.json'), 'utf8'));
if (manifest.manifest_version !== 3 || !manifest.version || !manifest.background?.service_worker) throw new Error('Invalid MV3 manifest');
for (const file of [manifest.background.service_worker, manifest.action.default_popup, 'offscreen.html']) await readFile(path.join(dist, file));
const files = [];
async function walk(dir, prefix = '') { for (const entry of await readdir(dir, { withFileTypes: true })) { const name = prefix + entry.name; if (entry.isDirectory()) await walk(path.join(dir, entry.name), name + '/'); else { if (!/\.(js|css|html|json|wasm|png|svg|woff2?)$/.test(name) || name.includes('.env')) throw new Error(`Unexpected release file: ${name}`); files.push([name, await readFile(path.join(dir, entry.name))]); } } }
await walk(dist);
// Standard ZIP, uncompressed entries, fixed DOS timestamp for reproducible archives.
function crc32(data) { let c = 0xffffffff; for (const byte of data) { c ^= byte; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); } return (c ^ 0xffffffff) >>> 0; }
const local = [], central = []; let offset = 0;
for (const [name, data] of files.sort((a,b) => a[0].localeCompare(b[0]))) {
 const filename = Buffer.from(name); const crc = crc32(data);
 const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50); h.writeUInt16LE(20,4); h.writeUInt16LE(33,12); h.writeUInt32LE(crc,14); h.writeUInt32LE(data.length,18); h.writeUInt32LE(data.length,22); h.writeUInt16LE(filename.length,26);
 const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50); c.writeUInt16LE(20,4); c.writeUInt16LE(20,6); c.writeUInt16LE(33,14); c.writeUInt32LE(crc,16); c.writeUInt32LE(data.length,20); c.writeUInt32LE(data.length,24); c.writeUInt16LE(filename.length,28); c.writeUInt32LE(offset,42);
 local.push(h, filename, data); central.push(c,filename); offset += h.length + filename.length + data.length;
}
const directory = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length,8); end.writeUInt16LE(files.length,10); end.writeUInt32LE(directory.length,12); end.writeUInt32LE(offset,16);
const output = path.join(root, 'apps/web/public/downloads'); await mkdir(output, { recursive: true });
await writeFile(path.join(output, 'password-manager-extension.zip'), Buffer.concat([...local, directory, end]));
await writeFile(path.join(output, 'extension-release.json'), JSON.stringify({ version: manifest.version, date: new Date().toISOString().slice(0,10), api }));
console.log(`Packaged ${files.length} files, version ${manifest.version}, API ${api}`);
