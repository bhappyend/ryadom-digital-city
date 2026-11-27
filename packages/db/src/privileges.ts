import type { Pool } from 'pg';
import { withTransaction } from './pool';

export async function grantRuntime(pool:Pool,role:string):Promise<void> {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(role)) throw new Error('Invalid runtime role name');
  // Identifier validated to a deliberately narrow alphabet; never a user/API parameter.
  const identifier = `"${role}"`;
  await withTransaction(pool, async client=>{
    const result = await client.query('SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=$1',[role]);
    if (!result.rows[0] || Object.values(result.rows[0]).some(Boolean)) throw new Error('Runtime role must exist without administrative privileges');
    await client.query(`REVOKE ALL ON cities,categories,places,place_categories,source_records,data_sources,import_jobs,reports,platform_reviews,schema_migrations FROM ${identifier}`);
    await client.query(`GRANT USAGE ON SCHEMA public TO ${identifier}`);
    await client.query(`REVOKE CREATE ON SCHEMA public FROM ${identifier}`);
    await client.query(`GRANT SELECT ON cities,categories,places,place_categories,source_records,platform_reviews TO ${identifier}`);
    await client.query(`GRANT SELECT(place_id,published_at,published_provenance,published_photos) ON place_admin_metadata TO ${identifier}`);
    await client.query(`GRANT SELECT(id,state,attribution,license) ON media_assets TO ${identifier}`);
    // Public projection reads only these columns; private auth/evidence tables remain denied.
    await client.query(`GRANT SELECT(id,author_id,kind,place_id,rating,text,status,consent_id,published_at) ON account_reviews TO ${identifier}`);
    await client.query(`GRANT SELECT(id,display_name,status) ON users TO ${identifier}`);
    await client.query(`GRANT SELECT(id,user_id,document,accepted_at,withdrawn_at) ON account_consents TO ${identifier}`);
    await client.query(`GRANT SELECT(review_id) ON review_corrections TO ${identifier}`);
    await client.query(`GRANT INSERT(place_id,reason,description) ON reports TO ${identifier}`);
    await client.query(`GRANT SELECT(id,status,received_at) ON reports TO ${identifier}`);
  });
}

/** Application service credentials only; HTTP callers never receive this database role. */
export async function grantAdminRuntime(pool:Pool,role:string):Promise<void>{
 await grantRuntime(pool,role);
 const identifier=`"${role}"`;
 await withTransaction(pool,async c=>{
  await c.query(`GRANT SELECT,INSERT,UPDATE ON users,account_consents,auth_sessions,auth_challenges,mfa_credentials,recovery_codes,businesses,business_memberships,business_branches,owner_crm,listing_applications,cms_documents,media_assets,place_admin_metadata,place_field_overrides,account_reviews,owner_business_links TO ${identifier}`);
  await c.query(`GRANT SELECT,INSERT,DELETE ON user_roles,recovery_codes,place_categories TO ${identifier}`);
  await c.query(`GRANT SELECT,INSERT ON audit_events,owner_phone_reveals,listing_quotes,founder_agreements,manual_subscription_payments,cms_revisions,cms_publications,review_corrections TO ${identifier}`);
  await c.query(`GRANT INSERT,UPDATE ON places TO ${identifier}`);
  await c.query(`GRANT SELECT ON data_sources,import_jobs TO ${identifier}`);
  await c.query(`GRANT SELECT,INSERT,UPDATE ON owner_claims TO ${identifier}`);
  await c.query(`GRANT SELECT,INSERT ON ownership_claim_decisions,listing_review_decisions TO ${identifier}`);
  await c.query(`GRANT SELECT,INSERT ON owner_access_events TO ${identifier}`);
 });
}
