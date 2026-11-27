const { spawn } = require('node:child_process');
const { createServer } = require('node:net');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const reserve=createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
  const child=spawn(process.execPath,[resolve(__dirname,'../dist/main.js')],{env:{...process.env,NODE_ENV:'production',API_HOST:'127.0.0.1',API_PORT:String(port),APP_DATABASE_URL:'',REDIS_URL:'',CORS_ORIGINS:'https://example.invalid',ACCOUNTS_ENABLED:'false',PUBLIC_MEDIA_ORIGIN:''},stdio:['ignore','pipe','pipe'],windowsHide:true});
  let output='';child.stdout.on('data',v=>{output+=v;});child.stderr.on('data',v=>{output+=v;});
  try{
    let ready=false;for(let n=0;n<60;n++){if(child.exitCode!==null)break;try{const res=await fetch(`http://127.0.0.1:${port}/health/live`);if(res.status===200){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
    assert(ready,'Compiled production Node process did not become live');
    const categories=await fetch(`http://127.0.0.1:${port}/api/v1/categories`);assert.equal(categories.status,200);assert.equal((await categories.json()).data.length,14);
    const denied=await fetch(`http://127.0.0.1:${port}/API/V1/ADMIN/CATALOG/BUSINESSES/`);assert.equal(denied.status,401);assert.equal((await denied.json()).error.code,'UNAUTHORIZED');assert.equal(denied.headers.get('cache-control'),'no-store');
    assert(!/password|postgres:\/\/|secret=/i.test(output));console.log('Compiled production Node startup/categories/admin-denial: PASS');
  }finally{child.kill('SIGTERM');await new Promise(r=>{if(child.exitCode!==null)r();else child.once('exit',r);});}
})().catch(()=>{console.error('Compiled production Node smoke: FAIL');process.exitCode=1;});
