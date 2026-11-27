// Bounded, atomic, checksum-verified acquisition. Run from the repository root.
import { mkdir, readFile, rename, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('./runtime/', import.meta.url));
await mkdir(root, {recursive:true});
const base = 'https://download.openstreetmap.fr/extracts/russia/central_federal_district/';
const expected = 'b06a09374bdac2f0d9354eaf9e1c4a41';
const limit = 150 * 1024 * 1024;
async function hash(path, algorithm) { const h=createHash(algorithm); for await (const c of createReadStream(path)) h.update(c); return h.digest('hex'); }
const path = `${root}smolensk.osm.pbf`;
let present=false;
try { present=(await stat(path)).size<=limit && await hash(path,'md5')===expected; } catch {}
if (!present) {
  const checksum = await fetch(`${base}smolensk_oblast.osm.pbf.md5`, {signal:AbortSignal.timeout(30000),redirect:'error'});
  if (!checksum.ok || !(await checksum.text()).startsWith(expected)) throw Error('Upstream snapshot changed; review provenance and update expected checksum explicitly.');
  const response = await fetch(`${base}smolensk_oblast-latest.osm.pbf`, {signal:AbortSignal.timeout(600000),redirect:'error'});
  if (!response.ok || Number(response.headers.get('content-length'))>limit) throw Error('Download failed or exceeds 150MiB');
  let bytes=0;
  await pipeline(Readable.fromWeb(response.body),new Transform({transform(chunk,encoding,cb){bytes+=chunk.length; cb(bytes>limit?Error('Dataset exceeds limit'):null,chunk);}}),createWriteStream(`${path}.part`));
  if(await hash(`${path}.part`,'md5')!==expected) throw Error('MD5 mismatch; partial file retained for diagnosis, never used.');
  await rename(`${path}.part`,path);
}
let acquiredAt=new Date().toISOString();try{const previous=JSON.parse(await readFile(new URL('./source.lock.json',import.meta.url),'utf8'));if(present&&previous.md5===expected)acquiredAt=previous.acquiredAt;}catch{}
const provenance={url:`${base}smolensk_oblast-latest.osm.pbf`,checksumUrl:`${base}smolensk_oblast.osm.pbf.md5`,stateUrl:`${base}smolensk_oblast.state.txt`,sourceTimestamp:'2026-11-25T00:06:47Z',replicationSequence:7387177,md5:expected,sha256:await hash(path,'sha256'),bytes:(await stat(path)).size,license:'ODbL-1.0',licenseUrl:'https://opendatacommons.org/licenses/odbl/1-0/',attribution:'© OpenStreetMap contributors',acquiredAt};
await writeFile(`${root}source.json`,JSON.stringify(provenance,null,2)+'\n');
console.log(JSON.stringify(provenance,null,2));
