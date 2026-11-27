import {it,expect} from 'vitest';
import request from 'supertest';
import {randomUUID} from 'node:crypto';
import {AccountsRepository} from '@ryadom/db/compiled';
import {createAccountFixture} from './account-fixture';
import {PasswordHasher,totp} from '../src/account-crypto';

it.runIf(process.env.API_ACCOUNTS_TEST==='1')('operator creates and resets CRM login without fabricated owner consent or staff reset',async()=>{
 const f=await createAccountFixture();
 try{
  const api=request.agent(f.app.getHttpServer()),login=request.agent(f.app.getHttpServer()),anon=request(f.app.getHttpServer());
  const csrf=async(agent:typeof api)=>(await agent.post('/api/v1/auth/csrf').set('Origin',f.origin).send({}).expect(200)).body.data.token;
  const post=(agent:typeof api,path:string,token:string,body:object)=>agent.post(`/api/v1${path}`).set('Origin',f.origin).set('X-CSRF-Token',token).send(body);
  const reason='TEST ONLY operator verified actual CRM contact';
  const exec=(id:string,body:unknown,params:Record<string,string>={})=>f.admin.execute(id,{body,params,query:{}},{actorId:f.account.id,requestId:randomUUID()}) as Promise<any>;
  const owner=await exec('createCrmOwner',{dataScope:'production',displayName:'TEST ONLY provisioned owner',accountId:null,notes:null,reason});
  const path=`/admin/crm/owners/${owner.id}/access`,password='TEST ONLY initial business password';
  const body={mode:'create',expectedVersion:1,email:'actual-owner@fixture.invalid',password,reason};
  await anon.post(`/api/v1${path}`).send(body).expect(401);
  await anon.post('/api/v1/auth/register').send({email:body.email,password}).expect(503);
  let token=await csrf(api);
  await post(api,'/auth/login',token,{email:f.account.email,password:f.password}).expect(200);
  token=await csrf(api);
  await post(api,path,token,body).expect(401);
  const enrollment=(await post(api,'/auth/mfa/enrollment',token,{}).expect(200)).body.data;
  token=await csrf(api);
  await post(api,'/auth/mfa/enrollment/verify',token,{code:totp(enrollment.secret,Math.floor(Date.now()/30000))}).expect(200);
  token=await csrf(api);
  await api.post(`/api/v1${path}`).set('Origin',f.origin).send(body).expect(403);
  await post(api,path,token,{...body,emailVerified:true}).expect(400);
  const created=await post(api,path,token,body).expect(200);
  const accountId=created.body.data.accountId;
  expect(created.body.data).toMatchObject({ownerId:owner.id,version:2,mode:'create',sessionsRevoked:false});
  expect(JSON.stringify(created.body)).not.toContain(password);
  const accounts=new AccountsRepository(f.setup),account=await accounts.getAccount(accountId);
  expect(account).toMatchObject({emailVerified:false,mfaEnrolled:false,roles:['user'],consents:[]});
  const stored=(await f.setup.query('SELECT password_phc FROM users WHERE id=$1',[accountId])).rows[0].password_phc;
  expect(stored).toMatch(/^\$argon2id\$/);expect(stored).not.toContain(password);expect(await new PasswordHasher().verify(password,stored)).toBe(true);
  expect((await f.setup.query('SELECT count(*)::int n FROM account_consents WHERE user_id=$1',[accountId])).rows[0].n).toBe(0);
  expect((await f.setup.query('SELECT count(*)::int n FROM business_memberships WHERE user_id=$1',[accountId])).rows[0].n).toBe(0);
  await post(api,path,token,body).expect(409);
  let loginToken=await csrf(login);
  await post(login,'/auth/login',loginToken,{email:body.email,password}).expect(200);
  await login.get('/api/v1/auth/me').expect(200);
  const resetPassword='TEST ONLY changed business password';
  const reset={...body,mode:'reset',expectedVersion:2,password:resetPassword};
  await post(api,path,token,{...reset,email:'other-owner@fixture.invalid'}).expect(409);
  const resetResponse=await post(api,path,token,reset).expect(200);
  expect(resetResponse.body.data).toMatchObject({version:3,mode:'reset',sessionsRevoked:true});
  await login.get('/api/v1/auth/me').expect(401);
  const fresh=request.agent(f.app.getHttpServer());loginToken=await csrf(fresh);
  await post(fresh,'/auth/login',loginToken,{email:body.email,password}).expect(401);
  await post(fresh,'/auth/login',loginToken,{email:body.email,password:resetPassword}).expect(200);
  const events=(await f.setup.query('SELECT mode,reason FROM owner_access_events WHERE owner_id=$1 ORDER BY owner_version',[owner.id])).rows;
  expect(events).toEqual([{mode:'create',reason},{mode:'reset',reason}]);expect(JSON.stringify(events)).not.toContain(password);
  await expect(f.setup.query('DELETE FROM owner_access_events WHERE owner_id=$1',[owner.id])).rejects.toBeTruthy();
  // Staff roles must be protected even if an existing CRM record references them.
  const staffOwner=await exec('createCrmOwner',{dataScope:'production',displayName:'TEST ONLY staff reference',accountId:f.account.id,notes:null,reason});
  await post(api,`/admin/crm/owners/${staffOwner.id}/access`,token,{...reset,expectedVersion:1,email:f.account.email}).expect(403);
  // Same owners:write permission is insufficient without an explicit Admin role.
  const manager=await accounts.createUser({email:'manager@fixture.invalid',passwordPhc:stored,displayName:'TEST ONLY manager',termsVersion:'test',privacyVersion:'test'});
  await f.setup.query("INSERT INTO user_roles(user_id,role) VALUES($1,'business-manager')",[manager.id]);
  await expect(f.admin.provisionOwnerAccess({ownerId:owner.id,mode:'reset',expectedVersion:3,email:body.email,passwordPhc:stored,reason},{actorId:manager.id,requestId:randomUUID()})).rejects.toMatchObject({code:'FORBIDDEN'});
  // Audit failure must roll back the new user, CRM link and owner version.
  const rollback=await exec('createCrmOwner',{dataScope:'production',displayName:'TEST ONLY rollback contact',accountId:null,notes:null,reason});
  await f.setup.query(`CREATE FUNCTION test_fail_access_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='owner.access.create' THEN RAISE EXCEPTION 'TEST ONLY audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER test_access_audit_failure BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION test_fail_access_audit()`);
  await expect(f.admin.provisionOwnerAccess({ownerId:rollback.id,mode:'create',expectedVersion:1,email:'rollback@fixture.invalid',passwordPhc:stored,reason},{actorId:f.account.id,requestId:randomUUID()})).rejects.toBeTruthy();
  expect((await f.setup.query('SELECT account_id,version FROM owner_crm WHERE id=$1',[rollback.id])).rows[0]).toEqual({account_id:null,version:1});
  expect(await accounts.findUserByEmail('rollback@fixture.invalid')).toBeNull();
 }finally{await f.cleanup();}
},120000);
