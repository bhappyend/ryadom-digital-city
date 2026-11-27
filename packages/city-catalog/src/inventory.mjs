import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=path.resolve('data/cities');
const specs=[['hflabs-city.csv','https://raw.githubusercontent.com/hflabs/city/master/city.csv','CC-BY-SA-4.0'],['hflabs-README.md','https://raw.githubusercontent.com/hflabs/city/master/README.md','CC-BY-SA-4.0'],['geonames-RU.zip','https://download.geonames.org/export/dump/RU.zip','CC-BY-4.0'],['geonames-admin1CodesASCII.txt','https://download.geonames.org/export/dump/admin1CodesASCII.txt','CC-BY-4.0'],['geonames-readme.txt','https://download.geonames.org/export/dump/readme.txt','CC-BY-4.0']];
const sources=[];for(const [file,url,license] of specs){const b=await fs.readFile(path.join(root,file)),stat=await fs.stat(path.join(root,file));sources.push({file,url,license,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex'),downloadCompletedFilesystemMtime:stat.mtime.toISOString(),tlsVerified:true,sourceUpdatedAt:null});}
for(const name of (await fs.readdir(path.join(root,'raw'))).filter(n=>n.endsWith('.json')).sort())sources.push({file:'raw/'+name,...JSON.parse(await fs.readFile(path.join(root,'raw',name),'utf8'))});
await fs.writeFile(path.join(root,'acquisition-manifest.json'),JSON.stringify({generatedAt:new Date().toISOString(),sources},null,2)+'\n');
const quarantine=[];
const urls={'oktmo-20261001.csv':'https://rosstat.gov.ru/opendata/7708234640-oktmo/data-20261001T1010-structure-20260210T1102.csv','meta.csv':'https://rosstat.gov.ru/opendata/7708234640-oktmo/meta.csv','rosstat-classification.html':'https://rosstat.gov.ru/classification?print=1','rosstat-oktmo-page.html':'https://rosstat.gov.ru/opendata/7708234640-oktmo'};
for(const [file,url] of Object.entries(urls)){const b=await fs.readFile(path.join(root,'quarantine',file));quarantine.push({file:'quarantine/'+file,url,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex'),tlsVerified:false,transport:'One-off PowerShell SkipCertificateCheck after UntrustedRoot; source authenticity not established',status:'quarantined_not_import_authority',officialDenominatorUsable:false});}
await fs.writeFile(path.join(root,'quarantine-manifest.json'),JSON.stringify({generatedAt:new Date().toISOString(),usedByRegistryOrImport:false,sources:quarantine},null,2)+'\n');
console.log('Source inventory saved; verified files',sources.length,'quarantined files',quarantine.length);
