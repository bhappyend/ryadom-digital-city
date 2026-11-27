import { it, expect } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AccountsRepository } from '@ryadom/db/compiled';
import { createAccountFixture } from './account-fixture.js';
import { totp } from '../src/account-crypto.js';

it.runIf(process.env.API_ACCOUNTS_TEST === '1')('real onboarding, independent ownership decisions and manually funded publication', async () => {
  const f=await createAccountFixture();
  try {
    const reason='TEST ONLY independently checked fixture evidence';
    const exec=(id:string,body:unknown={},params:Record<string,string>={},actorId=f.account.id,query:Record<string,unknown>={})=>f.admin.execute(id,{body,params,query},{actorId,requestId:randomUUID()}) as Promise<any>;
    for(const key of ['terms','privacy']){
      const draft=await exec('writeCmsDraft',{expectedVersion:null,document:{kind:'legal',title:'TEST ONLY policy',documentVersion:'fixture1',paragraphs:['TEST ONLY consent text']},changeNote:reason},{key});
      await exec('publishCms',{expectedVersion:draft.version,revisionId:draft.id},{key});
    }
    const operator=request.agent(f.app.getHttpServer()),applicant=request.agent(f.app.getHttpServer()),anon=request(f.app.getHttpServer());
    const csrf=async(agent:typeof operator)=>(await agent.post('/api/v1/auth/csrf').set('Origin',f.origin).send({}).expect(200)).body.data.token as string;
    const post=(agent:typeof operator,path:string,token:string,body:object)=>agent.post(`/api/v1${path}`).set('Origin',f.origin).set('X-CSRF-Token',token).send(body);
    await post(applicant,'/auth/register',await csrf(applicant),{}).expect(503);
    let adminToken=await csrf(operator);
    await post(operator,'/auth/login',adminToken,{email:f.account.email,password:f.password}).expect(200);
    adminToken=await csrf(operator);
    const enrollment=(await post(operator,'/auth/mfa/enrollment',adminToken,{}).expect(200)).body.data;
    adminToken=await csrf(operator);
    await post(operator,'/auth/mfa/enrollment/verify',adminToken,{code:totp(enrollment.secret,Math.floor(Date.now()/30000))}).expect(200);
    adminToken=await csrf(operator);
    const owner=await exec('createCrmOwner',{dataScope:'production',displayName:'TEST ONLY actual applicant',accountId:null,notes:null,reason});
    const access=(await post(operator,`/admin/crm/owners/${owner.id}/access`,adminToken,{mode:'create',expectedVersion:1,email:'actual-applicant@fixture.invalid',password:'TEST ONLY actual provisioned password',reason}).expect(200)).body.data;
    const applicantId=access.accountId;
    let userToken=await csrf(applicant);
    const authentication=(await post(applicant,'/auth/login',userToken,{email:'actual-applicant@fixture.invalid',password:'TEST ONLY actual provisioned password'}).expect(200)).body.data;
    expect(authentication.account).toMatchObject({emailVerified:false,mfaEnrolled:false,roles:['user'],consents:[]});
    userToken=await csrf(applicant);
    const business=await exec('createCatalogBusiness',{organization:{name:'TEST ONLY claim place',cityId:'smolensk',categoryIds:['cafe'],address:'TEST ONLY address',coordinates:{lon:32.0453,lat:54.7826},description:null,phone:null,website:null,openingHours:null},addressParts:{street:'TEST ONLY street',house:null},provenance:[{sourceId:'osm',sourceRecordId:randomUUID(),sourceUrl:null,license:'ODbL-1.0',attribution:'© OpenStreetMap contributors',sourceUpdatedAt:null,importedAt:new Date().toISOString()}],photos:[],reason});
    await exec('publishCatalogBusiness',{expectedVersion:business.version},{placeId:business.id});
    const claimBody={placeId:business.id,relationship:'owner',evidenceText:reason,consent:true};
    await anon.post('/api/v1/business/claims').send(claimBody).expect(401);
    const claim=(await post(applicant,'/business/claims',userToken,claimBody).expect(202)).body.data;
    await post(applicant,'/business/claims',userToken,claimBody).expect(409);
    const own=(await applicant.get('/api/v1/business/claims').expect(200)).body.data.items;
    expect(own).toHaveLength(1);expect(own[0].id).toBe(claim.id);expect(JSON.stringify(own)).not.toContain(reason);
    await applicant.get('/api/v1/admin/claims').expect(403);
    const queue=(await operator.get('/api/v1/admin/claims').expect(200)).body.data.items;
    expect(queue[0]).toMatchObject({applicantId,relationship:'owner',evidenceText:reason});
    const decision={expectedVersion:claim.version,decision:'verify',verificationMethod:'independent_registry',verificationNote:reason};
    await post(operator,`/admin/claims/${claim.id}/decision`,adminToken,{...decision,verificationMethod:'insufficient_evidence'}).expect(400);
    await post(operator,`/admin/claims/${claim.id}/decision`,adminToken,{...decision,expectedVersion:99}).expect(409);
    const verified=(await post(operator,`/admin/claims/${claim.id}/decision`,adminToken,decision).expect(200)).body.data;
    expect(verified.claim.status).toBe('verified');expect(verified.claim.businessId).toBeTruthy();
    expect((await f.setup.query('SELECT active FROM business_memberships WHERE user_id=$1',[applicantId])).rows).toEqual([{active:true}]);
    const unchanged=await new AccountsRepository(f.setup).getAccount(applicantId);
    expect(unchanged).toMatchObject({emailVerified:false,mfaEnrolled:false,roles:['user']});
    // Owner-sensitive self mutations keep identity+MFA guards even after business verification.
    await applicant.get(`/api/v1/business/${verified.claim.businessId}/branches`).expect(403);
    const listing=(await post(applicant,'/business/listings',userToken,{placeId:business.id,placementRequest:reason,termsConsent:true}).expect(202)).body.data;
    expect(listing.ownershipState).toBe('verified');
    const quoted=(await post(operator,`/admin/listings/${listing.id}/quote`,adminToken,{expectedVersion:listing.version,amountRub:123,terms:reason}).expect(200)).body.data;
    const anchor=new Date(Date.now()-60000);anchor.setUTCMilliseconds(0);const end=new Date(anchor);end.setUTCMonth(end.getUTCMonth()+1);
    const reference=`TEST ONLY agreement ${randomUUID()}`;
    const agreement=(await post(operator,`/admin/listings/${listing.id}/agreement`,adminToken,{expectedVersion:quoted.version,quoteId:quoted.quoteId,ownerId:owner.id,acceptedBy:'TEST ONLY applicant',acceptedAt:new Date(anchor.getTime()-1000).toISOString(),channel:'telegram',agreementReference:reference,verificationNote:reason,billingTimezone:'Europe/Moscow',billingAnchorAt:anchor.toISOString(),idempotencyKey:randomUUID()}).expect(201)).body.data;
    await post(operator,`/admin/listings/${listing.id}/decision`,adminToken,{expectedVersion:agreement.version,decision:'approve',note:reason}).expect(409);
    const paid=(await post(operator,`/admin/listings/${listing.id}/manual-payment`,adminToken,{expectedVersion:agreement.version,quoteId:quoted.quoteId,agreementReference:reference,receiptReference:`TEST ONLY receipt ${randomUUID()}`,amountRub:123,currency:'RUB',receivedAt:anchor.toISOString(),periodStartsAt:anchor.toISOString(),periodEndsAt:end.toISOString(),reason,idempotencyKey:randomUUID()}).expect(200)).body.data;
    expect(paid.subscription.status).toBe('pending');
    expect((await operator.get(`/api/v1/admin/crm/owners/${owner.id}`).expect(200)).body.data.fundedSubscriptionSummary).toBeNull();
    const published=(await post(operator,`/admin/listings/${listing.id}/decision`,adminToken,{expectedVersion:paid.version,decision:'approve',note:reason}).expect(200)).body.data;
    expect(published).toMatchObject({placementState:'published',ownershipState:'verified',subscription:{status:'active'}});
    const summary=(await operator.get(`/api/v1/admin/crm/owners/${owner.id}`).expect(200)).body.data.fundedSubscriptionSummary;
    expect(summary).toMatchObject({listingId:listing.id,fundingSource:'confirmed-funds',agreementId:agreement.id,subscription:{status:'active'}});
    expect((await f.setup.query('SELECT count(*)::int n FROM listing_review_decisions WHERE listing_id=$1',[listing.id])).rows[0].n).toBe(1);
    await post(operator,`/admin/listings/${listing.id}/decision`,adminToken,{expectedVersion:paid.version,decision:'approve',note:reason}).expect(409);
    const revoke=(await post(operator,`/admin/claims/${claim.id}/decision`,adminToken,{...decision,expectedVersion:verified.claim.version,decision:'revoke'}).expect(200)).body.data;
    expect(revoke.claim.status).toBe('revoked');
    const after=(await applicant.get('/api/v1/business/listings').expect(200)).body.data.items[0];
    expect(after).toMatchObject({placementState:'pending-review',ownershipState:'revoked',subscription:{status:'pending'}});
    expect((await operator.get(`/api/v1/admin/crm/owners/${owner.id}`).expect(200)).body.data.fundedSubscriptionSummary).toBeNull();
    expect((await f.setup.query('SELECT active FROM business_memberships WHERE user_id=$1',[applicantId])).rows).toEqual([{active:false}]);
    expect(await new AccountsRepository(f.setup).getAccount(applicantId)).toMatchObject({emailVerified:false,mfaEnrolled:false,roles:['user']});
  } finally {await f.cleanup();}
},120000);

it.runIf(process.env.API_ACCOUNTS_TEST === '1')('ownership transactions: competing claims, self review, scoped withdrawal and audit rollback', async()=>{
  const f=await createAccountFixture();
  try{
    const reason='TEST ONLY independent registry investigation';
    const exec=(id:string,body:unknown={},params:Record<string,string>={},actorId=f.account.id,query:Record<string,unknown>={})=>f.admin.execute(id,{body,params,query},{actorId,requestId:randomUUID()}) as Promise<any>;
    const accounts=new AccountsRepository(f.setup);
    const newUser=()=>accounts.createUser({email:`${randomUUID()}@fixture.invalid`,passwordPhc:'$argon2id$v=19$m=65536,t=3,p=1$test$test',displayName:'TEST ONLY active applicant',termsVersion:'fixture1',privacyVersion:'fixture1'});
    const [a,b]=await Promise.all([newUser(),newUser()]);
    const business=async()=>{
      const x=await exec('createCatalogBusiness',{organization:{name:'TEST ONLY independent place',cityId:'smolensk',categoryIds:['cafe'],address:'TEST ONLY address',coordinates:{lon:32.0453,lat:54.7826},description:null,phone:null,website:null,openingHours:null},addressParts:{street:'TEST ONLY street',house:null},provenance:[{sourceId:'osm',sourceRecordId:randomUUID(),sourceUrl:null,license:'ODbL-1.0',attribution:'© OpenStreetMap contributors',sourceUpdatedAt:null,importedAt:new Date().toISOString()}],photos:[],reason});
      await exec('publishCatalogBusiness',{expectedVersion:x.version},{placeId:x.id});return x;
    };
    const submit=(placeId:string,actorId:string)=>exec('createOwnershipClaim',{placeId,relationship:'authorized_representative',evidenceText:reason,consent:true},{},actorId);
    const decide=(id:string,version:number,actorId=f.account.id)=>exec('decideClaim',{expectedVersion:version,decision:'verify',verificationMethod:'existing_verified_contact',verificationNote:reason},{claimId:id},actorId);
    const ownPlace=await business(),own=await submit(ownPlace.id,f.account.id);
    await expect(decide(own.id,1)).rejects.toMatchObject({code:'FORBIDDEN'});
    const ownListing=await exec('applyPaidListing',{placeId:ownPlace.id,placementRequest:reason,termsConsent:true});
    await expect(exec('reviewListing',{expectedVersion:ownListing.version,decision:'approve',note:reason},{listingId:ownListing.id})).rejects.toMatchObject({code:'FORBIDDEN'});
    expect((await f.setup.query('SELECT status,version FROM owner_claims WHERE id=$1',[own.id])).rows[0]).toEqual({status:'pending',version:1});
    await expect(exec('withdrawClaim',{expectedVersion:1},{claimId:own.id},a.id)).rejects.toMatchObject({code:'NOT_FOUND'});
    expect((await exec('withdrawClaim',{expectedVersion:1},{claimId:own.id})).status).toBe('withdrawn');
    await expect(exec('withdrawClaim',{expectedVersion:1},{claimId:own.id})).rejects.toMatchObject({code:'CONFLICT'});
    const place=await business(),ca=await submit(place.id,a.id),cb=await submit(place.id,b.id);
    const results=await Promise.allSettled([decide(ca.id,1),decide(cb.id,1)]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
    expect((await f.setup.query("SELECT count(*)::int n FROM owner_claims WHERE place_id=$1 AND status='verified'",[place.id])).rows[0].n).toBe(1);
    expect((await f.setup.query('SELECT count(*)::int n FROM business_branches WHERE place_id=$1',[place.id])).rows[0].n).toBe(1);
    const winner=results.find(r=>r.status==='fulfilled') as PromiseFulfilledResult<any>;
    const loser=winner.value.applicantId===a.id?b:a;
    expect((await exec('listMyClaims',{}, {},loser.id,{page:100,limit:50})).pagination).toMatchObject({total:1,hasMore:false});
    expect((await exec('listMyClaims',{}, {},loser.id,{page:100,limit:50})).items).toEqual([]);
    const rollbackPlace=await business(),rollback=await submit(rollbackPlace.id,a.id);
    const before=(await f.setup.query("SELECT count(*)::int n FROM audit_events WHERE action='claim.verify'")).rows[0].n;
    await f.setup.query(`CREATE FUNCTION test_fail_claim_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='claim.verify' THEN RAISE EXCEPTION 'TEST ONLY audit storage failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER test_claim_audit_failure BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION test_fail_claim_audit()`);
    await expect(decide(rollback.id,1)).rejects.toBeTruthy();
    await f.setup.query('DROP TRIGGER test_claim_audit_failure ON audit_events; DROP FUNCTION test_fail_claim_audit()');
    expect((await f.setup.query('SELECT status,version,business_id FROM owner_claims WHERE id=$1',[rollback.id])).rows[0]).toEqual({status:'pending',version:1,business_id:null});
    expect((await f.setup.query('SELECT count(*)::int n FROM business_branches WHERE place_id=$1',[rollbackPlace.id])).rows[0].n).toBe(0);
    expect((await f.setup.query("SELECT count(*)::int n FROM audit_events WHERE action='claim.verify'")).rows[0].n).toBe(before);
    const suspendedPlace=await business(),suspended=await submit(suspendedPlace.id,b.id);
    await f.setup.query("UPDATE users SET status='suspended' WHERE id=$1",[b.id]);
    await expect(decide(suspended.id,1)).rejects.toMatchObject({code:'INVALID_STATE'});
    const ledger=(await f.setup.query('SELECT id FROM ownership_claim_decisions LIMIT 1')).rows[0].id;
    await expect(f.setup.query('DELETE FROM ownership_claim_decisions WHERE id=$1',[ledger])).rejects.toBeTruthy();
    const winnerId=winner.value.claim.id;
    await exec('decideClaim',{expectedVersion:2,decision:'revoke',verificationMethod:'independent_registry',verificationNote:reason},{claimId:winnerId});
    // An already verified competing applicant cannot silently retain a revoked membership.
    expect((await f.setup.query('SELECT active FROM business_memberships WHERE user_id=$1 AND business_id=$2',[winner.value.applicantId,winner.value.claim.businessId])).rows[0].active).toBe(false);
  }finally{await f.cleanup();}
},120000);
