import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

async function main() {
  const directory = path.resolve('data/osm');
  const manifestFile = path.join(directory, 'source-manifest.json');
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8')) as Record<string, unknown>;
  if (manifest.replaySha256) throw new Error('Replay already prepared');
  const bytes = await readFile(path.join(directory, 'raw/smolensk-initial.json'));
  const hash = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');
  if (hash(bytes) !== manifest.rawSha256) throw new Error('Raw checksum mismatch');
  const input = JSON.parse(bytes.toString('utf8')) as { version: number; osm3s: unknown; elements: Record<string, unknown>[] };
  const allowed = ['type', 'id', 'timestamp', 'lat', 'lon', 'center', 'bounds', 'tags'];
  const replay = JSON.stringify({ version: input.version, osm3s: input.osm3s, elements: input.elements.map(element => Object.fromEntries(Object.entries(element).filter(([key]) => allowed.includes(key)))) });
  await writeFile(path.join(directory, 'smolensk-replay.json'), replay, { flag: 'wx' });
  await writeFile(manifestFile, `${JSON.stringify({ ...manifest, replayFile: 'smolensk-replay.json', replayBytes: Buffer.byteLength(replay), replaySha256: hash(replay),
    replayTransform: 'Retained type/id/timestamp/lat/lon/center/bounds/tags and osm3s. Removed contributor uid/user, versions, changesets and geometry members; no POI values invented.' }, null, 2)}\n`);
  console.log('Verified replay prepared; raw source unchanged');
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Replay preparation failed'); process.exitCode = 1; });
