/** Explicit one-off acquisition. Never imported by CLI or application servers. */
import { readFile, mkdir, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

async function main() {
  if (process.argv.slice(2).join(' ') !== '--acknowledge-one-off') throw new Error('Pass --acknowledge-one-off; this is not a scheduled public API adapter');
  const directory = path.resolve('data/osm');
  const target = path.join(directory, 'raw/smolensk-initial.json');
  try { await access(target); throw new Error('Cached raw file exists; use it. No network request sent.'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const query = await readFile(path.join(directory, 'smolensk-initial.overpassql'), 'utf8');
  const endpoint = 'https://overpass-api.de/api/interpreter';
  const response = await fetch(endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(90_000),
    headers: { 'User-Agent': 'Ryadom-Patchvale-initial-import/0.1 (https://t.me/patchvale)', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ data: query }) });
  if (!response.ok) throw new Error(`Overpass HTTP ${response.status}; no automatic retry. Respect Retry-After and review source before retrying.`);
  if (!response.body) throw new Error('Empty response');
  const chunks: Uint8Array[] = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 16 * 1024 * 1024) { await response.body.cancel().catch(() => {}); throw new Error('Response exceeds 16 MiB'); }
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  const document = JSON.parse(bytes.toString('utf8')) as { remark?: string; elements?: unknown[]; osm3s?: { timestamp_osm_base?: string } };
  if (document.remark || !document.elements?.length || !document.osm3s?.timestamp_osm_base) throw new Error('Partial/empty/malformed Overpass response; not cached');
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes, { flag: 'wx' });
  const manifest = { schemaVersion: 1, sourceId: 'osm', license: 'ODbL-1.0', attribution: '© OpenStreetMap contributors',
    licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/', sourceUrl: endpoint,
    sourceUpdatedAt: document.osm3s.timestamp_osm_base, fetchedAt: new Date().toISOString(),
    rawFile: 'raw/smolensk-initial.json', rawBytes: bytes.length, rawSha256: createHash('sha256').update(bytes).digest('hex'),
    queryFile: 'smolensk-initial.overpassql', querySha256: createHash('sha256').update(query).digest('hex'),
    elementCount: document.elements.length, acquisition: 'single bounded city-area query, OSM relation/3339993; no automatic retries' };
  await writeFile(path.join(directory, 'source-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify(manifest, null, 2));
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Acquisition failed'); process.exitCode = 1; });
