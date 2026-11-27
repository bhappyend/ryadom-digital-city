import type {Pool,PoolClient} from 'pg';
import {AdminClaimSchema,ClaimSchema,hasPermission} from '@ryadom/accounts-types';
import {AccountsRepository,atomic,audit,DomainError,type ActorContext} from './accounts';

type Body=Record<string,any>;
const iso=(x:Date|null)=>x?.toISOString()??null;
const claimDto=(r:Body)=>ClaimSchema.parse({id:r.id,placeId:r.place_id,businessId:r.business_id,status:r.status,version:r.version,submittedAt:iso(r.submitted_at),reviewedAt:iso(r.reviewed_at)});
const adminDto=(r:Body)=>AdminClaimSchema.parse({claim:claimDto(r),applicantId:r.applicant_id,relationship:r.relationship,evidenceText:r.evidence_text,verificationNote:r.verification_note,reviewerId:r.reviewer_id});
function bounds(q:Body){const page=q.page??1,limit=q.limit??20;if(!Number.isInteger(page)||page<1||page>100||!Number.isInteger(limit)||limit<1||limit>50)throw new DomainError('INVALID_STATE');return {page,limit,offset:(page-1)*limit};}
const page=(items:unknown[],total:number,q:Body)=>{const {page,limit}=bounds(q);return {items,pagination:{page,limit,total,hasMore:page*limit<total}};};

/** Ownership evidence does not verify account email, enroll MFA or confer public paid status. */
export class OwnershipRepository{
 constructor(private readonly pool:Pool){}
 async execute(op:string,p:Record<string,string>,q:Body,b:Body,ctx:ActorContext):Promise<unknown>{
  if(!ctx.actorId)throw new DomainError('FORBIDDEN');
  if(op==='listMyClaims'||op==='listAdminClaims')return atomic(this.pool,async c=>{
   await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');await this.authorize(c,ctx,op==='listAdminClaims'?'claims:read':undefined);
   const {limit,offset}=bounds(q),owner=op==='listMyClaims'?ctx.actorId:null;
   const result=await c.query(`WITH matches AS MATERIALIZED(SELECT * FROM owner_claims WHERE ($1::uuid IS NULL OR applicant_id=$1)) SELECT (SELECT count(*)::int FROM matches) AS total,COALESCE((SELECT jsonb_agg(x ORDER BY x.submitted_at DESC,x.id DESC) FROM (SELECT * FROM matches ORDER BY submitted_at DESC,id DESC LIMIT $2 OFFSET $3)x),'[]'::jsonb) AS items`,[owner,limit,offset]);
   // JSON aggregates encode dates; restore pg date representation for shared DTO conversion.
   const rows=result.rows[0].items.map((r:Body)=>({...r,submitted_at:new Date(r.submitted_at),reviewed_at:r.reviewed_at?new Date(r.reviewed_at):null}));return page(rows.map(op==='listAdminClaims'?adminDto:claimDto),result.rows[0].total,q);
  });
  if(op==='createOwnershipClaim')return atomic(this.pool,async c=>{
   await this.authorize(c,ctx);await this.lockPlace(c,b.placeId);
   if(!(await c.query(`SELECT 1 FROM places p JOIN cities city ON city.id=p.city_id WHERE p.id=$1 AND p.active AND city.enabled AND (EXISTS(SELECT 1 FROM source_records WHERE place_id=p.id) OR EXISTS(SELECT 1 FROM place_admin_metadata WHERE place_id=p.id AND published_at IS NOT NULL))`,[b.placeId])).rowCount)throw new DomainError('NOT_FOUND');
   if((await c.query("SELECT 1 FROM owner_claims WHERE applicant_id=$1 AND place_id=$2 AND status IN ('pending','verified')",[ctx.actorId,b.placeId])).rowCount)throw new DomainError('CONFLICT');
   const r=(await c.query('INSERT INTO owner_claims(applicant_id,place_id,relationship,evidence_text) VALUES($1,$2,$3,$4) RETURNING *',[ctx.actorId,b.placeId,b.relationship,b.evidenceText])).rows[0];await audit(c,ctx,'claim.submit','claim',r.id,['status']);
   await c.query("UPDATE listing_applications SET ownership_state='pending',version=version+1 WHERE applicant_id=$1 AND place_id=$2 AND ownership_state IN ('unclaimed','revoked')",[ctx.actorId,b.placeId]);return claimDto(r);
  });
  if(op==='withdrawClaim'||op==='decideClaim')return this.decide(op,p.claimId!,b,ctx);
  if(op==='reviewListing')return this.reviewListing(p.listingId!,b,ctx);
  throw new DomainError('INVALID_STATE');
 }
 private async authorize(c:PoolClient,ctx:ActorContext,permission?:'claims:read'|'claims:decide'|'moderation:decide'){
  const a=await new AccountsRepository(c).getAccount(ctx.actorId!);if(a.status!=='active'||(permission&&!hasPermission(a.roles,permission)))throw new DomainError('FORBIDDEN');
 }
 private async lockPlace(c:PoolClient,id:string){await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`ownership-place:${id}`]);}
 private async decide(op:string,id:string,b:Body,ctx:ActorContext){return atomic(this.pool,async c=>{
  await this.authorize(c,ctx,op==='decideClaim'?'claims:decide':undefined);
  const hint=(await c.query(`SELECT place_id FROM owner_claims WHERE id=$1 AND ($2::uuid IS NULL OR applicant_id=$2)`,[id,op==='withdrawClaim'?ctx.actorId:null])).rows[0];if(!hint)throw new DomainError('NOT_FOUND');
  await this.lockPlace(c,hint.place_id);const r=(await c.query('SELECT * FROM owner_claims WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(r.version!==b.expectedVersion)throw new DomainError('CONFLICT');if(op==='decideClaim'&&r.applicant_id===ctx.actorId)throw new DomainError('FORBIDDEN');
  const decision=op==='withdrawClaim'?'withdraw':b.decision;
  if((decision==='revoke'&&r.status!=='verified')||(decision!=='revoke'&&r.status!=='pending'))throw new DomainError('CONFLICT');
  let businessId=r.business_id;
  if(decision==='verify'){
   if(b.verificationMethod==='insufficient_evidence')throw new DomainError('INVALID_STATE');
   if(!(await c.query("SELECT 1 FROM users WHERE id=$1 AND status='active' FOR SHARE",[r.applicant_id])).rowCount)throw new DomainError('INVALID_STATE');
   const place=(await c.query('SELECT name FROM places WHERE id=$1 AND active FOR UPDATE',[r.place_id])).rows[0];if(!place)throw new DomainError('INVALID_STATE');
   if((await c.query("SELECT 1 FROM owner_claims WHERE place_id=$1 AND status='verified'",[r.place_id])).rowCount)throw new DomainError('CONFLICT');
   const branch=(await c.query('SELECT business_id FROM business_branches WHERE place_id=$1',[r.place_id])).rows[0];businessId=branch?.business_id;
   if(!businessId){businessId=(await c.query('INSERT INTO businesses(name) VALUES($1) RETURNING id',[place.name])).rows[0].id;await c.query('INSERT INTO business_branches(place_id,business_id) VALUES($1,$2)',[r.place_id,businessId]);}
   await c.query('INSERT INTO business_memberships(user_id,business_id,active,verified_at) VALUES($1,$2,true,now()) ON CONFLICT(user_id,business_id) DO UPDATE SET active=true,verified_at=now()',[r.applicant_id,businessId]);
  }
  const status=decision==='verify'?'verified':decision==='revoke'?'revoked':decision==='withdraw'?'withdrawn':'rejected';
  const updated=(await c.query(`UPDATE owner_claims SET status=$2,business_id=$3,version=version+1,reviewer_id=CASE WHEN $4 THEN reviewer_id ELSE $5 END,reviewed_at=CASE WHEN $4 THEN reviewed_at ELSE now() END,verification_method=CASE WHEN $4 THEN verification_method ELSE $6 END,verification_note=CASE WHEN $4 THEN verification_note ELSE $7 END WHERE id=$1 RETURNING *`,[id,status,businessId,decision==='withdraw',ctx.actorId,b.verificationMethod??null,b.verificationNote??null])).rows[0];
  if(decision==='revoke')await c.query(`UPDATE business_memberships SET active=false WHERE user_id=$1 AND business_id=$2 AND NOT EXISTS(SELECT 1 FROM owner_claims WHERE applicant_id=$1 AND business_id=$2 AND status='verified')`,[r.applicant_id,businessId]);
  await c.query(`UPDATE listing_applications SET ownership_state=$3,placement_state=CASE WHEN $3<>'verified' AND placement_state='published' THEN 'pending-review' ELSE placement_state END,version=version+1 WHERE applicant_id=$1 AND place_id=$2`,[r.applicant_id,r.place_id,status==='verified'?'verified':status==='revoked'?'revoked':'unclaimed']);
  const auditId=await audit(c,ctx,`claim.${decision}`,'claim',id,['status','membership']);
  await c.query('INSERT INTO ownership_claim_decisions(claim_id,version,decision,actor_id,verification_method,verification_note,audit_id) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,updated.version,decision,ctx.actorId,b.verificationMethod??null,b.verificationNote??null,auditId]);
  return op==='withdrawClaim'?claimDto(updated):adminDto(updated);
 });}
 private async reviewListing(id:string,b:Body,ctx:ActorContext){return atomic(this.pool,async c=>{
  await this.authorize(c,ctx,'moderation:decide');const hint=(await c.query('SELECT place_id FROM listing_applications WHERE id=$1',[id])).rows[0];if(!hint)throw new DomainError('NOT_FOUND');await this.lockPlace(c,hint.place_id);
  const l=(await c.query('SELECT * FROM listing_applications WHERE id=$1 FOR UPDATE',[id])).rows[0];if(l.applicant_id===ctx.actorId)throw new DomainError('FORBIDDEN');if(l.version!==b.expectedVersion||l.placement_state!=='pending-review')throw new DomainError('CONFLICT');
  let claim:Body|undefined,agreement:Body|undefined,receipt:Body|undefined;
  if(b.decision==='approve'){
   if(!(await c.query("SELECT 1 FROM users WHERE id=$1 AND status='active' FOR SHARE",[l.applicant_id])).rowCount)throw new DomainError('INVALID_STATE');
   claim=(await c.query(`SELECT cl.* FROM owner_claims cl JOIN business_branches br ON br.business_id=cl.business_id AND br.place_id=cl.place_id JOIN business_memberships m ON m.user_id=cl.applicant_id AND m.business_id=cl.business_id JOIN users u ON u.id=cl.applicant_id WHERE cl.applicant_id=$1 AND cl.place_id=$2 AND cl.status='verified' AND m.active AND u.status='active' FOR SHARE OF u`,[l.applicant_id,l.place_id])).rows[0];if(!claim||l.ownership_state!=='verified')throw new DomainError('INVALID_STATE');
   const quote=(await c.query('SELECT * FROM listing_quotes WHERE listing_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1',[id])).rows[0];agreement=quote?(await c.query('SELECT * FROM founder_agreements WHERE quote_id=$1 AND listing_id=$2',[quote.id,id])).rows[0]:undefined;
   receipt=agreement?(await c.query(`SELECT * FROM manual_subscription_payments WHERE listing_id=$1 AND quote_id=$2 AND agreement_id=$3 AND amount_rub=$4 AND currency='RUB' AND period_starts_at<=now() AND period_ends_at>now() ORDER BY period_ends_at DESC LIMIT 1`,[id,quote.id,agreement.id,quote.amount_rub])).rows[0]:undefined;
   if(!agreement||!receipt||l.payment_state!=='manually-confirmed')throw new DomainError('INVALID_STATE');
   if(!(await c.query(`SELECT 1 FROM places p JOIN cities city ON city.id=p.city_id WHERE p.id=$1 AND p.active AND city.enabled AND (EXISTS(SELECT 1 FROM source_records WHERE place_id=p.id) OR EXISTS(SELECT 1 FROM place_admin_metadata WHERE place_id=p.id AND published_at IS NOT NULL))`,[l.place_id])).rowCount)throw new DomainError('INVALID_STATE');
   if(!(await c.query('SELECT 1 FROM owner_crm WHERE id=$1 AND account_id=$2 AND archived_at IS NULL',[agreement.owner_id,l.applicant_id])).rowCount)throw new DomainError('INVALID_STATE');
  }
  const updated=(await c.query('UPDATE listing_applications SET placement_state=$2,version=version+1 WHERE id=$1 RETURNING version',[id,b.decision==='approve'?'published':'rejected'])).rows[0];const auditId=await audit(c,ctx,'listing.review','listing',id,['placementState']);
  await c.query('INSERT INTO listing_review_decisions(listing_id,version,decision,reviewer_id,note,claim_id,agreement_id,receipt_id,audit_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,updated.version,b.decision,ctx.actorId,b.note,claim?.id??null,agreement?.id??null,receipt?.id??null,auditId]);return {listingId:id};
 });}
}
