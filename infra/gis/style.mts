// Consumes GIS06's generator; never duplicates its design or tile schema.
import {createDarkMapStyle} from '../../packages/gis/src/map-style.ts';
import {writeFile} from 'node:fs/promises';
const origin='http://127.0.0.1:8089';
const style=createDarkMapStyle({tileUrl:`${origin}/tiles/{z}/{x}/{y}.pbf`,glyphsUrl:`${origin}/glyphs/{fontstack}/{range}.pbf`,allowedOrigins:[origin],allowHttp:true,fontStack:'Noto Sans Regular',sourceMaxZoom:14});
await writeFile(new URL('./runtime/style.json',import.meta.url),JSON.stringify(style,null,2));
console.log('GIS06 dark style provisioned at /style.json');
