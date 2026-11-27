'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { LoginRequestSchema, LoginResponseSchema, MeResponseSchema, TotpEnrollmentResponseSchema, EnrollmentResponseSchema, requiresAdminMfa } from '@ryadom/accounts-types';
import { adminRequest, adminMessage, jsonWrite } from '@/lib/admin/api';
export function AdminLogin() {
  const [stage, setStage] = useState<'password' | 'mfa_required' | 'mfa_enrollment_required' | 'codes'>('password');
  const [secret, setSecret] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError(''); const f = new FormData(e.currentTarget);
    try {
      if (stage === 'password') {
        const body = LoginRequestSchema.parse({ email: f.get('email'), password: f.get('password') });
        const result = await adminRequest('/auth/login', LoginResponseSchema, jsonWrite('POST', body));
        if (result.data.status !== 'authenticated') { setStage(result.data.status); return; }
        if (!requiresAdminMfa(result.data.account.roles) || result.data.session.assurance !== 'mfa') { setError('Эта сессия не имеет доступа к административной панели.'); return; }
        window.location.assign('/admin');
      } else if (stage === 'mfa_required') {
        const result = await adminRequest('/auth/mfa/verify', MeResponseSchema, jsonWrite('POST', { factor: 'totp', code: f.get('code') }));
        if (result.data.session.assurance === 'mfa') window.location.assign('/admin');
      } else {
        const result = await adminRequest('/auth/mfa/enrollment/verify', EnrollmentResponseSchema, jsonWrite('POST', { code: f.get('code') }));
        setCodes(result.data.recoveryCodes); setSecret(null); setStage('codes');
      }
    } catch (err) { setError(adminMessage(err)); } finally { setBusy(false); }
  }
  async function enroll() { setBusy(true); setError(''); try { const r = await adminRequest('/auth/mfa/enrollment', TotpEnrollmentResponseSchema, jsonWrite('POST', {})); setSecret(r.data.secret); } catch (err) { setError(adminMessage(err)); } finally { setBusy(false); } }
  return <main className="admin-gate"><span className="admin-kicker">Рядом / доступ оператора</span><h1>{stage === 'password' ? 'Войти в управление' : stage === 'codes' ? 'Сохраните коды восстановления' : 'Подтвердите MFA'}</h1><p>Доступ выдаёт уполномоченный оператор. Если сервер не настроен, вход будет недоступен; учётные данные по умолчанию отсутствуют.</p>{error && <p role="alert" className="admin-error">{error}</p>}
    {stage === 'codes' ? <><p>Коды показаны один раз. Сохраните их в защищённом месте. Восстановленная сессия не даёт административных прав.</p><ul>{codes.map(code => <li key={code}><code>{code}</code></li>)}</ul><button onClick={() => { setCodes([]); window.location.assign('/admin'); }}>Коды сохранены, продолжить</button></> : <form onSubmit={submit} className="admin-form">
      {stage === 'password' ? <><label>Электронная почта<input name="email" type="email" required autoComplete="username" maxLength={254} /></label><label>Пароль<input name="password" type="password" required minLength={12} maxLength={128} autoComplete="current-password" /></label></> : <>{stage === 'mfa_enrollment_required' && <><p>Добавьте секрет в приложение-аутентификатор вручную. Не отправляйте его сторонним QR сервисам.</p>{secret ? <label>Секрет TOTP<code className="admin-secret">{secret}</code></label> : <button type="button" disabled={busy} onClick={enroll}>Получить секрет TOTP</button>}</>}<label>Код из приложения<input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required /></label></>}
      <button className="admin-primary" disabled={busy || (stage === 'mfa_enrollment_required' && !secret)}>{busy ? 'Проверяем…' : stage === 'password' ? 'Продолжить' : 'Подтвердить'}</button>
    </form>}<div className="admin-actions"><Link prefetch={false} href="/admin/demo">Посмотреть демонстрацию</Link><Link prefetch={false} href="/">На сайт</Link></div></main>;
}
