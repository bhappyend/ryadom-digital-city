import { randomBytes } from 'node:crypto';
import type { Response } from 'express';
import { ACCOUNT_SCHEMAS, type AccountOperation, type Account, hasPermission, requiresAdminMfa, CMS_KIND_BY_KEY } from '@ryadom/accounts-types';
import { AccountsRepository, createDatabasePool, withTransaction } from '@ryadom/db/compiled';
import type { ApiRequest } from './errors.js';
import { meta } from './errors.js';
import { AccountFault } from './accounts-fault.js';
import { base32, checkRecovery, digest, equal, hashRecovery, MfaCipher, opaque, PasswordHasher, recoveryCodes, verifyTotp, type EncryptedSecret } from './account-crypto.js';
import type { AccountConfig } from './account-config.js';
import type { AccountRate } from './account-rate.js';
import type { LocalMedia } from './account-media.js';

type Pool = ReturnType<typeof createDatabasePool>;
type Repo = AccountsRepository;
type Session = NonNullable<Awaited<ReturnType<Repo['findSession']>>>;
type Challenge = NonNullable<Awaited<ReturnType<Repo['findChallenge']>>>;
type Input = { params: Record<string, string>; query: Record<string, unknown>; body: any };
export interface AdminExecutor { execute(id: string, input: Input, ctx: { actorId: string | null; requestId: string }): Promise<unknown>;provisionOwnerAccess?(input:{ownerId:string;mode:'create'|'reset';expectedVersion:number;email:string;passwordPhc:string;reason:string},ctx:{actorId:string|null;requestId:string}):Promise<unknown> }
export interface AccountsRuntime { dispatch(op: AccountOperation, req: ApiRequest, res: Response): Promise<void>; publishedMedia?(id: string): Promise<Buffer>; close(): Promise<void> }
const schema = (name: keyof typeof ACCOUNT_SCHEMAS) => ACCOUNT_SCHEMAS[name] as import('zod').z.ZodType;
const iso = (date: Date | string) => new Date(date).toISOString();
const after = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString();
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const ENABLED_ADMIN = new Set(['createOwnershipClaim','listMyClaims','withdrawClaim','listAdminClaims','decideClaim','reviewListing','listAdminListings','getAdminListing','getPublishedContent','getCmsDraft','getSettingsDraft','listCmsRevisions','listSettingsRevisions','writeCmsDraft','writeSettingsDraft','publishCms','publishSettings','rollbackCms','rollbackSettings','listCatalogBusinesses','getCatalogBusiness','createCatalogBusiness','updateCatalogBusiness','publishCatalogBusiness','archiveCatalogBusiness','listCrmOwners','getCrmOwner','createCrmOwner','updateCrmOwner','archiveCrmOwner','setOwnerPhone','revealOwnerPhone','getReviewEditor','correctReview','listReviewCorrections','listModeration','decideModeration','confirmManualPayment','recordFounderAgreement','quoteListing','applyPaidListing','listMyListings','listOwnerBusinessLinks','linkOwnerBusiness','setUserRoles','listAdminUsers','setUserStatus','listAdminCategories','getAdminStats','listAdminCities','listAdminSources','listAdminImports','listAudit','listMedia','createMediaUpload','archiveMedia']);
function cookie(req: ApiRequest, name: string): string | null {
  const parts = (req.headers.cookie ?? '').split(';').map(part => part.trim().split('='));
  const found = parts.filter(part => part[0] === name);
  if (found.length !== 1 || !tokenPattern.test(found[0]?.[1] ?? '')) return null;
  return found[0]![1]!;
}

export class AccountService implements AccountsRuntime {
  readonly repo: AccountsRepository;
  readonly cipher: MfaCipher;
  readonly hasher = new PasswordHasher();
  constructor(readonly pool: Pool, readonly config: AccountConfig, readonly origins: readonly string[], readonly rate: AccountRate, readonly admin: AdminExecutor, readonly media?: LocalMedia) {
    this.repo = new AccountsRepository(pool); this.cipher = new MfaCipher(config.mfaKey!, config.keyId);
  }
  async close() { await this.rate.close(); await this.pool.end(); }
  async publishedMedia(id: string) { if (!this.media) throw new AccountFault('NOT_FOUND'); return this.media.published(id); }
  private setCookie(res: Response, kind: 'session' | 'preauth', value: string, seconds: number) {
    res.cookie(kind === 'session' ? this.config.sessionCookie : this.config.preauthCookie, value, { httpOnly: true, secure: this.config.secure, sameSite: 'lax', path: '/', maxAge: seconds * 1000 });
  }
  private clear(res: Response, kind: 'session' | 'preauth') { res.clearCookie(kind === 'session' ? this.config.sessionCookie : this.config.preauthCookie, { httpOnly: true, secure: this.config.secure, sameSite: 'lax', path: '/' }); }
  private exactOrigin(req: ApiRequest) { if (!req.headers.origin || !this.origins.includes(req.headers.origin) || req.headers['sec-fetch-site'] === 'cross-site') throw new AccountFault('CSRF_INVALID'); }
  private csrf(req: ApiRequest, expected: string | undefined) {
    this.exactOrigin(req); const token = req.headers['x-csrf-token'];
    if (typeof token !== 'string' || !tokenPattern.test(token) || !expected || !equal(digest(token), expected)) throw new AccountFault('CSRF_INVALID');
  }
  private async current(req: ApiRequest) { const token = cookie(req, this.config.sessionCookie); return token ? this.repo.findSession(digest(token)) : null; }
  private async challenge(req: ApiRequest) { const token = cookie(req, this.config.preauthCookie); return token ? this.repo.findChallenge(digest(token)) : null; }
  private summary(s: Session) { return { id: s.id, createdAt: iso(s.created_at), expiresAt: iso(s.idle_expires_at), lastSeenAt: iso(s.last_seen_at), current: true, assurance: s.assurance, stepUpUntil: s.step_up_until ? iso(s.step_up_until) : null }; }
  private authentication(s: Session) { return { status: 'authenticated', account: s.account, session: this.summary(s) }; }
  private async issue(repo: Repo, account: Account, assurance: 'password' | 'mfa' | 'recovery', stepUp = false, absolute?: Date) {
    if (requiresAdminMfa(account.roles) && (!account.emailVerified || !account.mfaEnrolled || assurance === 'password')) throw new AccountFault('MFA_REQUIRED');
    const token = opaque(), csrf = opaque(), privileged = requiresAdminMfa(account.roles);
    const absoluteExpiresAt = absolute ? iso(absolute) : after(privileged ? 8 * 3600 : 7 * 86400);
    const idleExpiresAt = new Date(Math.min(Date.parse(absoluteExpiresAt), Date.now() + (privileged ? 900 : 86400) * 1000)).toISOString();
    await repo.createSession({ userId: account.id, tokenDigest: digest(token), csrfDigest: digest(csrf), assurance, idleExpiresAt, absoluteExpiresAt, stepUpUntil: stepUp ? after(300) : null });
    const session = await repo.findSession(digest(token)); if (!session) throw new AccountFault('UNAUTHORIZED');
    return { token, session };
  }
  private async newChallenge(repo: Repo, userId: string | null, kind: 'preauth' | 'login' | 'enrollment', secret?: EncryptedSecret) {
    const token = opaque(), csrf = opaque();
    const row = await repo.createChallenge({ userId, kind, tokenDigest: digest(token), csrfDigest: digest(csrf), expiresAt: after(kind === 'preauth' ? 600 : 300), ...(secret ? { encryptedSecret: secret } : {}) });
    return { token, row };
  }
  private async deny(req: ApiRequest, op: AccountOperation, actorId: string | null) {
    await this.pool.query("INSERT INTO audit_events(actor_id,request_id,action,resource_type,resource_id,outcome) VALUES($1,$2,'api.denied','operation',$3,'denied')", [actorId, req.requestId, op.id]);
  }
  async dispatch(op: AccountOperation, req: ApiRequest, res: Response) {
    // Limit untrusted traffic before session lookup and durable denial audit.
    // Exceeded/outage requests never write another denial row.
    await this.rate.consume('ingress', req.ip ?? req.socket.remoteAddress ?? 'unknown', 120, 60000);
    if(op.id==='register')throw new AccountFault('PROVIDER_UNAVAILABLE','disabled');
    let session: Session | null = null;
    try {
      session = await this.current(req); const challenge = await this.challenge(req);
      if (op.access === 'admin' || op.access === 'session' || op.access === 'verified-owner') {
        if (!session) throw new AccountFault('UNAUTHORIZED');
        if (op.access === 'admin' && (!requiresAdminMfa(session.account.roles) || !session.account.emailVerified || session.assurance !== 'mfa')) throw new AccountFault('FORBIDDEN');
        if (op.permission && !hasPermission(session.account.roles, op.permission)) throw new AccountFault('FORBIDDEN');
        if (op.verifiedEmail && !session.account.emailVerified) throw new AccountFault('EMAIL_VERIFICATION_REQUIRED');
        if (op.access === 'verified-owner' && (session.assurance !== 'mfa' || !session.account.mfaEnrolled)) throw new AccountFault('MFA_REQUIRED');
      }
      if (op.access === 'password-challenge' && (!challenge?.user_id || challenge.kind !== 'login')) throw new AccountFault('UNAUTHORIZED');
      if (op.stepUp && (!session || session.assurance !== 'mfa' || !session.step_up_until || new Date(session.step_up_until).getTime() <= Date.now())) throw new AccountFault('STEP_UP_REQUIRED');
      if (op.csrf) this.csrf(req, session?.csrf_digest ?? challenge?.csrf_digest);
      if (op.id === 'getCsrf' || op.id === 'bootstrapCsrf') this.exactOrigin(req);
      const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
      // Every account/admin operation fails closed on Redis failure, including private reads.
      await this.rate.consume(op.rate === 'read' ? 'private-read' : op.rate, session?.user_id ?? challenge?.user_id ?? ip, op.rate === 'export' ? 1 : op.rate === 'mfa' ? 10 : op.rate === 'auth' ? 20 : op.rate === 'write' ? 20 : 120, op.rate === 'export' ? 86400000 : op.rate === 'mfa' || op.rate === 'auth' ? 900000 : 60000);
      if (op.id === 'revealOwnerPhone') await this.rate.consume('phone-reveal', session!.user_id, 10, 3600000);
      if (op.id === 'createMediaUpload') await this.rate.consume('media-upload', session!.user_id, 20, 3600000);
      const params = op.params ? schema(op.params).safeParse(req.params) : { success: Object.keys(req.params).length === 0, data: {} };
      const queryName = op.query === 'PageQuerySchema' ? 'PageQueryInputSchema' : op.query === 'ScopedAdminQuerySchema' ? 'ScopedAdminQueryInputSchema' : op.query === 'ModerationQuerySchema' ? 'ModerationQueryInputSchema' : op.query === 'AdminListingsQuerySchema' ? 'AdminListingsQueryInputSchema' : op.query;
      const query = queryName ? schema(queryName).safeParse(req.query) : { success: Object.keys(req.query).length === 0, data: {} };
      const body = op.request && op.requestEncoding !== 'binary' ? schema(op.request).safeParse(req.body) : { success: true, data: req.body ?? {} };
      if (!params.success || !query.success || !body.success) throw new AccountFault('VALIDATION_ERROR');
      const input: Input = { params: params.data as Input['params'], query: query.data as Input['query'], body: body.data };
      if (session && op.id !== 'logout') {
        await this.pool.query('UPDATE auth_sessions SET last_seen_at=now(),idle_expires_at=LEAST(absolute_expires_at,now()+($2::int*interval \'1 second\')) WHERE id=$1 AND revoked_at IS NULL', [session.id, requiresAdminMfa(session.account.roles) ? 900 : 86400]);
      }
      let data: unknown;
      if (['getCsrf','bootstrapCsrf','getAuthPolicy','register','login','logout','getMe','verifyMfa','startMfaEnrollment','verifyMfaEnrollment','stepUp'].includes(op.id)) data = await this.auth(op.id, input, req, res, session, challenge);
      else if(op.id==='provisionOwnerAccess'){
        if(!session||!session.account.roles.some((r:string)=>r==='admin'||r==='super-admin'))throw new AccountFault('FORBIDDEN');
        if(!this.admin.provisionOwnerAccess)throw new AccountFault('PROVIDER_UNAVAILABLE','disabled');
        const {password,...fields}=input.body;
        const passwordPhc=await this.hasher.hash(password);
        data=await this.admin.provisionOwnerAccess({...fields,ownerId:input.params.ownerId!,passwordPhc},{actorId:session.user_id,requestId:req.requestId});
      }
      else if (op.id === 'uploadMediaContent') { if (!this.media || !session) throw new AccountFault('PROVIDER_UNAVAILABLE', 'disabled'); data = await this.media.upload(req, input.params.mediaId!, session.user_id); }
      else {
        if (['writeCmsDraft','writeSettingsDraft'].includes(op.id) && CMS_KIND_BY_KEY[input.params.key as keyof typeof CMS_KIND_BY_KEY] !== input.body.document.kind) throw new AccountFault('VALIDATION_ERROR');
        if (!ENABLED_ADMIN.has(op.id)) throw new AccountFault('PROVIDER_UNAVAILABLE', 'disabled');
        data = await this.admin.execute(op.id, input, { actorId: session?.user_id ?? null, requestId: req.requestId });
      }
      const result = schema(op.response).safeParse({ data, meta: meta(req) });
      if (!result.success) throw new AccountFault('PROVIDER_UNAVAILABLE');
      res.status(op.status).json(result.data);
    } catch (error) {
      if (error instanceof AccountFault && ['UNAUTHORIZED','FORBIDDEN','CSRF_INVALID','STEP_UP_REQUIRED','MFA_INVALID','INVALID_CREDENTIALS'].includes(error.code)) await this.deny(req, op, session?.user_id ?? null);
      const code = (error as { code?: string })?.code;
      if (!(error instanceof AccountFault) && ['NOT_FOUND','CONFLICT','FORBIDDEN'].includes(code ?? '')) throw new AccountFault(code as 'NOT_FOUND' | 'CONFLICT' | 'FORBIDDEN');
      if (code === 'INVALID_STATE' || code === '23505') throw new AccountFault('CONFLICT');
      throw error;
    }
  }
  private async auth(id: string, input: Input, req: ApiRequest, res: Response, session: Session | null, challenge: Challenge | null): Promise<unknown> {
    const body = input.body;
    if (id === 'getCsrf' || id === 'bootstrapCsrf') {
      const token = opaque();
      if (session) {
        // Rotate tokens after 24h while preserving the original absolute expiry.
        if (Date.now() - new Date(session.created_at).getTime() >= 86400000) {
          const issued = await withTransaction(this.pool, async client => { const repo = new AccountsRepository(client); await repo.revokeSession(session.user_id, session.id); return this.issue(repo, session.account, session.assurance, false, session.absolute_expires_at); });
          this.setCookie(res, 'session', issued.token, Math.ceil((new Date(issued.session.absolute_expires_at).getTime() - Date.now()) / 1000)); session = issued.session;
        }
        await this.pool.query('UPDATE auth_sessions SET csrf_digest=$2 WHERE id=$1 AND revoked_at IS NULL', [session.id, digest(token)]);
        return { token, expiresAt: iso(session.idle_expires_at), context: 'session' };
      }
      if (challenge) {
        await this.pool.query('UPDATE auth_challenges SET csrf_digest=$2 WHERE id=$1 AND consumed_at IS NULL', [challenge.id, digest(token)]);
        return { token, expiresAt: iso(challenge.expires_at), context: 'preauth' };
      }
      const context = await this.newChallenge(this.repo, null, 'preauth');
      await this.pool.query('UPDATE auth_challenges SET csrf_digest=$2 WHERE id=$1', [context.row.id, digest(token)]);
      this.setCookie(res, 'preauth', context.token, 600);
      return { token, expiresAt: iso(context.row.expires_at), context: 'preauth' };
    }
    if (id === 'getAuthPolicy') {
      const terms = await this.admin.execute('getPublishedContent', { params: { key: 'terms' }, query: {}, body: {} }, { actorId: null, requestId: req.requestId }) as any;
      const privacy = await this.admin.execute('getPublishedContent', { params: { key: 'privacy' }, query: {}, body: {} }, { actorId: null, requestId: req.requestId }) as any;
      if (terms.document.kind !== 'legal' || privacy.document.kind !== 'legal') throw new AccountFault('PROVIDER_UNAVAILABLE');
      return { terms: { version: terms.document.documentVersion, path: '/terms' }, privacy: { version: privacy.document.documentVersion, path: '/privacy' }, emailVerification: 'unavailable', passwordReset: 'unavailable' };
    }
    if (id === 'getMe') { if (!session) throw new AccountFault('UNAUTHORIZED'); return this.authentication(session); }
    if (id === 'logout') {
      await withTransaction(this.pool, async client => { const repo = new AccountsRepository(client); if (session) await repo.revokeSession(session.user_id, session.id); if (challenge) await repo.consumeChallenge(challenge.token_digest); });
      this.clear(res, 'session'); this.clear(res, 'preauth'); return { done: true };
    }
    if (id === 'register') {
      throw new AccountFault('PROVIDER_UNAVAILABLE','disabled');

    }
    if (id === 'login') {
      if (!challenge || challenge.kind !== 'preauth') throw new AccountFault('UNAUTHORIZED');
      await this.rate.consume('login-email', body.email, 5, 900000); await this.rate.consume('login-ip', req.ip ?? '', 20, 900000);
      const user = await this.repo.findUserByEmail(body.email);
      const valid = await this.hasher.verify(body.password, user?.password_phc ?? null);
      if (!valid || !user || user.status !== 'active') throw new AccountFault('INVALID_CREDENTIALS');
      const account = await this.repo.getAccount(user.id);
      if (requiresAdminMfa(account.roles) && !account.emailVerified) throw new AccountFault('INVALID_CREDENTIALS');
      if (account.mfaEnrolled || requiresAdminMfa(account.roles)) {
        const context = await withTransaction(this.pool, async client => { const repo = new AccountsRepository(client); await repo.consumeChallenge(challenge.token_digest); if (session) await repo.revokeSession(session.user_id, session.id); return this.newChallenge(repo, user.id, 'login'); });
        this.clear(res, 'session'); this.setCookie(res, 'preauth', context.token, 300);
        return { status: account.mfaEnrolled ? 'mfa_required' : 'mfa_enrollment_required', expiresAt: iso(context.row.expires_at), attemptsRemaining: 5 };
      }
      const issued = await withTransaction(this.pool, async client => { const repo = new AccountsRepository(client); await repo.consumeChallenge(challenge.token_digest); if (session) await repo.revokeSession(session.user_id, session.id); return this.issue(repo, account, 'password'); });
      this.clear(res, 'preauth'); this.setCookie(res, 'session', issued.token, 7 * 86400); return this.authentication(issued.session);
    }
    if (id === 'startMfaEnrollment') {
      const userId = session?.user_id ?? challenge?.user_id;
      if (!userId) throw new AccountFault('UNAUTHORIZED');
      const user = await this.repo.getAuthUser(userId); if (!user || user.status !== 'active') throw new AccountFault('UNAUTHORIZED');
      if (session && session.assurance !== 'recovery' && (!session.step_up_until || new Date(session.step_up_until).getTime() <= Date.now())) throw new AccountFault('STEP_UP_REQUIRED');
      if (!session && (challenge?.kind !== 'login' || user.mfa)) throw new AccountFault('FORBIDDEN');
      if (requiresAdminMfa(user.account.roles) && !user.account.emailVerified) throw new AccountFault('EMAIL_VERIFICATION_REQUIRED');
      const secret = base32(randomBytes(20));
      const enrollmentPayload = JSON.stringify({ secret, allowReplace: !!session && (session.assurance === 'recovery' || session.assurance === 'mfa') });
      const context = await withTransaction(this.pool, async client => { const repo = new AccountsRepository(client); if (challenge) await repo.consumeChallenge(challenge.token_digest); return this.newChallenge(repo, userId, 'enrollment', this.cipher.seal(userId, enrollmentPayload)); });
      this.setCookie(res, 'preauth', context.token, 300);
      // An active session is revoked before enrollment, so CSRF always binds to the enrollment context.
      if (session) { await this.repo.revokeSession(session.user_id, session.id); this.clear(res, 'session'); }
      return { secret, issuer: 'Рядом by Patchvale', accountLabel: user.account.email, algorithm: 'SHA1', digits: 6, period: 30, expiresAt: iso(context.row.expires_at) };
    }
    if (id === 'verifyMfaEnrollment' || id === 'verifyMfa') {
      if (!challenge?.user_id || (id === 'verifyMfaEnrollment' ? challenge.kind !== 'enrollment' : challenge.kind !== 'login')) throw new AccountFault('UNAUTHORIZED');
      // Increment outside the verification transaction: failed codes must consume an attempt.
      const attempted = await this.repo.attemptChallenge(challenge.token_digest); if (!attempted) throw new AccountFault('MFA_INVALID');
      const user = await this.repo.getAuthUser(challenge.user_id); if (!user || user.status !== 'active') throw new AccountFault('MFA_INVALID');
      const enrollment = id === 'verifyMfaEnrollment';
      const envelope: EncryptedSecret | undefined = enrollment ? challenge.encrypted_secret : user.mfa?.encrypted_secret;
      const useRecovery = !enrollment && body.factor === 'recovery';
      const recovery = useRecovery ? user.recoveryCodes.find((record: { digest: string }) => checkRecovery(body.code, record.digest)) : undefined;
      const enrollmentPayload: { secret: string; allowReplace: boolean } | null = enrollment && envelope ? JSON.parse(this.cipher.open(user.id, envelope)) : null;
      const secret = enrollmentPayload?.secret ?? (envelope ? this.cipher.open(user.id, envelope) : null);
      const step = !useRecovery && secret ? verifyTotp(secret, body.code) : null;
      if (useRecovery ? !recovery : step === null) throw new AccountFault('MFA_INVALID');
      const codes = enrollment ? recoveryCodes() : [];
      const hashes = codes.map(hashRecovery);
      const issued = await withTransaction(this.pool, async client => {
        const repo = new AccountsRepository(client); await repo.consumeChallenge(challenge.token_digest);
        if (enrollment) {
          await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [user.id]);
          if (await repo.getMfa(user.id) && !enrollmentPayload?.allowReplace) throw new AccountFault('CONFLICT');
          await repo.setMfa(user.id, this.cipher.seal(user.id, secret!), step!, hashes);
          await client.query('UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1', [user.id]);
        } else if (useRecovery ? !await repo.consumeRecovery(user.id, recovery!.digest) : !await repo.consumeTotp(user.id, step!)) throw new AccountFault('MFA_INVALID');
        const account = await repo.getAccount(user.id);
        await client.query("INSERT INTO audit_events(actor_id,request_id,action,resource_type,resource_id,changed_fields) VALUES($1::uuid,$2,$3,'user',$1::text,$4)", [user.id, req.requestId, enrollment ? 'mfa.enrolled' : 'mfa.verified', ['assurance']]);
        return this.issue(repo, account, useRecovery ? 'recovery' : 'mfa', !useRecovery);
      });
      this.clear(res, 'preauth'); this.setCookie(res, 'session', issued.token, requiresAdminMfa(issued.session.account.roles) ? 8 * 3600 : 7 * 86400);
      const authentication = this.authentication(issued.session);
      return enrollment ? { authentication, recoveryCodes: codes } : authentication;
    }
    if (id === 'stepUp') {
      if (!session || session.assurance === 'recovery') throw new AccountFault('FORBIDDEN');
      const user = await this.repo.getAuthUser(session.user_id);
      if (!user || !await this.hasher.verify(body.password, user.password_phc)) throw new AccountFault('INVALID_CREDENTIALS');
      if (!user.mfa) {
        if (requiresAdminMfa(user.account.roles)) throw new AccountFault('MFA_REQUIRED');
        const issued = await withTransaction(this.pool, async client => { const repo = new AccountsRepository(client); await repo.revokeSession(user.id, session.id); return this.issue(repo, user.account, 'password', true, session.absolute_expires_at); });
        this.setCookie(res, 'session', issued.token, Math.ceil((new Date(issued.session.absolute_expires_at).getTime() - Date.now()) / 1000));
        return { verifiedUntil: iso(issued.session.step_up_until) };
      }
      if (!body.totp) throw new AccountFault('MFA_REQUIRED');
      const step = verifyTotp(this.cipher.open(user.id, user.mfa.encrypted_secret), body.totp); if (step === null) throw new AccountFault('MFA_INVALID');
      const issued = await withTransaction(this.pool, async client => { const repo = new AccountsRepository(client); if (!await repo.consumeTotp(user.id, step)) throw new AccountFault('MFA_INVALID'); await repo.revokeSession(user.id, session.id); return this.issue(repo, user.account, 'mfa', true, session.absolute_expires_at); });
      this.setCookie(res, 'session', issued.token, Math.ceil((new Date(issued.session.absolute_expires_at).getTime() - Date.now()) / 1000));
      return { verifiedUntil: iso(issued.session.step_up_until) };
    }
    throw new AccountFault('PROVIDER_UNAVAILABLE', 'disabled');
  }
}
