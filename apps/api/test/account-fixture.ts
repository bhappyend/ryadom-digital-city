import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { parseEnv } from 'node:util';
import { AccountsRepository, AdminRepository, createDatabasePool, migrate, seed, grantAdminRuntime } from '@ryadom/db/compiled';
import { NominatimGeocoder, ValhallaRouter } from '@ryadom/gis';
import { AccountService } from '../src/accounts.js';
import { MfaCipher, PasswordHasher } from '../src/account-crypto.js';
import { AccountRedisRate } from '../src/account-rate.js';
import { loadAccountConfig } from '../src/account-config.js';
import { LocalMedia } from '../src/account-media.js';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { RedisRateLimiter } from '../src/rate-limit.js';
import { createCatalog } from '../src/repository.js';

/** Disposable fixtures only: no working users/catalog mutations, no reusable credentials or files. */
export async function createAccountFixture(options: { origin?: string; port?: number } = {}) {
  const origin = options.origin ?? 'http://localhost:3000';
  const trusted = new URL(origin);
  if (!['http:','https:'].includes(trusted.protocol) || !['localhost','127.0.0.1','[::1]'].includes(trusted.hostname) || trusted.origin !== origin) throw new Error('Fixture origin must be exact loopback');
  const port = options.port ?? 0;
  if (port !== 0 && (!Number.isInteger(port) || port < 1024 || port > 65535)) throw new Error('Invalid fixture port');
  const root = resolve(__dirname, '../../..'), local = parseEnv(readFileSync(resolve(root, 'infra/.env.local'), 'utf8'));
  const ownerUrl = new URL(local.DATABASE_URL!), runtimeUrl = new URL(local.APP_DATABASE_URL!);
  const name = `ryadom_accounttest_${randomUUID().replaceAll('-', '')}`;
  if (!/^ryadom_accounttest_[a-f0-9]{32}$/.test(name)) throw new Error('Unsafe fixture DB');
  const owner = createDatabasePool(ownerUrl.toString(), 'migration');
  await owner.query(`CREATE DATABASE "${name}"`);
  ownerUrl.pathname = `/${name}`; runtimeUrl.pathname = `/${name}`;
  const setup = createDatabasePool(ownerUrl.toString(), 'migration');
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  let runtime: AccountService | undefined;
  const mediaRoot = await mkdtemp(join(tmpdir(), 'ryadom-accounttest-'));
  const catalog = createCatalog(runtimeUrl.toString(),origin);
  const publicLimiter = new RedisRateLimiter(loadConfig({ REDIS_URL: local.REDIS_URL }), `test:${randomUUID()}`);
  const cleanup = async () => {
    await app?.close(); await runtime?.close(); await catalog?.close(); await publicLimiter.close(); await setup.end();
    await owner.query(`DROP DATABASE "${name}" WITH (FORCE)`); await owner.end();
    const target = resolve(mediaRoot); if (!target.startsWith(resolve(tmpdir()) + (process.platform === 'win32' ? '\\' : '/')) || !target.includes('ryadom-accounttest-')) throw new Error('Unsafe fixture directory');
    await rm(target, { recursive: true, force: true });
  };
  try {
    await migrate(setup, resolve(root, 'packages/db/migrations')); await seed(setup);
    await grantAdminRuntime(setup, decodeURIComponent(runtimeUrl.username));
    const env = { NODE_ENV: 'development', ACCOUNTS_ENABLED: 'true', ACCOUNT_ALLOW_LOOPBACK_HTTP: 'true', ACCOUNTS_DATABASE_URL: runtimeUrl.toString(), REDIS_URL: local.REDIS_URL, ACCOUNT_MFA_KEY: randomBytes(32).toString('base64'), ACCOUNT_RATE_KEY: randomBytes(32).toString('base64'), ACCOUNT_MEDIA_ROOT: mediaRoot };
    const config = loadAccountConfig([origin], env), pool = createDatabasePool(config.databaseUrl);
    const rate = new AccountRedisRate(config.redisUrl!, config.rateKey!, `test:accounts:${randomUUID()}`); await rate.connect();
    const cipher = new MfaCipher(config.mfaKey!, config.keyId), admin = new AdminRepository(pool, { encrypt: (v,id) => cipher.seal(`phone:${id}`,v), decrypt: (v,id) => cipher.open(`phone:${id}`,v) });
    runtime = new AccountService(pool, config, [origin], rate, admin, new LocalMedia(mediaRoot, admin));
    const password = `Test only ${randomUUID()}`;
    const account = await new AccountsRepository(setup).bootstrapSuperAdmin({ email:'admin@fixture.invalid', passwordPhc: await new PasswordHasher().hash(password), displayName:'TEST ONLY isolated operator', termsVersion:'test1', privacyVersion:'test1', emailVerifiedAt:new Date().toISOString() }, { actorId:null, requestId:randomUUID() }, 'TEST ONLY disposable identity fixture');
    await publicLimiter.connect();
    const apiConfig = loadConfig({ CORS_ORIGINS: origin, APP_DATABASE_URL: runtimeUrl.toString(), REDIS_URL: local.REDIS_URL });
    app = await createApp({ config:apiConfig,catalog,limiter:publicLimiter,accounts:runtime,geocoder:new NominatimGeocoder(apiConfig.geocoder),router:new ValhallaRouter(apiConfig.router) });
    await app.listen(port,'127.0.0.1');
    return { app, runtime, setup, password, account, origin, cleanup, name, admin, mediaRoot };
  } catch (error) { await cleanup(); throw error; }
}

/** QA-only domain setup. No payment, entitlement, MFA credential or session is created. */
export async function prepareManualAdminFixture(f: Awaited<ReturnType<typeof createAccountFixture>>, options: { pendingQuote?: boolean } = {}) {
  if (!/^ryadom_accounttest_[a-f0-9]{32}$/.test(f.name)) throw new Error('Only isolated account fixtures allowed');
  const repo=new AccountsRepository(f.setup),hasher=new PasswordHasher();
  const applicant=await repo.createUser({email:`applicant-${randomUUID()}@fixture.invalid`,passwordPhc:await hasher.hash(`TEST ONLY ${randomUUID()}`),displayName:'TEST ONLY independent applicant',termsVersion:'test1',privacyVersion:'test1'});
  const ctx={actorId:f.account.id,requestId:randomUUID()},reason='TEST ONLY independent disposable domain fixture';
  const exec=async(id:string,body:unknown,params:Record<string,string>={},actorId=ctx.actorId)=>f.admin.execute(id,{body,params,query:{}},{actorId,requestId:randomUUID()}) as Promise<any>;
  const owner=await exec('createCrmOwner',{dataScope:'production',displayName:'TEST ONLY monthly operator fixture',accountId:applicant.id,notes:null,reason});
  const business=await exec('createCatalogBusiness',{organization:{name:'TEST ONLY monthly operator business',cityId:'smolensk',categoryIds:['cafe'],address:'TEST ONLY isolated address',coordinates:{lon:32.0453,lat:54.7826},description:null,phone:null,website:null,openingHours:null},addressParts:{street:'TEST ONLY isolated street',house:null},provenance:[{sourceId:'osm',sourceRecordId:`TEST ONLY ${randomUUID()}`,sourceUrl:null,license:'ODbL-1.0',attribution:'© OpenStreetMap contributors',sourceUpdatedAt:null,importedAt:new Date().toISOString()}],photos:[],reason});
  const listing=await exec('applyPaidListing',{placeId:business.id,placementRequest:reason,termsConsent:true},{},applicant.id);
  const quote=options.pendingQuote?null:await exec('quoteListing',{expectedVersion:listing.version,amountRub:123,terms:'TEST ONLY monthly terms; no actual product price'},{listingId:listing.id});
  const anchor=new Date(Date.now()-10000);anchor.setUTCMilliseconds(0);const end=new Date(anchor);end.setUTCMonth(end.getUTCMonth()+1);
  const agreementInput={ownerId:owner.id,acceptedBy:'TEST ONLY independently checked applicant',acceptedAt:new Date(anchor.getTime()-1000).toISOString(),channel:'telegram',agreementReference:`TEST ONLY agreement ${randomUUID()}`,verificationNote:reason,billingTimezone:'Europe/Moscow',billingAnchorAt:anchor.toISOString(),idempotencyKey:randomUUID()};
  const agreement=quote?await exec('recordFounderAgreement',{...agreementInput,expectedVersion:quote.version,quoteId:quote.quoteId},{listingId:listing.id}):null;
  const reviewerPassword=`TEST ONLY reviewer ${randomUUID()}`;
  const reviewer=await repo.createUser({email:`reviewer-${randomUUID()}@fixture.invalid`,passwordPhc:await hasher.hash(reviewerPassword),displayName:'TEST ONLY separate moderator',termsVersion:'test1',privacyVersion:'test1'});
  await f.setup.query('UPDATE users SET email_verified_at=now() WHERE id=$1',[reviewer.id]);
  await f.setup.query("INSERT INTO user_roles(user_id,role) VALUES($1,'moderator')",[reviewer.id]);
  const originalText='TEST ONLY original author review for browser moderation';
  const review=(await f.setup.query("INSERT INTO account_reviews(author_id,kind,place_id,rating,original_text,text,status) VALUES($1,'place',$2,4,$3,$3,'pending') RETURNING id",[applicant.id,business.id,originalText])).rows[0];
  return {owner,business,listing,quote,agreement,agreementInput,quoteInput:{amountRub:123,terms:'TEST ONLY monthly terms; no actual product price'},applicantId:applicant.id,review:{id:review.id,originalText,rating:4,authorId:applicant.id},reviewer:{account:reviewer,password:reviewerPassword},payment:{expectedVersion:agreement?.version??listing.version,quoteId:quote?.quoteId??null,agreementReference:agreementInput.agreementReference,receiptReference:`TEST ONLY actual funds fixture ${randomUUID()}`,amountRub:123,currency:'RUB',receivedAt:new Date(anchor.getTime()+1000).toISOString(),periodStartsAt:anchor.toISOString(),periodEndsAt:end.toISOString(),reason,idempotencyKey:randomUUID()}};
}
