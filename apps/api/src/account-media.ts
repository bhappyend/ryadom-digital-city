import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink, lstat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import sharp from 'sharp';
import { MEDIA_LIMITS, MediaAssetSchema } from '@ryadom/accounts-types';
import type { ApiRequest } from './errors.js';
import { AccountFault } from './accounts-fault.js';

export interface MediaTicket { id: string; mime: string; byte_length: number; sha256: string }
export interface MediaRepository {
  getMediaUpload(id: string, ctx: { actorId: string; requestId: string }): Promise<MediaTicket>;
  completeMediaUpload(id: string, value: { width: number; height: number; byteLength: number; sha256: string; storageKey: string }, ctx: { actorId: string; requestId: string }): Promise<unknown>;
  getApprovedMedia(id: string): Promise<{ storage_key: string } | null>;
}
function exactRasterContainer(source: Buffer, mime: string) {
  if (mime === 'image/jpeg') return source.length >= 4 && source[0] === 255 && source[1] === 216 && source[source.length-2] === 255 && source[source.length-1] === 217;
  if (mime === 'image/webp') return source.length >= 12 && source.toString('ascii',0,4) === 'RIFF' && source.toString('ascii',8,12) === 'WEBP' && source.readUInt32LE(4)+8 === source.length;
  if (mime !== 'image/png' || source.length < 20 || source.subarray(0,8).toString('hex') !== '89504e470d0a1a0a') return false;
  let offset=8;
  while (offset+12 <= source.length) { const size=source.readUInt32BE(offset); if (size>source.length-offset-12) return false; const type=source.toString('ascii',offset+4,offset+8); offset+=size+12; if(type==='IEND') return size===0 && offset===source.length; }
  return false;
}
/** Generated UUID filenames only. All uploaded bytes remain private until a published reference exists. */
export class LocalMedia {
  private active = 0;
  constructor(readonly root: string, readonly repo: MediaRepository) {}
  private path(id: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) throw new AccountFault('NOT_FOUND');
    const path = resolve(this.root, 'quarantine', `${id}.webp`);
    if (!path.startsWith(resolve(this.root) + (process.platform === 'win32' ? '\\' : '/'))) throw new AccountFault('NOT_FOUND');
    return path;
  }
  async upload(req: ApiRequest, id: string, actorId: string) {
    if (this.active >= 2) throw new AccountFault('RATE_LIMITED');
    if (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity') throw new AccountFault('UNSUPPORTED_MEDIA_TYPE');
    const transportMime = req.headers['content-type'];
    if (!['application/octet-stream','image/jpeg','image/png','image/webp'].includes(transportMime ?? '')) throw new AccountFault('UNSUPPORTED_MEDIA_TYPE');
    if (Number(req.headers['content-length']) > MEDIA_LIMITS.uploadBytes) throw new AccountFault('PAYLOAD_TOO_LARGE');
    const ctx = { actorId, requestId: req.requestId };
    const ticket = await this.repo.getMediaUpload(id, ctx);
    const mime = ticket.mime;
    if (transportMime !== 'application/octet-stream' && ticket.mime !== transportMime) throw new AccountFault('VALIDATION_ERROR');
    this.active++;
    let temp: string | undefined;
    try {
      let size = 0; const chunks: Buffer[] = [];
      for await (const value of req) {
        const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value); size += chunk.length;
        if (size > MEDIA_LIMITS.uploadBytes || size > ticket.byte_length) throw new AccountFault('PAYLOAD_TOO_LARGE');
        if (req.signal.aborted) throw new AccountFault('VALIDATION_ERROR');
        chunks.push(chunk);
      }
      const source = Buffer.concat(chunks);
      if (size !== ticket.byte_length || createHash('sha256').update(source).digest('hex') !== ticket.sha256) throw new AccountFault('VALIDATION_ERROR');
      if (!exactRasterContainer(source,mime)) throw new AccountFault('VALIDATION_ERROR');
      let output: { data: Buffer; info: sharp.OutputInfo };
      try {
        const image = sharp(source, { failOn: 'warning', limitInputPixels: MEDIA_LIMITS.maxPixels, animated: false, pages: 1 });
        const info = await image.metadata();
        const format = mime === 'image/jpeg' ? 'jpeg' : mime === 'image/png' ? 'png' : 'webp';
        if (info.format !== format || (info.pages ?? 1) !== 1 || !info.width || !info.height || info.width > MEDIA_LIMITS.maxDimension || info.height > MEDIA_LIMITS.maxDimension || info.width * info.height > MEDIA_LIMITS.maxPixels) throw new Error();
        // Decode/re-encode strips EXIF, XMP, ICC and any appended original payload.
        output = await image.rotate().webp({ quality: 85 }).toBuffer({ resolveWithObject: true });
      } catch { throw new AccountFault('VALIDATION_ERROR'); }
      if (!output.data.length || output.data.length > MEDIA_LIMITS.uploadBytes) throw new AccountFault('PAYLOAD_TOO_LARGE');
      const path = this.path(id); await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      const dir = await lstat(dirname(path)); if (dir.isSymbolicLink() || !dir.isDirectory()) throw new AccountFault('PROVIDER_UNAVAILABLE');
      temp = `${path}.${randomUUID()}.tmp`;
      const file = await open(temp, 'wx', 0o600); try { await file.writeFile(output.data); await file.sync(); } finally { await file.close(); }
      // Same UUID upload races may leave an unreachable file, never expose unapproved media.
      await rename(temp, path); temp = undefined;
      return MediaAssetSchema.parse(await this.repo.completeMediaUpload(id, { width: output.info.width, height: output.info.height, byteLength: output.data.length, sha256: createHash('sha256').update(output.data).digest('hex'), storageKey: `${id}.webp` }, ctx));
    } finally { this.active--; if (temp) await unlink(temp).catch(() => {}); }
  }
  async published(id: string): Promise<Buffer> {
    const path = this.path(id), record = await this.repo.getApprovedMedia(id);
    if (!record || record.storage_key !== `${id}.webp`) throw new AccountFault('NOT_FOUND');
    const stat = await lstat(path); if (stat.isSymbolicLink() || !stat.isFile() || stat.size > MEDIA_LIMITS.uploadBytes) throw new AccountFault('NOT_FOUND');
    return readFile(path);
  }
}
