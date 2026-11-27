import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
const root=process.env.GIS_DATA_DIR??'/data/runtime';
const db=new DatabaseSync(`${root}/smolensk.mbtiles`,{readOnly:true});
const metadata=Object.fromEntries(db.prepare('SELECT name,value FROM metadata').all().map(x=>[x.name,x.value]));
const layers=JSON.parse(metadata.json).vector_layers;
const origin='http://127.0.0.1:8089';
const tilejson={tilejson:'3.0.0',name:'Рядом · Смоленск · OSM',scheme:'xyz',tiles:[`${origin}/tiles/{z}/{x}/{y}.pbf`],minzoom:Number(metadata.minzoom),maxzoom:Number(metadata.maxzoom),bounds:metadata.bounds.split(',').map(Number),attribution:'© OpenStreetMap contributors (ODbL 1.0) · © OpenMapTiles',vector_layers:layers};
const tile=db.prepare('SELECT tile_data FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?');
const allowedOrigins=new Set(['http://localhost:3000','http://127.0.0.1:3000']);
export const server=createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Cache-Control','public, max-age=3600');
  if(allowedOrigins.has(req.headers.origin)){res.setHeader('Access-Control-Allow-Origin',req.headers.origin);res.setHeader('Vary','Origin');}
  const send=(status,type,body)=>{res.writeHead(status,{'Content-Type':type});res.end(req.method==='HEAD'?undefined:body);};
  try{
    if(!['GET','HEAD'].includes(req.method)) return send(405,'text/plain','Method not allowed');
    if(req.url.length>512||req.url.includes('?')) return send(400,'text/plain','Invalid resource');
    if(req.url==='/health') return send(200,'application/json','{"status":"ok"}');
    if(req.url==='/tiles.json') return send(200,'application/json',JSON.stringify(tilejson));
    if(req.url==='/style.json') return send(200,'application/json',await readFile(`${root}/style.json`));
    const t=/^\/tiles\/(\d{1,2})\/(\d{1,7})\/(\d{1,7})\.pbf$/.exec(req.url);
    if(t){const [z,x,y]=t.slice(1).map(Number);if(z>14||x>=2**z||y>=2**z) return send(400,'text/plain','Invalid tile');const row=tile.get(z,x,2**z-1-y);if(!row) return send(204,'application/vnd.mapbox-vector-tile','');const bytes=Buffer.from(row.tile_data);if(bytes[0]===31&&bytes[1]===139)res.setHeader('Content-Encoding','gzip');return send(200,'application/vnd.mapbox-vector-tile',bytes);}
    const g=/^\/glyphs\/Noto(?:%20| )Sans(?:%20| )Regular\/(\d{1,5})-(\d{1,5})\.pbf$/.exec(req.url);
    if(g){const start=Number(g[1]),end=Number(g[2]);if(start%256||end!==start+255||end>65535) return send(400,'text/plain','Invalid glyph range');return send(200,'application/x-protobuf',await readFile(`${root}/glyphs/Noto Sans Regular/${start}-${end}.pbf`));}
    return send(404,'text/plain','Not found');
  }catch{return send(500,'text/plain','Resource unavailable');}
});
server.requestTimeout=5000;server.headersTimeout=5000;server.keepAliveTimeout=5000;server.maxRequestsPerSocket=100;
server.listen(8080,'0.0.0.0',()=>console.log('Local OpenMapTiles server listening; no upstream proxy.'));
process.on('SIGTERM',()=>server.close(()=>{db.close();process.exit(0);}));
