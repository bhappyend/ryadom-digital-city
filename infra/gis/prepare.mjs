import {mkdir,writeFile,readFile,access} from 'node:fs/promises';
import {randomBytes,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('./',import.meta.url));
await mkdir(`${root}runtime/glyphs/Noto Sans Regular`,{recursive:true});
await mkdir(`${root}runtime/valhalla`,{recursive:true});
try { await access(`${root}runtime/nominatim-password`); } catch {await writeFile(`${root}runtime/nominatim-password`,randomBytes(32).toString('hex'),{mode:0o600});}
const revision='025ff2b2f84cc0fdf11f7b1d74b3a784595fe7a4';
const hashes={};
let expectedHashes={};try{const old=JSON.parse(await readFile(`${root}runtime/glyphs-source.json`,'utf8'));if(old.revision===revision)expectedHashes=old.hashes;}catch{}
// Entire BMP font: all 256 ranges, no remote requests during map usage.
for(let start=0;start<65536;start+=256){
  const name=`${start}-${start+255}.pbf`,path=`${root}runtime/glyphs/Noto Sans Regular/${name}`;
  let bytes; try {bytes=await readFile(path);if(!bytes.length||bytes.length>2*1024*1024||expectedHashes[name]&&createHash('sha256').update(bytes).digest('hex')!==expectedHashes[name])throw Error('Corrupt cached glyph');} catch {
    const url=`https://raw.githubusercontent.com/openmaptiles/fonts/${revision}/Klokantech%20Noto%20Sans%20Regular/${name}`;
    const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(30000)});
    if(!response.ok) throw Error(`Glyph range ${name}: HTTP ${response.status}`);
    bytes=Buffer.from(await response.arrayBuffer());
    if(bytes.length>2*1024*1024) throw Error('Oversized glyph file');
    await writeFile(path,bytes);
  }
  hashes[name]=createHash('sha256').update(bytes).digest('hex');
}
await writeFile(`${root}runtime/glyphs-source.json`,JSON.stringify({source:'https://github.com/openmaptiles/fonts',revision,originalFont:'Klokantech Noto Sans Regular',localAlias:'Noto Sans Regular',license:'SIL-OFL-1.1',hashes},null,2));
console.log('Local secret prepared (not displayed); 256 pinned font ranges ready.');
