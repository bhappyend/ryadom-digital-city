import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { DateTimeSchema } from '@ryadom/types';
import { ATTRIBUTION, LICENSE, normalizeDocument } from './normalize';

export async function readBounded(file: string, maxBytes: number): Promise<Buffer> {
  const info = await stat(file);
  if (!info.isFile() || info.size > maxBytes) throw new Error('Input is not a bounded regular file');
  const bytes = await readFile(file);
  if (bytes.length > maxBytes) throw new Error('Input grew beyond size limit');
  return bytes;
}
export const sha256 = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');

export async function loadInput(inputFile: string, manifestFile: string, importedAt: string) {
  const bytes = await readBounded(inputFile, 16 * 1024 * 1024);
  const manifest = JSON.parse((await readBounded(manifestFile, 16 * 1024)).toString('utf8')) as Record<string, unknown>;
  const hash = sha256(bytes);
  const matchesRaw = manifest.rawSha256 === hash && manifest.rawBytes === bytes.length;
  const matchesReplay = manifest.replaySha256 === hash && manifest.replayBytes === bytes.length;
  if (manifest.schemaVersion !== 1 || manifest.sourceId !== 'osm' || manifest.license !== LICENSE || manifest.attribution !== ATTRIBUTION ||
      manifest.sourceUrl !== 'https://overpass-api.de/api/interpreter' || manifest.licenseUrl !== 'https://opendatacommons.org/licenses/odbl/1-0/' ||
      (!matchesRaw && !matchesReplay) || !/^[a-f0-9]{64}$/.test(String(manifest.rawSha256)) || !/^[a-f0-9]{64}$/.test(String(manifest.querySha256)) || manifest.queryFile !== 'smolensk-initial.overpassql') throw new Error('Source manifest mismatch: hash, size, source, query or license');
  DateTimeSchema.parse(manifest.fetchedAt);
  const query = await readBounded(path.join(path.dirname(manifestFile), 'smolensk-initial.overpassql'), 8192);
  if (sha256(query) !== manifest.querySha256) throw new Error('Query checksum mismatch');
  const normalized = normalizeDocument(JSON.parse(bytes.toString('utf8')), importedAt);
  if (normalized.sourceUpdatedAt !== manifest.sourceUpdatedAt || normalized.inputCount !== manifest.elementCount) throw new Error('Source manifest timestamp/count mismatch');
  return { ...normalized, sourceHash: manifest.rawSha256 as string, inputHash: hash, fetchedAt: manifest.fetchedAt, manifest };
}
