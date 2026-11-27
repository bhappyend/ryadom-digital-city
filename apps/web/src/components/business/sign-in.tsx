'use client';
import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import * as C from '@ryadom/accounts-types';
import { adminRequest, adminMessage, jsonWrite, AdminError } from '@/lib/admin/api';
import styles from './account.module.css';

export function AccountForm({ initialSlug }: { initialSlug?: string | undefined }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [challenge, setChallenge] = useState(false); const sending = useRef(false);
  function enter(auth: C.Authenticated) { window.location.assign(C.requiresAdminMfa(auth.account.roles) ? '/admin' : '/auth/business' + (initialSlug ? `?place=${initialSlug}` : '')); }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (sending.current) return;
    const form = new FormData(e.currentTarget); setError(''); sending.current = true; setBusy(true);
    try {
      if (challenge) {
        const r = await adminRequest('/auth/mfa/verify', C.MeResponseSchema, jsonWrite('POST', C.MfaVerifyRequestSchema.parse({ factor: 'totp', code: form.get('code') }))); enter(r.data);
      } else {
        const r = await adminRequest('/auth/login', C.LoginResponseSchema, jsonWrite('POST', C.LoginRequestSchema.parse({ email: form.get('email'), password: form.get('password') })));
        if (r.data.status === 'authenticated') enter(r.data);
        else if (r.data.status === 'mfa_required') setChallenge(true);
        else setError('Для этой учётной записи требуется настройка MFA. Продолжите через вход оператора.');
      }
    } catch (err) { setError(err instanceof AdminError && err.code === 'INVALID_CREDENTIALS' ? 'Не удалось войти. Проверьте почту и пароль.' : adminMessage(err)); }
    finally { sending.current = false; setBusy(false); }
  }
  return <main id="main" className={`${styles.shell} ${styles.narrow}`}><nav className={styles.nav} aria-label="Навигация бизнеса"><Link prefetch={false} href="/">Рядом by Patchvale</Link><Link prefetch={false} href="/business/pricing">Условия размещения</Link></nav><h1>{challenge ? 'Подтвердить вход' : 'Вход для бизнеса'}</h1><p>Введите логин и пароль, выданные администратором для вашего бизнеса. Поиск организаций и маршрутов доступен всем без входа.</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <form key={String(challenge)} className={styles.form} onSubmit={submit}>
      <fieldset disabled={busy} className={styles.form} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}><legend>Доступ к кабинету бизнеса</legend>
      {challenge ? <label>Код из приложения-аутентификатора<input name="code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required autoFocus /></label> : <><label>Логин — электронная почта<input name="email" type="email" required maxLength={254} autoComplete="username" /></label><label>Пароль<input name="password" type="password" required minLength={12} maxLength={128} autoComplete="current-password" /></label></>}
      <button className={styles.primary}>{busy ? 'Проверяем…' : challenge ? 'Подтвердить код' : 'Войти в кабинет'}</button></fieldset>
    </form>
    <section className={styles.panel}><h2>Нужен доступ или новый пароль?</h2><p>Свяжитесь с основателем для проверки полномочий и выдачи доступа. Общего пароля для всех владельцев нет. Проверка прав, месячные условия и оплата оформляются отдельно.</p><nav className={styles.nav} aria-label="Контакты для доступа"><a href="https://vk.ru/desktopcoder" target="_blank" rel="noopener noreferrer">VK · desktopcoder</a><a href="https://t.me/desktopcoder" target="_blank" rel="noopener noreferrer">Telegram · desktopcoder</a></nav></section><nav className={styles.nav} aria-label="Другие разделы"><Link prefetch={false} href="/map">Открыть карту без входа</Link><Link prefetch={false} href="/auth/admin">Вход оператора / MFA</Link></nav>
  </main>;
}

