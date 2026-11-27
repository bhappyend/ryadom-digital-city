import { expect, it } from 'vitest';
import { PassThrough } from 'node:stream';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import sharp from 'sharp';
import { LocalMedia, type MediaRepository } from '../src/account-media.js';
import type { ApiRequest } from '../src/errors.js';

it('validates real raster content/size/dimensions, strips metadata and never exposes private paths', async () => {
  const root=await mkdtemp(join(tmpdir(),'ryadom-codec-')),id=randomUUID();let completed=false;
  const image=await sharp({create:{width:6,height:5,channels:3,background:'#114455'}}).withMetadata({exif:{IFD0:{Artist:'TEST ONLY private metadata'}}}).png().toBuffer();
  let bytes=image;
  const repo:MediaRepository={getMediaUpload:async()=>({id,mime:'image/png',byte_length:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}),completeMediaUpload:async(_id,v)=>{completed=true;return{id,purpose:'content-image',state:'ready',url:`/media/${id}.webp`,mime:'image/webp',width:v.width,height:v.height,byteLength:v.byteLength,sha256:v.sha256,attribution:'TEST ONLY',license:'fixture',createdAt:new Date().toISOString()};},getApprovedMedia:async()=>null};
  const media=new LocalMedia(root,repo);
  const req=(mime='application/octet-stream',length=bytes.length)=>{const stream=new PassThrough();Object.assign(stream,{headers:{'content-type':mime,'content-length':String(length)},signal:new AbortController().signal,requestId:randomUUID()});stream.end(bytes);return stream as unknown as ApiRequest;};
  try {
    await expect(media.upload(req(),id,randomUUID())).resolves.toMatchObject({mime:'image/webp',width:6,height:5});expect(completed).toBe(true);
    const output=await readFile(join(root,'quarantine',`${id}.webp`));const info=await sharp(output).metadata();expect(info.exif).toBeUndefined();expect(info.xmp).toBeUndefined();expect(output.includes(Buffer.from('TEST ONLY private metadata'))).toBe(false);
    await expect(media.published(id)).rejects.toMatchObject({code:'NOT_FOUND'});
    await expect(media.published('../package.json')).rejects.toMatchObject({code:'NOT_FOUND'});
    await expect(media.upload(req('image/svg+xml'),id,randomUUID())).rejects.toMatchObject({code:'UNSUPPORTED_MEDIA_TYPE'});
    await expect(media.upload(req('image/png',2097153),id,randomUUID())).rejects.toMatchObject({code:'PAYLOAD_TOO_LARGE'});
    bytes=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    await expect(media.upload(req(),id,randomUUID())).rejects.toMatchObject({code:'VALIDATION_ERROR'});
    bytes=Buffer.concat([image,Buffer.from('<html>appended polyglot</html>')]);
    await expect(media.upload(req(),id,randomUUID())).rejects.toMatchObject({code:'VALIDATION_ERROR'});
    bytes=await sharp({create:{width:4097,height:1,channels:3,background:'#114455'}}).png().toBuffer();
    await expect(media.upload(req(),id,randomUUID())).rejects.toMatchObject({code:'VALIDATION_ERROR'});
  } finally {
    const target=resolve(root);if(!target.startsWith(resolve(tmpdir())+(process.platform==='win32'?'\\':'/'))||!target.includes('ryadom-codec-'))throw new Error('Unsafe fixture path');
    await rm(target,{recursive:true,force:true});
  }
});
