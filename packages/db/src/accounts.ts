import type { Pool, PoolClient } from 'pg';
import { AccountSchema, type Account, RoleListSchema } from '@ryadom/accounts-types';
import { withTransaction } from './pool';

export class DomainError extends Error {
 constructor(public readonly code:'NOT_FOUND'|'CONFLICT'|'FORBIDDEN'|'INVALID_STATE',message:string=code){super(message);this.name='DomainError';}
}
export type ActorContext={actorId:string|null;requestId:string};
export type EncryptedEnvelope={keyId:string;nonce:string;tag:string;ciphertext:string};
export type Database=Pool|PoolClient;
export async function atomic<T>(db:Database,fn:(client:PoolClient)=>Promise<T>):Promise<T>{
 return 'release' in db ? fn(db) : withTransaction(db,fn);
}
export async function audit(db:Database,ctx:ActorContext,action:string,resourceType:string,resourceId:string,fields:string[]=[]):Promise<string>{
 const r=await db.query('INSERT INTO audit_events(actor_id,request_id,action,resource_type,resource_id,changed_fields) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[ctx.actorId,ctx.requestId,action,resourceType,resourceId,fields]);return r.rows[0].id;
}
export type SessionInput={userId:string;tokenDigest:string;csrfDigest:string;assurance:'password'|'mfa'|'recovery';idleExpiresAt:string;absoluteExpiresAt:string;stepUpUntil?:string|null};
export type ChallengeInput={userId?:string|null;kind:'preauth'|'login'|'enrollment'|'reset'|'email-verification';tokenDigest:string;csrfDigest:string;expiresAt:string;encryptedSecret?:EncryptedEnvelope|null};
export type UserInput={email:string;passwordPhc:string;displayName:string;termsVersion:string;privacyVersion:string};
export class AccountsRepository {
 constructor(private readonly db:Database){}
 async createUser(input:UserInput,session?:Omit<SessionInput,'userId'>):Promise<Account>{
  return atomic(this.db,async c=>{
   const r=await c.query('INSERT INTO users(email_canonical,password_phc,display_name) VALUES($1,$2,$3) RETURNING id',[input.email.toLowerCase(),input.passwordPhc,input.displayName]);const id=r.rows[0].id as string;
   await c.query("INSERT INTO user_roles(user_id,role) VALUES($1,'user')",[id]);
   await c.query("INSERT INTO account_consents(user_id,document,version) VALUES($1,'terms',$2),($1,'privacy',$3)",[id,input.termsVersion,input.privacyVersion]);
   const repo=new AccountsRepository(c);if(session)await repo.createSession({...session,userId:id});return repo.getAccount(id);
  });
 }
 async bootstrapSuperAdmin(input:UserInput & {emailVerifiedAt:string},ctx:ActorContext,reason:string):Promise<Account>{
  if(reason.trim().length<10)throw new DomainError('INVALID_STATE');
  return atomic(this.db,async c=>{
   await c.query('SELECT pg_advisory_xact_lock(745912,3)');
   if((await c.query("SELECT 1 FROM user_roles WHERE role='super-admin' LIMIT 1")).rowCount)throw new DomainError('CONFLICT');
   const repo=new AccountsRepository(c);const account=await repo.createUser(input);
   await c.query('UPDATE users SET email_verified_at=$2 WHERE id=$1',[account.id,input.emailVerifiedAt]);
   await c.query("INSERT INTO user_roles(user_id,role) VALUES($1,'super-admin')",[account.id]);
   await audit(c,{...ctx,actorId:account.id},'account.bootstrap','user',account.id,['roles','emailVerifiedAt']);return repo.getAccount(account.id);
  });
 }
 async findUserByEmail(email:string){const r=await this.db.query('SELECT * FROM users WHERE email_canonical=$1',[email.toLowerCase()]);return r.rows[0]??null;}
 async getAuthUser(userId:string){const u=(await this.db.query('SELECT * FROM users WHERE id=$1',[userId])).rows[0];if(!u)return null;return {...u,account:await this.getAccount(userId),mfa:await this.getMfa(userId),recoveryCodes:(await this.db.query('SELECT id,digest FROM recovery_codes WHERE user_id=$1 AND consumed_at IS NULL',[userId])).rows};}
 async getAccount(id:string):Promise<Account>{
  const r=await this.db.query(`SELECT u.*,ARRAY(SELECT role FROM user_roles WHERE user_id=u.id ORDER BY role) AS roles,EXISTS(SELECT 1 FROM mfa_credentials WHERE user_id=u.id) AS mfa FROM users u WHERE id=$1`,[id]);const u=r.rows[0];if(!u)throw new DomainError('NOT_FOUND');
  const consents=await this.db.query('SELECT document,version,accepted_at,withdrawn_at FROM account_consents WHERE user_id=$1 ORDER BY accepted_at DESC,id DESC LIMIT 20',[id]);
  return AccountSchema.parse({id:u.id,email:u.email_canonical,displayName:u.display_name,emailVerified:u.email_verified_at!==null,roles:u.roles,status:u.status,createdAt:u.created_at.toISOString(),mfaEnrolled:u.mfa,consents:consents.rows.map(x=>({document:x.document,version:x.version,acceptedAt:x.accepted_at.toISOString(),withdrawnAt:x.withdrawn_at?.toISOString()??null}))});
 }
 async createSession(i:SessionInput){
  const r=await this.db.query(`INSERT INTO auth_sessions(user_id,token_digest,csrf_digest,assurance,security_version,idle_expires_at,absolute_expires_at,step_up_until) SELECT id,$2,$3,$4,security_version,$5,$6,$7 FROM users WHERE id=$1 AND status='active' RETURNING *`,[i.userId,i.tokenDigest,i.csrfDigest,i.assurance,i.idleExpiresAt,i.absoluteExpiresAt,i.stepUpUntil??null]);if(!r.rows[0])throw new DomainError('FORBIDDEN');return r.rows[0];
 }
 async findSession(tokenDigest:string){
  const r=await this.db.query(`SELECT s.*,ARRAY(SELECT role FROM user_roles WHERE user_id=u.id ORDER BY role) AS roles FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE token_digest=$1 AND revoked_at IS NULL AND idle_expires_at>now() AND absolute_expires_at>now() AND u.status='active' AND s.security_version=u.security_version`,[tokenDigest]);const s=r.rows[0];return s?{...s,sessionId:s.id,userId:s.user_id,csrfDigest:s.csrf_digest,assurance:s.assurance,stepUpUntil:s.step_up_until,account:await this.getAccount(s.user_id)}:null;
 }
 async revokeSession(userId:string,sessionId:string){const r=await this.db.query('UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1 AND id=$2 RETURNING id',[userId,sessionId]);if(!r.rowCount)throw new DomainError('NOT_FOUND');}
 async createChallenge(i:ChallengeInput){return (await this.db.query('INSERT INTO auth_challenges(user_id,kind,token_digest,csrf_digest,expires_at,encrypted_secret) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[i.userId??null,i.kind,i.tokenDigest,i.csrfDigest,i.expiresAt,i.encryptedSecret??null])).rows[0];}
 async findChallenge(digest:string){return (await this.db.query('SELECT * FROM auth_challenges WHERE token_digest=$1 AND consumed_at IS NULL AND expires_at>now() AND attempts<5',[digest])).rows[0]??null;}
 async attemptChallenge(digest:string){return (await this.db.query('UPDATE auth_challenges SET attempts=attempts+1 WHERE token_digest=$1 AND consumed_at IS NULL AND expires_at>now() AND attempts<5 RETURNING *',[digest])).rows[0]??null;}
 async consumeChallenge(digest:string){const r=await this.db.query('UPDATE auth_challenges SET consumed_at=now() WHERE token_digest=$1 AND consumed_at IS NULL AND expires_at>now() AND attempts<=5 RETURNING *',[digest]);if(!r.rows[0])throw new DomainError('CONFLICT');return r.rows[0];}
 async getMfa(userId:string){return (await this.db.query('SELECT * FROM mfa_credentials WHERE user_id=$1',[userId])).rows[0]??null;}
 async setMfa(userId:string,envelope:EncryptedEnvelope,step:number,recoveryDigests:string[]){
  if(recoveryDigests.length!==10 || new Set(recoveryDigests).size!==10)throw new DomainError('INVALID_STATE');
  return atomic(this.db,async c=>{await c.query('INSERT INTO mfa_credentials(user_id,encrypted_secret,last_used_step) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET encrypted_secret=$2,last_used_step=$3,enrolled_at=now()',[userId,envelope,step]);await c.query('DELETE FROM recovery_codes WHERE user_id=$1',[userId]);await c.query('INSERT INTO recovery_codes(user_id,digest) SELECT $1,unnest($2::text[])',[userId,recoveryDigests]);});
 }
 async consumeTotp(userId:string,step:number):Promise<boolean>{if(!Number.isSafeInteger(step)||step<0)return false;return !!(await this.db.query('UPDATE mfa_credentials SET last_used_step=$2 WHERE user_id=$1 AND last_used_step<$2 RETURNING user_id',[userId,step])).rowCount;}
 async consumeRecovery(userId:string,digest:string):Promise<boolean>{return !!(await this.db.query('UPDATE recovery_codes SET consumed_at=now() WHERE user_id=$1 AND digest=$2 AND consumed_at IS NULL RETURNING id',[userId,digest])).rowCount;}
 async setRoles(userId:string,roles:unknown,version:number,ctx:ActorContext):Promise<Account>{
  const checked=RoleListSchema.parse(roles);if(userId===ctx.actorId)throw new DomainError('FORBIDDEN');
  return atomic(this.db,async c=>{
   await c.query('SELECT pg_advisory_xact_lock(745912,3)');
   if(!(await c.query("SELECT 1 FROM user_roles r JOIN users u ON r.user_id=u.id WHERE u.id=$1 AND u.status='active' AND r.role='super-admin'",[ctx.actorId])).rowCount)throw new DomainError('FORBIDDEN');
   if(!(await c.query('UPDATE users SET version=version+1,security_version=security_version+1 WHERE id=$1 AND version=$2 RETURNING id',[userId,version])).rowCount)throw new DomainError('CONFLICT');
   await c.query('DELETE FROM user_roles WHERE user_id=$1 AND NOT(role=ANY($2::text[]))',[userId,checked]);await c.query('INSERT INTO user_roles(user_id,role) SELECT $1,unnest($2::text[]) ON CONFLICT DO NOTHING',[userId,checked]);await c.query('UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1',[userId]);await audit(c,ctx,'account.roles','user',userId,['roles','securityVersion']);return new AccountsRepository(c).getAccount(userId);
  });
 }
}
