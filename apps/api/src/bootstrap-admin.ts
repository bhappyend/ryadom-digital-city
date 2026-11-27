import { randomUUID } from 'node:crypto';
import { createInterface, emitKeypressEvents } from 'node:readline';
import { AccountsRepository, createDatabasePool } from '@ryadom/db/compiled';
import { EmailSchema, PasswordSchema, ConsentVersionSchema } from '@ryadom/accounts-types';
import { digest, equal, PasswordHasher } from './account-crypto.js';

async function hidden(label: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Interactive terminal required');
  process.stdout.write(label); emitKeypressEvents(process.stdin); process.stdin.setRawMode(true); process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const cleanup = () => { process.stdin.off('keypress', key); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n'); };
    const key = (text: string, event: { name?: string; ctrl?: boolean }) => {
      if (event.ctrl && event.name === 'c') { cleanup(); reject(new Error('Cancelled')); }
      else if (event.name === 'return') { cleanup(); resolve(value); }
      else if (event.name === 'backspace') value = value.slice(0, -1);
      else if (text && !/[\u0000-\u001f\u007f]/.test(text) && value.length < 256) value += text;
    };
    process.stdin.on('keypress', key);
  });
}
async function question(label: string) { const rl = createInterface({ input: process.stdin, output: process.stdout }); try { return await new Promise<string>(resolve => rl.question(label, resolve)); } finally { rl.close(); } }
export async function bootstrapAdmin(env: NodeJS.ProcessEnv = process.env) {
  if (process.argv.length !== 2) throw new Error('No command-line credentials accepted');
  const expected = env.ACCOUNT_BOOTSTRAP_SECRET_SHA256;
  const expiry = Date.parse(env.ACCOUNT_BOOTSTRAP_EXPIRES_AT ?? '');
  if (!expected || !/^[0-9a-f]{64}$/.test(expected) || !Number.isFinite(expiry) || expiry <= Date.now() || expiry > Date.now() + 15 * 60_000) throw new Error('Short-lived bootstrap authorization is not configured');
  const provided = await hidden('Одноразовый секрет запуска (ввод скрыт): ');
  if (!equal(digest(provided), expected)) throw new Error('Bootstrap authorization failed');
  const email = EmailSchema.parse(await question('Ваш email: '));
  const displayName = await question('Ваше имя: ');
  if (!displayName.trim() || displayName.length > 100) throw new Error('Invalid name');
  const reason = await question('Основание независимой проверки личности (без секретов, минимум 10 символов): ');
  if (reason.trim().length < 10) throw new Error('Identity verification required');
  if (await question('Подтвердите независимую проверку личности: введите IDENTITY VERIFIED: ') !== 'IDENTITY VERIFIED') throw new Error('Identity verification required');
  const termsVersion = ConsentVersionSchema.parse(await question('Принятая вами версия условий: '));
  const privacyVersion = ConsentVersionSchema.parse(await question('Принятая вами версия политики: '));
  if (await question('Вы лично приняли эти условия и политику? Введите ACCEPT: ') !== 'ACCEPT') throw new Error('Consent required');
  const password = PasswordSchema.parse(await hidden('Пароль 12–128 символов (ввод скрыт): '));
  if (!equal(password, await hidden('Повторите пароль (ввод скрыт): '))) throw new Error('Passwords do not match');
  const phc = await new PasswordHasher().hash(password);
  const pool = createDatabasePool(env.ACCOUNTS_BOOTSTRAP_DATABASE_URL);
  try {
    await new AccountsRepository(pool).bootstrapSuperAdmin({ email, displayName, passwordPhc: phc, termsVersion, privacyVersion, emailVerifiedAt: new Date().toISOString() }, { actorId: null, requestId: randomUUID() }, reason);
    console.info('Первичный администратор создан. Войдите и завершите MFA. Сессия не создана. Удалите одноразовую конфигурацию bootstrap.');
  } finally { await pool.end(); delete env.ACCOUNT_BOOTSTRAP_SECRET_SHA256; }
}
if (require.main === module) void bootstrapAdmin().catch(() => { console.error('Создание администратора не выполнено. Проверьте локальную конфигурацию и введённые данные.'); process.exitCode = 1; });
