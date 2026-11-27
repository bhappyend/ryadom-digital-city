import { it, expect } from 'vitest';
import request from 'supertest';
import { randomUUID, createHash } from 'node:crypto';
import sharp from 'sharp';
import { AccountsRepository } from '@ryadom/db/compiled';
import { createAccountFixture } from './account-fixture.js';
import { digest, PasswordHasher, totp } from '../src/account-crypto.js';
import { AccountRedisRate } from '../src/account-rate.js';

it.runIf(process.env.API_ACCOUNTS_TEST === '1')('real PostgreSQL/Redis/Nest: MFA, roles, CSRF, durable CRM/catalog/CMS/media and revocation', async () => {
  const f = await createAccountFixture();
  let databaseFailure: string | null = null;
  const execute = f.admin.execute.bind(f.admin);
  f.admin.execute = async (...args) => { try { return await execute(...args); } catch (error) { const e = error as {code?:string;message?:string}; databaseFailure = `${e.code ?? 'unknown'}:${e.message ?? 'unknown'}`; throw error; } };
  try {
    const api = request.agent(f.app.getHttpServer()), anon = request(f.app.getHttpServer());
    const csrf = async () => (await api.post('/api/v1/auth/csrf').set('Origin',f.origin).send({}).expect(200)).body.data.token as string;
    const write = (method:'post'|'put'|'patch'|'delete',path:string,token:string,body:object) => api[method](path).set('Origin',f.origin).set('X-CSRF-Token',token).send(body);
    for (const path of ['/api/v1/admin/crm/owners?dataScope=production','/API/V1/ADMIN/CATALOG/BUSINESSES/','/api/v1/admin/cms/homepage']) await anon.get(path).expect(401);
    await api.get('/api/v1/auth/csrf').expect(403);
    for (const path of ['/api/v1/auth/csrf','/API/V1/AUTH/CSRF/']) {
      await api.post(path).send({}).expect(403);
      await api.post(path).set('Origin',f.origin).set('Sec-Fetch-Site','cross-site').send({}).expect(403);
      await api.post(path).set('Origin',f.origin).type('form').send({}).expect(415);
    }
    let token = await csrf();
    const login = await write('post','/api/v1/auth/login',token,{email:f.account.email,password:f.password}).expect(200);
    expect(login.body.data.status).toBe('mfa_enrollment_required');
    expect(String(login.headers['set-cookie'])).not.toMatch(/ryadom-session-dev=[A-Za-z0-9_-]{43}/);
    await api.get('/api/v1/admin/catalog/businesses').expect(401);
    // The consumed password context cannot be replayed with its old CSRF.
    await write('post','/api/v1/auth/login',token,{email:f.account.email,password:f.password}).expect(403);
    token = await csrf();
    const enrollment = (await write('post','/api/v1/auth/mfa/enrollment',token,{}).expect(200)).body.data;
    token = await csrf();
    await write('post','/api/v1/auth/mfa/enrollment/verify',token,{code:'000000'}).expect(401);
    expect((await f.setup.query("SELECT attempts FROM auth_challenges WHERE kind='enrollment' ORDER BY created_at DESC LIMIT 1")).rows[0].attempts).toBe(1);
    const enrolled = await write('post','/api/v1/auth/mfa/enrollment/verify',token,{code:totp(enrollment.secret,Math.floor(Date.now()/30000))}).expect(200);
    expect(enrolled.body.data.recoveryCodes).toHaveLength(10);
    const cookies = String(enrolled.headers['set-cookie']); expect(cookies).toContain('HttpOnly'); expect(cookies).toContain('SameSite=Lax');
    expect(JSON.stringify(enrolled.body)).not.toContain('tokenDigest');
    token = await csrf();
    await api.get('/api/v1/admin/catalog/businesses').expect(200);
    for (const path of ['/api/v1/admin/crm/owners','/API/V1/ADMIN/CRM/OWNERS/']) {
      await api.post(path).set('Origin',f.origin).send({}).expect(403);
      await api.post(path).set('Origin',f.origin).set('X-CSRF-Token',token).set('Sec-Fetch-Site','cross-site').send({}).expect(403);
    }
    const reason = 'TEST ONLY independently reviewed fixture';
    const owner = (await write('post','/api/v1/admin/crm/owners',token,{dataScope:'production',displayName:'TEST ONLY CRM',accountId:null,notes:null,reason}).expect(201)).body.data;
    await write('put',`/api/v1/admin/crm/owners/${owner.id}/phone`,token,{expectedVersion:1,phone:'+7 (000) 000-00-01',reason}).expect(200);
    const list = (await api.get('/api/v1/admin/crm/owners?dataScope=production').expect(200)).body;
    expect(list.data.items[0].phone).toEqual({visibility:'hidden',hasValue:true}); expect(JSON.stringify(list)).not.toContain('000-00');
    const reveal = (await write('post',`/api/v1/admin/crm/owners/${owner.id}/reveal-phone`,token,{reason}).expect(200)).body.data;
    expect(reveal.phone).toBe('+7 (000) 000-00-01');
    expect((await f.setup.query('SELECT action FROM audit_events WHERE id=$1',[reveal.auditId])).rows[0].action).toBe('owner.phone-reveal');
    const phoneStore = (await f.setup.query('SELECT phone_encrypted FROM owner_crm WHERE id=$1',[owner.id])).rows[0]; expect(JSON.stringify(phoneStore)).not.toContain(reveal.phone);
    await write('patch',`/api/v1/admin/crm/owners/${owner.id}`,token,{expectedVersion:1,displayName:'stale',notes:null,reason}).expect(409);
    const draftBody={expectedVersion:null,document:{kind:'section',title:'TEST ONLY title',blocks:[{kind:'paragraph',text:'TEST ONLY content'}]},changeNote:reason};
    const draft=(await write('put','/api/v1/admin/cms/homepage',token,draftBody).expect(200)).body.data;
    await anon.get('/api/v1/content/homepage').expect(404);
    await write('put','/api/v1/admin/cms/homepage',token,draftBody).expect(409);
    await write('post','/api/v1/admin/cms/homepage/publish',token,{expectedVersion:1,revisionId:draft.id}).expect(200);
    expect((await anon.get('/api/v1/content/homepage').expect(200)).body.data.document.title).toBe('TEST ONLY title');
    await write('put','/api/v1/admin/cms/homepage',token,{...draftBody,expectedVersion:1,document:{kind:'section',title:'<script>bad</script>',blocks:[]}}).expect(400);
    // Real decoding + immutable approved-reference serving.
    const raster=await sharp({create:{width:4,height:4,channels:3,background:'#336699'}}).png().toBuffer();
    const ticket=(await write('post','/api/v1/admin/media',token,{purpose:'business-photo',mime:'image/png',byteLength:raster.length,sha256:createHash('sha256').update(raster).digest('hex'),rightsConfirmed:true,attribution:'TEST ONLY',license:'fixture'}).expect(201)).body.data;
    expect(Date.parse(ticket.expiresAt)-Date.now()).toBeGreaterThan(290000);
    expect(Date.parse(ticket.expiresAt)-Date.now()).toBeLessThanOrEqual(300000);
    const uploaded=(await api.put(`/api/v1/admin/media/${ticket.id}/content`).set('Origin',f.origin).set('X-CSRF-Token',token).set('Content-Type','image/png').send(raster).expect(200)).body.data;
    expect(uploaded.mime).toBe('image/webp'); expect(uploaded.width).toBe(4);
    const expired=(await write('post','/api/v1/admin/media',token,{purpose:'content-image',mime:'image/png',byteLength:raster.length,sha256:createHash('sha256').update(raster).digest('hex'),rightsConfirmed:true,attribution:'TEST ONLY',license:'fixture'}).expect(201)).body.data;
    await f.setup.query('UPDATE media_assets SET expires_at=now() WHERE id=$1',[expired.id]);
    await api.put(`/api/v1/admin/media/${expired.id}/content`).set('Origin',f.origin).set('X-CSRF-Token',token).set('Content-Type','image/png').send(raster).expect(404);
    expect((await f.setup.query('SELECT state,storage_key FROM media_assets WHERE id=$1',[expired.id])).rows[0]).toEqual({state:'awaiting-upload',storage_key:null});
    expect((await f.setup.query("SELECT count(*)::int n FROM audit_events WHERE resource_id=$1 AND action='media.ready'",[expired.id])).rows[0].n).toBe(0);
    await anon.get(`/media/${ticket.id}.webp`).expect(404);
    const imageDraft=(await write('put','/api/v1/admin/cms/homepage',token,{...draftBody,expectedVersion:1,document:{kind:'section',title:'With image',blocks:[{kind:'image',asset:{source:'uploaded',mediaId:ticket.id,url:uploaded.url,alt:'TEST ONLY image'},caption:null}]}}).expect(200)).body.data;
    await write('post','/api/v1/admin/cms/homepage/publish',token,{expectedVersion:2,revisionId:imageDraft.id}).expect(200);
    await anon.get(`/media/${ticket.id}.webp`).expect(200).expect('Content-Type',/image\/webp/).expect('X-Content-Type-Options','nosniff');
    await anon.get('/media/..%2f..%2fpackage.json').expect(404);
    // Ordinary active user cannot become admin by injecting role or substituting an object id.
    const ordinary=await new AccountsRepository(f.setup).createUser({email:'ordinary@fixture.invalid',passwordPhc:await new PasswordHasher().hash('TEST ONLY ordinary password'),displayName:'TEST ONLY user',termsVersion:'test1',privacyVersion:'test1'});
    const userApi=request.agent(f.app.getHttpServer());
    let uToken=(await userApi.get('/api/v1/auth/csrf').set('Origin',f.origin).expect(200)).body.data.token;
    await userApi.post('/api/v1/auth/login').set('Origin',f.origin).set('X-CSRF-Token',uToken).send({email:ordinary.email,password:'TEST ONLY ordinary password',roles:['super-admin']}).expect(400);
    await userApi.post('/api/v1/auth/login').set('Origin',f.origin).set('X-CSRF-Token',uToken).send({email:ordinary.email,password:'TEST ONLY ordinary password'}).expect(200);
    await userApi.get(`/api/v1/admin/crm/owners/${owner.id}`).expect(403);
    uToken=(await userApi.get('/api/v1/auth/csrf').set('Origin',f.origin).expect(200)).body.data.token;
    await userApi.post(`/api/v1/admin/crm/owners/${owner.id}/reveal-phone`).set('Origin',f.origin).set('X-CSRF-Token',uToken).send({reason}).expect(403);
    // Business writes are drafts; publication is a separately guarded permission.
    const provenance={sourceId:'osm',sourceRecordId:'TEST ONLY isolated manual record',sourceUrl:null,license:'ODbL-1.0',attribution:'© OpenStreetMap contributors',sourceUpdatedAt:null,importedAt:new Date().toISOString()};
    const createBusiness={organization:{name:'TEST ONLY business',cityId:'smolensk',categoryIds:['cafe'],address:'TEST ONLY address',coordinates:{lon:32.0453,lat:54.7826},description:null,phone:null,website:null,openingHours:null},addressParts:{street:'TEST ONLY street',house:null},provenance:[provenance],photos:[{source:'uploaded',mediaId:ticket.id,url:uploaded.url,alt:'TEST ONLY licensed fixture image'}],reason};
    const business=(await write('post','/api/v1/admin/catalog/businesses',token,createBusiness).expect(201)).body.data;
    expect(business.status).toBe('draft');
    expect((await f.setup.query('SELECT active FROM places WHERE id=$1',[business.id])).rows[0].active).toBe(false);
    await write('post',`/api/v1/admin/catalog/businesses/${business.id}/publish`,token,{expectedVersion:1}).expect(200);
    const publicPlace=(await anon.get(`/api/v1/places/manual-${business.id}`).set('Host','attacker.invalid').expect(200)).body.data;
    expect(publicPlace.photos).toEqual([{url:`${f.origin}/media/${ticket.id}.webp`,alt:'TEST ONLY licensed fixture image',attribution:'TEST ONLY',license:'fixture',sourceUrl:null}]);
    const near=(await anon.get('/api/v1/places/near?city=smolensk&lon=32.0453&lat=54.7826&radius=300').expect(200)).body.data;
    expect(near.items[0].photos).toEqual(publicPlace.photos);
    const update={...createBusiness,photos:[],expectedVersion:2,organization:{...createBusiness.organization,name:'TEST ONLY unpublished changed name'}};
    await write('put',`/api/v1/admin/catalog/businesses/${business.id}`,token,update).expect(200);
    expect((await f.setup.query('SELECT name FROM places WHERE id=$1',[business.id])).rows[0].name).toBe('TEST ONLY business');
    expect((await anon.get(`/api/v1/places/manual-${business.id}`).expect(200)).body.data.photos).toEqual(publicPlace.photos);
    await write('post',`/api/v1/admin/catalog/businesses/${business.id}/publish`,token,{expectedVersion:3}).expect(200);
    expect((await f.setup.query('SELECT name FROM places WHERE id=$1',[business.id])).rows[0].name).toBe(update.organization.name);
    expect((await anon.get(`/api/v1/places/manual-${business.id}`).expect(200)).body.data.photos).toEqual([]);
    // Revocation/security version checked on every request.
    const session=(await f.setup.query('SELECT token_digest FROM auth_sessions WHERE user_id=$1 AND revoked_at IS NULL',[f.account.id])).rows[0]; expect(session.token_digest).toMatch(/^[a-f0-9]{64}$/);
    await write('post','/api/v1/auth/logout',token,{}).expect(200); await api.get('/api/v1/admin/catalog/businesses').expect(401);
    expect((await f.setup.query('SELECT count(*)::int n FROM auth_sessions WHERE user_id=$1 AND revoked_at IS NULL',[f.account.id])).rows[0].n).toBe(0);
    expect((await f.setup.query("SELECT count(*)::int n FROM audit_events WHERE outcome='denied'")).rows[0].n).toBeGreaterThan(5);
  } finally { await f.cleanup(); }
},60000);

it.runIf(process.env.API_ACCOUNTS_TEST === '1')('anonymous denials have shared prelookup admission and bounded audit, Redis outage stays closed',async()=>{
  const f=await createAccountFixture();
  try{
    const consume=f.runtime.rate.consume.bind(f.runtime.rate);let ingress=0;
    f.runtime.rate.consume=async(scope,subject,max,window)=>{if(scope==='ingress')ingress++;return consume(scope,subject,scope==='ingress'?3:max,window);};
    const api=request(f.app.getHttpServer());
    for(let n=0;n<3;n++)await api.get('/API/V1/ADMIN/CATALOG/BUSINESSES/').expect(401);
    const before=(await f.setup.query("SELECT count(*)::int n FROM audit_events WHERE outcome='denied'")).rows[0].n;
    expect(before).toBe(3);
    for(let n=0;n<2;n++)await api.get('/api/v1/admin/catalog/businesses').expect(429);
    expect(ingress).toBe(5);
    expect((await f.setup.query("SELECT count(*)::int n FROM audit_events WHERE outcome='denied'")).rows[0].n).toBe(before);
    await f.runtime.rate.close();await api.get('/api/v1/admin/catalog/businesses').expect(503);
    expect((await f.setup.query("SELECT count(*)::int n FROM audit_events WHERE outcome='denied'")).rows[0].n).toBe(before);
  }finally{await f.cleanup();}
},60000);

it.runIf(process.env.API_ACCOUNTS_TEST === '1')('real MFA replay and concurrent recovery consumption never grant administrative assurance', async()=>{
  const f=await createAccountFixture();
  try {
    const api=request.agent(f.app.getHttpServer());
    const csrf=async(client=api)=>(await client.post('/api/v1/auth/csrf').set('Origin',f.origin).send({}).expect(200)).body.data.token as string;
    const post=(client:ReturnType<typeof request.agent>,path:string,token:string,body:object)=>client.post(path).set('Origin',f.origin).set('X-CSRF-Token',token).send(body);
    let token=await csrf();await post(api,'/api/v1/auth/login',token,{email:f.account.email,password:f.password}).expect(200);
    token=await csrf();const enrollment=(await post(api,'/api/v1/auth/mfa/enrollment',token,{}).expect(200)).body.data;
    token=await csrf();const code=totp(enrollment.secret,Math.floor(Date.now()/30000));
    const enrolled=(await post(api,'/api/v1/auth/mfa/enrollment/verify',token,{code}).expect(200)).body.data;
    token=await csrf();await post(api,'/api/v1/auth/logout',token,{}).expect(200);
    token=await csrf();await post(api,'/api/v1/auth/login',token,{email:f.account.email,password:f.password}).expect(200);token=await csrf();
    await post(api,'/api/v1/auth/mfa/verify',token,{factor:'totp',code}).expect(401);
    await api.get('/api/v1/admin/catalog/businesses').expect(401);
    const peer=request.agent(f.app.getHttpServer());let peerToken=await csrf(peer);
    await post(peer,'/api/v1/auth/login',peerToken,{email:f.account.email,password:f.password}).expect(200);peerToken=await csrf(peer);
    const recovered=await Promise.all([post(api,'/api/v1/auth/mfa/verify',token,{factor:'recovery',code:enrolled.recoveryCodes[0]}),post(peer,'/api/v1/auth/mfa/verify',peerToken,{factor:'recovery',code:enrolled.recoveryCodes[0]})]);
    expect(recovered.map(v=>v.status).sort()).toEqual([200,401]);
    const winner=recovered[0]!.status===200?api:peer;
    expect(recovered.find(v=>v.status===200)!.body.data.session.assurance).toBe('recovery');
    await winner.get('/api/v1/admin/catalog/businesses').expect(403);
    const winnerToken=await csrf(winner);
    await post(winner,'/api/v1/auth/step-up',winnerToken,{password:f.password,totp:code}).expect(403);
    expect((await f.setup.query('SELECT count(*)::int n FROM recovery_codes WHERE user_id=$1 AND consumed_at IS NOT NULL',[f.account.id])).rows[0].n).toBe(1);
    await post(winner,'/api/v1/auth/mfa/enrollment',winnerToken,{}).expect(200);
    // Two Redis clients share the operator privacy budget; no plaintext phone/IP keys.
    const namespace=`test:reveal:${randomUUID()}`;
    const first=new AccountRedisRate(f.runtime.config.redisUrl!,f.runtime.config.rateKey!,namespace),second=new AccountRedisRate(f.runtime.config.redisUrl!,f.runtime.config.rateKey!,namespace);
    await first.connect();await second.connect();
    try{for(let n=0;n<10;n++)await(n%2?first:second).consume('phone-reveal',f.account.id,10,3600000);await expect(first.consume('phone-reveal',f.account.id,10,3600000)).rejects.toMatchObject({code:'RATE_LIMITED'});await expect(second.consume('phone-reveal',f.account.id,10,3600000)).rejects.toMatchObject({code:'RATE_LIMITED'});}finally{await first.close();await second.close();}
    // Redis disconnected: even a valid private operation has no fallback.
    await f.runtime.rate.close(); await winner.get('/api/v1/auth/csrf').set('Origin',f.origin).expect(503);
  }finally{await f.cleanup();}
},60000);

it.runIf(process.env.API_ACCOUNTS_TEST === '1')('real runtime-role HTTP manual monthly agreement, idempotency and entitlement separation', async () => {
  const f=await createAccountFixture();
  let databaseFailure:string|null=null; const original=f.admin.execute.bind(f.admin);
  f.admin.execute=async(...args)=>{try{return await original(...args);}catch(error){const e=error as {code?:string;message?:string};databaseFailure=`${e.code}:${e.message}`;throw error;}};
  try {
    const api=request.agent(f.app.getHttpServer());
    const csrf=async()=> (await api.post('/api/v1/auth/csrf').set('Origin',f.origin).send({}).expect(200)).body.data.token as string;
    const write=(method:'post'|'put'|'patch'|'delete',path:string,token:string,body:object)=>api[method](path).set('Origin',f.origin).set('X-CSRF-Token',token).send(body);
    let token=await csrf();await write('post','/api/v1/auth/login',token,{email:f.account.email,password:f.password}).expect(200);
    token=await csrf();const enrollment=(await write('post','/api/v1/auth/mfa/enrollment',token,{}).expect(200)).body.data;
    token=await csrf();await write('post','/api/v1/auth/mfa/enrollment/verify',token,{code:totp(enrollment.secret,Math.floor(Date.now()/30000))}).expect(200);token=await csrf();
    const reason='TEST ONLY independently verified monthly fixture';
    const owner=(await write('post','/api/v1/admin/crm/owners',token,{dataScope:'production',displayName:'TEST ONLY monthly CRM',accountId:null,notes:null,reason}).expect(201)).body.data;
    const business=(await write('post','/api/v1/admin/catalog/businesses',token,{organization:{name:'TEST ONLY monthly business',cityId:'smolensk',categoryIds:['cafe'],address:'TEST ONLY address',coordinates:{lon:32.0453,lat:54.7826},description:null,phone:null,website:null,openingHours:null},addressParts:{street:'TEST ONLY street',house:null},provenance:[{sourceId:'osm',sourceRecordId:'TEST ONLY monthly record',sourceUrl:null,license:'ODbL-1.0',attribution:'© OpenStreetMap contributors',sourceUpdatedAt:null,importedAt:new Date().toISOString()}],photos:[],reason}).expect(201)).body.data;
    const ordinary=await new AccountsRepository(f.setup).createUser({email:'monthly@fixture.invalid',passwordPhc:await new PasswordHasher().hash('TEST ONLY monthly password'),displayName:'TEST ONLY monthly applicant',termsVersion:'test1',privacyVersion:'test1'});
    const userApi=request.agent(f.app.getHttpServer());let uToken=(await userApi.post('/api/v1/auth/csrf').set('Origin',f.origin).send({}).expect(200)).body.data.token;
    await userApi.post('/api/v1/auth/login').set('Origin',f.origin).set('X-CSRF-Token',uToken).send({email:ordinary.email,password:'TEST ONLY monthly password'}).expect(200);uToken=(await userApi.post('/api/v1/auth/csrf').set('Origin',f.origin).send({}).expect(200)).body.data.token;
    // A normal applicant requests a quote; only independent MFA admin can record funds.
    const listing=(await userApi.post('/api/v1/business/listings').set('Origin',f.origin).set('X-CSRF-Token',uToken).send({placeId:business.id,placementRequest:'TEST ONLY monthly listing request',termsConsent:true}).expect(202)).body.data;
    const quote=(await write('post',`/api/v1/admin/listings/${listing.id}/quote`,token,{expectedVersion:1,amountRub:123,terms:'TEST ONLY monthly quote, not configured product price'}).expect(200)).body.data;
    expect(quote.quoteId).toMatch(/^[a-f0-9-]{36}$/);
    const anchor=new Date(Date.now()-10000); anchor.setUTCMilliseconds(0);
    const end=new Date(anchor);end.setUTCMonth(end.getUTCMonth()+1);
    const agreementBody={expectedVersion:2,quoteId:quote.quoteId,ownerId:owner.id,acceptedBy:'TEST ONLY independently checked applicant',acceptedAt:new Date(anchor.getTime()-1000).toISOString(),channel:'telegram',agreementReference:'TEST ONLY external agreement reference',verificationNote:reason,billingTimezone:'Europe/Moscow',billingAnchorAt:anchor.toISOString(),idempotencyKey:randomUUID()};
    const agreement=(await write('post',`/api/v1/admin/listings/${listing.id}/agreement`,token,agreementBody).expect(201)).body.data;
    const paymentBody={expectedVersion:3,quoteId:quote.quoteId,agreementReference:agreementBody.agreementReference,receiptReference:'TEST ONLY received funds '+randomUUID(),amountRub:123,currency:'RUB',receivedAt:new Date(anchor.getTime()+1000).toISOString(),periodStartsAt:anchor.toISOString(),periodEndsAt:end.toISOString(),reason,idempotencyKey:randomUUID()};
    await userApi.post(`/api/v1/admin/listings/${listing.id}/manual-payment`).set('Origin',f.origin).set('X-CSRF-Token',uToken).send(paymentBody).expect(403);
    const paymentResponse=await write('post',`/api/v1/admin/listings/${listing.id}/manual-payment`,token,paymentBody);
    expect(paymentResponse.status,databaseFailure??'manual payment HTTP').toBe(200);
    const receipt=paymentResponse.body.data;
    expect(receipt.paymentState).toBe('manually-confirmed');expect(receipt.placementState).toBe('pending-review');
    await write('post',`/api/v1/admin/listings/${listing.id}/manual-payment`,token,paymentBody).expect(200);
    await write('post',`/api/v1/admin/listings/${listing.id}/manual-payment`,token,{...paymentBody,amountRub:124}).expect(409);
    expect((await f.setup.query('SELECT count(*)::int n FROM manual_subscription_payments WHERE listing_id=$1',[listing.id])).rows[0].n).toBe(1);
    const funded=(await api.get(`/api/v1/admin/crm/owners/${owner.id}`).expect(200)).body.data.fundedSubscriptionSummary;
    expect(funded).toBeNull(); // Funds alone never prove ownership/content approval.
    expect(agreement.id).toMatch(/^[a-f0-9-]{36}$/);
    const lookupPath=`/api/v1/admin/listings/${listing.id}`;
    await request(f.app.getHttpServer()).get(lookupPath).expect(401);
    await userApi.get(lookupPath).expect(403);
    const lookup=(await api.get(lookupPath).expect(200)).body.data;
    expect(lookup.listing.id).toBe(listing.id);expect(lookup.listing.version).toBe(receipt.version);
    expect(lookup.currentQuote.id).toBe(quote.quoteId);expect(lookup.currentAgreement.id).toBe(agreement.id);
    expect(lookup.ownerId).toBe(owner.id);expect(lookup.fundedSubscriptionSummary).toBeNull();
    expect(JSON.stringify(lookup)).not.toMatch(/phone|password|tokenDigest|csrfDigest/);
    const found=(await api.get('/API/V1/ADMIN/LISTINGS/').query({q:'monthly business',ownerId:owner.id,placeId:business.id,status:'pending-review',page:'1',limit:'1'}).expect(200)).body.data;
    expect(found.items.map((v:{listing:{id:string}})=>v.listing.id)).toEqual([listing.id]);expect(found.pagination.total).toBe(1);
    const page2=(await api.get('/api/v1/admin/listings').query({placeId:business.id,page:'2',limit:'1'}).expect(200)).body.data;
    expect(page2.items).toEqual([]);expect(page2.pagination.total).toBe(1);
    for(const q of ['%','_',"' OR 1=1 --"]){const noMatch=(await api.get('/api/v1/admin/listings').query({q:q.length===1?q+q:q}).expect(200)).body.data;expect(noMatch.items).toEqual([]);}
    for(const suffix of ['?page=101','?limit=51','?q=x','?ownerId=all','?status=paid','?unknown=1','?page=1&page=2','?q=a&q=b'])await api.get('/api/v1/admin/listings'+suffix).expect(400);
    await api.get('/api/v1/admin/listings/'+randomUUID()).expect(404);
    // Authenticated editors cannot impersonate the original author or auto-publish a correction.
    const originalText='TEST ONLY genuine disposable author text';
    const review=(await f.setup.query("INSERT INTO account_reviews(author_id,kind,place_id,rating,original_text,text,status,published_at) VALUES($1,'place',$2,4,$3,$3,'published',now()) RETURNING id",[ordinary.id,business.id,originalText])).rows[0];
    const editor=(await api.get(`/api/v1/admin/reviews/${review.id}/editor`).expect(200)).body.data;
    expect(editor.originalText).toBe(originalText);expect(editor.review.authorId).toBe(ordinary.id);
    const correction=(await write('post',`/api/v1/admin/reviews/${review.id}/corrections`,token,{expectedVersion:1,correctedText:'TEST ONLY disclosed editorial correction',reason}).expect(200)).body.data;
    expect(correction.authorId).toBe(ordinary.id);expect(correction.originalText).toBe(originalText);expect(correction.editorId).toBe(f.account.id);
    const stored=(await f.setup.query('SELECT original_text,status,published_at FROM account_reviews WHERE id=$1',[review.id])).rows[0];
    expect(stored).toEqual({original_text:originalText,status:'pending',published_at:null});
    const queue=(await api.get('/api/v1/admin/moderation?kind=place-review&page=1&limit=20').expect(200)).body.data;
    expect(queue.items[0].id).toBe(review.id);
    await write('post',`/api/v1/admin/moderation/place-review/${review.id}/decision`,token,{decision:'approve',expectedVersion:2,note:reason}).expect(403);
    expect((await f.setup.query('SELECT status,version,published_at FROM account_reviews WHERE id=$1',[review.id])).rows[0]).toEqual({status:'pending',version:2,published_at:null});
    const moderatorPassword='TEST ONLY independent moderator password';
    const moderator=await new AccountsRepository(f.setup).createUser({email:'moderator@fixture.invalid',passwordPhc:await new PasswordHasher().hash(moderatorPassword),displayName:'TEST ONLY independent moderator',termsVersion:'test1',privacyVersion:'test1'});
    // Identity/role fixtures are created only in this validated disposable database.
    await f.setup.query('UPDATE users SET email_verified_at=now() WHERE id=$1',[moderator.id]);
    await f.setup.query("INSERT INTO user_roles(user_id,role) VALUES($1,'moderator')",[moderator.id]);
    const moderatorApi=request.agent(f.app.getHttpServer());
    const moderatorCsrf=async()=>(await moderatorApi.post('/api/v1/auth/csrf').set('Origin',f.origin).send({}).expect(200)).body.data.token as string;
    const moderatorPost=(path:string,csrfToken:string,body:object)=>moderatorApi.post(path).set('Origin',f.origin).set('X-CSRF-Token',csrfToken).send(body);
    let mToken=await moderatorCsrf();await moderatorPost('/api/v1/auth/login',mToken,{email:moderator.email,password:moderatorPassword}).expect(200);
    mToken=await moderatorCsrf();const mEnrollment=(await moderatorPost('/api/v1/auth/mfa/enrollment',mToken,{}).expect(200)).body.data;
    mToken=await moderatorCsrf();await moderatorPost('/api/v1/auth/mfa/enrollment/verify',mToken,{code:totp(mEnrollment.secret,Math.floor(Date.now()/30000))}).expect(200);mToken=await moderatorCsrf();
    const approved=(await moderatorPost(`/api/v1/admin/moderation/place-review/${review.id}/decision`,mToken,{decision:'approve',expectedVersion:2,note:reason}).expect(200)).body.data;
    expect(approved.review.authorId).toBe(ordinary.id);expect(approved.review.status).toBe('published');
    await moderatorApi.get(lookupPath).expect(403);
    await f.setup.query("DELETE FROM user_roles WHERE user_id=$1 AND role='moderator'",[moderator.id]);
    await f.setup.query("INSERT INTO user_roles(user_id,role) VALUES($1,'support')",[moderator.id]);
    await moderatorApi.get('/api/v1/admin/listings').expect(403);
    await f.setup.query("DELETE FROM user_roles WHERE user_id=$1 AND role='support'",[moderator.id]);
    await f.setup.query("INSERT INTO user_roles(user_id,role) VALUES($1,'business-manager')",[moderator.id]);
    await moderatorApi.get(lookupPath).expect(200);
  } finally { await f.cleanup(); }
},60000);
