import { readdir, mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Explicit source roots: credentials, database backups, uploads and QA artifacts
// never belong to a distributable source package.
const root = fileURLToPath(new URL('../', import.meta.url));
const roots = ['apps', 'packages', 'scripts', 'infra', 'docs', '.github', 'ryadom-digital-city'];
const excluded = new Set(['node_modules', 'dist', '.next', 'coverage', 'artifacts', 'test-results', 'playwright-report', 'backups', 'downloads', 'cache', '.git', '__pycache__', 'raw', 'volumes', 'storage']);
export function allowed(path) {
  const normalized = path.replaceAll('\\', '/');
  if (/^infra\/(?:data|reports|gis\/runtime)(?:\/|$)/.test(normalized)) return false;
  const parts = normalized.split('/');
  const name = parts.at(-1);
  return !parts.some(p => excluded.has(p) || p.startsWith('.env') && !['.env.example', '.env.production.example'].includes(p))
    && !/\.(?:log|dump|pem|key|p12|pfx|tsbuildinfo|pbf|mbtiles|pmtiles|pyc)$/i.test(name)
    && !/(?:^|[-_.])(?:secrets?|credentials)(?:[-_.]|$)/i.test(name);
}
export async function sourceFiles() {
  const files = [];
  async function walk(dir) {
    for (const e of await readdir(join(root, dir), { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (!allowed(p) || e.isSymbolicLink()) continue;
      if (e.isDirectory()) await walk(p);
      else if (e.isFile()) files.push(p);
    }
  }
  for (const dir of roots) await walk(dir);
  for (const e of await readdir(root, { withFileTypes: true })) {
    if (e.isFile() && allowed(e.name) && /^(?:package(?:-lock)?\.json|tsconfig.*\.json|README\.md|AGENTS\.md|\.npmrc|\.dockerignore|\.gitignore|\.env(?:\.production)?\.example|compose.*\.ya?ml)$/.test(e.name)) files.push(e.name);
  }
  for (const p of ['data/osm/smolensk-replay.json', 'data/osm/source-manifest.json', 'data/osm/smolensk-initial.overpassql', 'data/osm/LICENSE.md', 'data/osm/README.md', 'data/cities/showcase35.json']) files.push(p);
  return files.sort();
}
async function main() {
  const files = await sourceFiles();
  const output = resolve(root, 'release'); await mkdir(output, { recursive: true });
  const manifest = [];
  for (const path of files) {
    if (/[\r\n]/.test(path)) throw new Error('Unsupported filename');
    const bytes = await readFile(join(root, path));
    manifest.push({ path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  const list = join(output, 'files.txt'); await writeFile(list, files.join('\n') + '\n');
  const archive = join(output, 'ryadom-source.tar.gz');
  const tar = spawnSync('tar', ['-czf', archive, '-T', list], { cwd: root, windowsHide: true, encoding: 'utf8' });
  if (tar.status !== 0) throw new Error('Archive creation failed');
  const hash = createHash('sha256').update(await readFile(archive)).digest('hex');
  await writeFile(join(output, 'manifest.json'), JSON.stringify({ createdAt: new Date().toISOString(), archiveSha256: hash, files: manifest }, null, 2));
  await writeFile(archive + '.sha256', `${hash}  ryadom-source.tar.gz\n`);
  console.log(`Created ${relative(root, archive)}: ${files.length} source files. Secrets, uploads and backups excluded.`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(() => { console.error('Release packaging failed; inspect source paths and tar availability.'); process.exitCode = 1; });
