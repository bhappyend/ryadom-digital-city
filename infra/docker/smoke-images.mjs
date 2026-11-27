import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
function docker(args) {
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 90_000, maxBuffer: 1024 * 1024 });
  assert.equal(result.status, 0, `Docker smoke step failed: ${args[0]} (output suppressed)`);
  return result.stdout.trim();
}
const [kind, image] = process.argv.slice(2);
assert.ok(['web','api','tools'].includes(kind) && image, 'Usage: node infra/docker/smoke-images.mjs web|api|tools IMAGE');
const locked = ['--read-only','--network','none','--cap-drop','ALL','--security-opt','no-new-privileges:true','--tmpfs','/tmp:rw,noexec,nosuid,size=64m'];
const uid = docker(['run','--rm',...locked,'--entrypoint','node',image,'-p','process.getuid()']);
assert.equal(uid, '10001');
if (kind === 'api') {
  docker(['run','--rm',...locked,'--entrypoint','node',image,'-e',`(async()=>{ const a=require('argon2'); if(!await a.verify(await a.hash('native-smoke-only'), 'native-smoke-only')) throw Error(); const s=require('sharp'); const b=await s({create:{width:1,height:1,channels:3,background:'white'}}).webp().toBuffer(); if((await s(b).metadata()).format!=='webp') throw Error(); require('@ryadom/db/compiled'); })().catch(()=>process.exit(1));`]);
  const name = `ryadom-api-smoke-${Date.now()}`;
  let created = false;
  try {
    docker(['run','-d','--name',name,...locked,image]); created = true;
    docker(['exec',name,'node','-e',`(async()=>{ for(let i=0;i<30;i++){try{let r=await fetch('http://127.0.0.1:3001/health/live',{signal:AbortSignal.timeout(1500)}); if(r.status===200){if((await fetch('http://127.0.0.1:3001/health/ready')).status!==503) throw Error('readiness must show unavailable dependencies'); return; }}catch{} await new Promise(r=>setTimeout(r,300));} throw Error('API startup'); })().catch(()=>process.exit(1));`]);
  } finally { if (created) docker(['rm','-f',name]); }
} else if (kind === 'tools') {
  docker(['run','--rm',...locked,'--entrypoint','node',image,'-e',`const fs=require('node:fs'); for(const f of ['node_modules/tsx/dist/cli.mjs','packages/db/migrations/003_accounts_admin.sql','apps/api/dist/bootstrap-admin.js']) if(!fs.existsSync(f)) throw Error('missing tool');`]);
} else {
  const name = `ryadom-web-smoke-${Date.now()}`;
  let created = false;
  try {
    docker(['run','-d','--name',name,...locked,'--tmpfs','/app/apps/web/.next/cache:rw,nosuid,size=32m,uid=10001,gid=10001',image]); created = true;
    docker(['exec',name,'node','-e',`(async()=>{ for(let i=0;i<30;i++){try{let r=await fetch('http://127.0.0.1:3000/manifest.webmanifest',{signal:AbortSignal.timeout(1500)}); if(r.status===200){ const manifest=await r.json(); if(!manifest.name) throw Error(); return; }}catch{} await new Promise(r=>setTimeout(r,300));} throw Error('web readiness'); })().catch(()=>process.exit(1));`]);
  } finally { if (created) docker(['rm','-f',name]); }
}
console.log(`PASS ${kind}: UID10001, read-only/no-network runtime, ${kind === 'web' ? 'actual Next startup/manifest200' : kind === 'api' ? 'native Argon2/Sharp, compiled DB, actual API live200/ready503 without dependencies' : 'migration/bootstrap tools present'}`);
