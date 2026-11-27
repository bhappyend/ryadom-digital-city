// Single foreground owner: sequential jobs, bounded waits, safe to rerun after interruption.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
const cwd=fileURLToPath(new URL('../../',import.meta.url));
const compose=['compose','-p','ryadom-gis','-f','compose.gis.yaml','--profile','build','--profile','geocoder','--profile','tiles'];
function run(program,args){const r=spawnSync(program,args,{cwd,stdio:'inherit'});if(r.status!==0)throw Error(`${program} failed (${r.status})`);}
function output(args){const r=spawnSync('docker',args,{cwd,encoding:'utf8'});if(r.status!==0)throw Error('Docker command failed');return r.stdout.trim();}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
await mkdir(new URL('./evidence/',import.meta.url),{recursive:true});
run('node',['infra/gis/download.mjs']);
run('node',['infra/gis/prepare.mjs']);
run('node',['--import','tsx','infra/gis/style.mts']);
run('docker',[...compose,'config','--quiet']);
const measurements=[];
for(const [service,build,minutes] of [['valhalla',false,30],['tilemaker',true,30],['nominatim',false,60],['tiles',false,2]]){
  console.log(`Starting ${service}; foreground owner GIS06.1, max wait ${minutes}min.`);
  run('docker',[...compose,'up','-d',service]);
  const id=output(['inspect','--format','{{.Id}}',`ryadom-gis-${service}-1`]);
  const start=Date.now();let last=0;let observedPeakBytes=0;
  while(true){
    const state=JSON.parse(output(['inspect','--format','{{json .State}}',id]));
    if(state.Status==='running'){try{observedPeakBytes=Math.max(observedPeakBytes,Number(output(['exec',id,'cat','/sys/fs/cgroup/memory.peak'])));}catch{}}
    if(build&&state.Status==='exited'&&state.ExitCode===0||!build&&state.Health?.Status==='healthy')break;
    if(['dead','exited'].includes(state.Status))throw Error(`${service} stopped: ${state.ExitCode}; inspect its logs; no unrelated resources changed.`);
    if(Date.now()-start>minutes*60000)throw Error(`${service} timed out; container retained, resume with same command.`);
    if(Date.now()-last>30000){console.log(`${service}: ${state.Status}/${state.Health?.Status??'building'}, elapsed ${Math.round((Date.now()-start)/1000)}s`);last=Date.now();}
    await sleep(5000);
  }
  let peakBytes=observedPeakBytes||null;try{peakBytes=Number(output(['exec',id,'cat','/sys/fs/cgroup/memory.peak']));}catch{}
  measurements.push({service,id,durationSeconds:Math.round((Date.now()-start)/1000),peakBytes});
  await writeFile(new URL('./evidence/startup.json',import.meta.url),JSON.stringify(measurements,null,2));
  console.log(`${service}: ready.`);
}
console.log('GIS services healthy. Run node --import tsx infra/gis/smoke.mts for live acceptance.');
