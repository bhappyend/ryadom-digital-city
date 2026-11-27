// JSON is YAML 1.2. Generate from the same compiled DTOs and operation registry used by consumers.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const c = require('../dist/index.js');
const { z } = require('zod');
const schemas = {};
for (const [name, value] of Object.entries(c.ACCOUNT_SCHEMAS).filter(([name, value]) => name.endsWith('Schema') && value?._zod).sort(([a], [b]) => a.localeCompare(b, 'en'))) {
  const schema = z.toJSONSchema(value, { target: 'draft-2020-12', io: /(?:Request|Params|Query|QueryInput|Email)Schema$/.test(name) ? 'input' : 'output' });
  delete schema.$schema;
  schemas[name.replace(/Schema$/, '')] = schema;
}
const ref = name => ({ $ref: `#/components/schemas/${name.replace(/Schema$/, '')}` });
const content = name => ({ 'application/json': { schema: ref(name) } });
const errors = Object.fromEntries([...new Set(Object.values(c.ACCOUNTS_ERROR_STATUS))].sort((a,b) => a-b).map(status => [status, {
  description: Object.entries(c.ACCOUNTS_ERROR_STATUS).filter(([,s]) => s === status).map(([code]) => code).join(', '),
  content: content('AccountsApiErrorSchema'),
  ...(status === 429 ? { headers: { 'Retry-After': { schema: { type: 'integer', minimum: 1 }, description: 'Seconds until retry permitted' } } } : {})
}]));
const paths = {};
for (const op of c.ACCOUNT_OPERATIONS) {
  const parameters = [];
  for (const [where, schemaName] of [['path', op.params], ['query', op.query]]) {
    if (!schemaName) continue;
    const schema = schemas[schemaName.replace(/Schema$/, '')];
    for (const [name, value] of Object.entries(schema.properties)) parameters.push({ name, in: where, required: where === 'path' || (schema.required?.includes(name) ?? false), schema: value, description: where === 'query' ? 'One scalar value; unknown/repeated parameters rejected' : 'Strict path parameter' });
  }
  const exactOrigin = op.csrf || op.csrfBootstrap === true || op.id === 'getCsrf';
  if (exactOrigin) parameters.push({ name: 'Origin', in: 'header', required: true, schema: { type: 'string', format: 'uri' }, description: 'Exact configured frontend origin; missing/null/foreign is rejected, including local development. Browser POST supplies Origin automatically; clients must not set a forbidden Origin header.' });
  if (op.csrf) parameters.push({ name: 'X-CSRF-Token', in: 'header', required: true, schema: schemas.Csrf.properties.token, description: 'Synchronizer token bound to this session or preauth context' });
  const security = op.access === 'public' ? [] : op.access === 'session' || op.access === 'admin' || op.access === 'verified-owner' ? [{ sessionCookie: [] }] : [{ preauthCookie: [] }, { sessionCookie: [] }];
  const operation = {
    operationId: op.id, tags: [op.path.split('/')[1]], parameters, security,
    'x-ryadom-guards': { access: op.access, permission: op.permission ?? null, csrf: op.csrf, csrfBootstrap: op.csrfBootstrap ?? false, exactOrigin, verifiedEmail: op.verifiedEmail || op.access === 'admin', mfa: ['admin', 'verified-owner'].includes(op.access), stepUp: op.stepUp ?? false, ownership: op.ownership ?? null, rate: op.rate, maxBodyBytes: op.maxBodyBytes ?? 16384 },
    description: op.csrfBootstrap ? 'Browser CSRF bootstrap only: JSON {} and exact Origin/Fetch Metadata validation, auth rate limit, no existing CSRF token needed. Creates only opaque preauth context or returns token for live session; no authentication or account mutation. No-store. Guard exception bound to this handler, not raw path.' : 'Contract only; enable after implementation gates. Cache-Control: no-store. Unsafe methods require exact Origin and bound CSRF, except the separately declared bootstrapCsrf handler. Admin routes require verified email, completed MFA, live server RBAC; object scope checked in the transaction. See ARCHITECTURE-ACCOUNTS.md for state and conditional enrollment guards.',
    ...(op.request ? { requestBody: { required: true, content: op.requestEncoding === 'binary' ? { 'application/octet-stream': { schema: { type: 'string', format: 'binary', minLength: 1, maxLength: op.maxBodyBytes }, 'x-ryadom-validation': 'Bound stream before buffering, verify ticket digest and raster MIME+magic, decode/reencode; never parse bytes as JSON/Zod string' } } : content(op.request) } } : {}),
    responses: { [op.status]: { description: op.status === 202 ? 'Durably accepted; pending work or moderation, never fake completion' : 'Validated response', content: content(op.response), headers: { 'Cache-Control': { schema: { const: 'no-store' } } } }, ...errors }
  };
  paths[op.path] ??= {};
  paths[op.path][op.method] = operation;
}
const doc = {
  openapi: '3.1.0',
  info: { title: 'Рядом — accounts, sessions, moderation, CMS and business contracts', version: c.ACCOUNTS_CONTRACT_VERSION, description: 'Additive stage 2 specification under /api/v1; original stage 1 OpenAPI/ErrorCode remain unchanged. Not a deployment claim. Zod additionally enforces role/MFA session consistency, consent states, safe URLs without credentials/controls, unique roles/plans, plain CMS text and 12000-byte document budget, review targets and publication, optimistic versions and export section consistency. Request body <=16KiB. Server controls are not implemented by JSON Schema.' },
  servers: [{ url: 'http://localhost:3001/api/v1', description: 'Explicit local development only; production requires HTTPS' }],
  paths,
  components: { securitySchemes: { sessionCookie: { type: 'apiKey', in: 'cookie', name: '__Host-ryadom-session', description: 'Opaque random token; server stores digest. Secure HttpOnly SameSite=Lax Path=/ no Domain. HTTP loopback development uses ryadom-session-dev only under explicit dev configuration.' }, preauthCookie: { type: 'apiKey', in: 'cookie', name: '__Host-ryadom-preauth', description: 'Opaque pending context, no account privileges. Bound CSRF required; challenge expires in 5min. HTTP dev uses ryadom-preauth-dev.' } }, schemas }
};
const serialized = `${JSON.stringify(doc, null, 2)}\n`;
const destination = new URL('../../../docs/openapi-accounts.yaml', import.meta.url);
if (process.argv.includes('--check')) {
  if (readFileSync(destination, 'utf8') !== serialized) throw new Error('Accounts OpenAPI drift: build accounts-types and run contracts:generate');
  console.log(`Accounts OpenAPI matches runtime schemas (${c.ACCOUNT_OPERATIONS.length} operations).`);
} else {
  writeFileSync(destination, serialized);
  console.log(`Generated accounts OpenAPI (${c.ACCOUNT_OPERATIONS.length} operations).`);
}
