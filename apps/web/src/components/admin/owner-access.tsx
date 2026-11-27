'use client';
import { useId, useRef, useState, type FormEvent } from 'react';
import * as C from '@ryadom/accounts-types';
import { adminRequest, adminMessage, jsonWrite } from '@/lib/admin/api';
import { Drawer } from './dialog';
import { Reason } from './forms';

export function OwnerAccess({ owner, close, done, stepUp }: { owner: Extract<C.OwnerCrm, { dataScope: 'production' }>; close: () => void; done: (message: string) => void; stepUp: () => void }) {
  const formId = useId(); const sending = useRef(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [visible, setVisible] = useState(false);
  const mode = owner.accountId === null ? 'create' : 'reset';
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (sending.current) return;
    const form = e.currentTarget; const fields = new FormData(form); sending.current = true; setBusy(true); setError('');
    try {
      const body = C.OwnerAccessRequestSchema.parse({ mode, expectedVersion: owner.version, email: fields.get('email'), password: fields.get('password'), reason: fields.get('reason') });
      const result = await adminRequest(`/admin/crm/owners/${owner.id}/access`, C.OwnerAccessResponseSchema, jsonWrite('POST', body));
      form.reset(); setVisible(false);
      done(result.data.mode === 'create' ? 'Сервер создал индивидуальный доступ владельцу. Передайте логин и пароль лично по согласованному защищённому каналу. Права и оплата не подтверждены.' : 'Сервер сменил пароль владельца и отозвал прежние сессии. Передайте новый пароль лично по согласованному защищённому каналу.');
    } catch (err) { form.reset(); setVisible(false); setError(adminMessage(err)); }
    finally { sending.current = false; setBusy(false); }
  }
  return <Drawer title="Доступ владельца" close={close}><form className="admin-form" onSubmit={submit}><h3>{owner.displayName}</h3><p>{mode === 'create' ? 'Создайте индивидуальный логин и пароль для этого реального владельца. Создание доступа не принимает условия за клиента и не подтверждает почту, бизнес или оплату.' : 'Введите существующий логин этого владельца и новый индивидуальный пароль. Сервер отклонит другой адрес и отзовёт прежние сессии. Доступ сотрудников через эту форму не изменяется.'}</p><p>Пароль не отображается после сохранения, не сохраняется в хранилище браузера и не включается в аудит. Не используйте общий пароль или заметки CRM для передачи доступа.</p>
    <fieldset disabled={busy} className="admin-form" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}><legend>Индивидуальные данные входа</legend>
      <label htmlFor={`${formId}-email`}>Логин — электронная почта</label><input id={`${formId}-email`} name="email" type="email" autoComplete="off" maxLength={254} required />
      <label htmlFor={`${formId}-password`}>Новый пароль</label><input id={`${formId}-password`} name="password" type={visible ? 'text' : 'password'} autoComplete="new-password" minLength={12} maxLength={128} required spellCheck={false} autoCapitalize="none" />
      <button type="button" aria-pressed={visible} aria-controls={`${formId}-password`} onClick={() => setVisible(v => !v)}>{visible ? 'Скрыть новый пароль' : 'Показать новый пароль'}</button><p className="admin-muted">12–128 символов. Пробелы сохраняются. Пароль вводит оператор; сервер хранит только защищённый хеш.</p>
      <Reason /><label className="admin-check"><input type="checkbox" required />Передам индивидуальные данные доступа только этому владельцу по согласованному защищённому каналу.</label>
      {error && <p className="admin-error" role="alert">{error}</p>}
      <button type="button" onClick={stepUp}>Подтвердить MFA и открыть доступ заново</button>
      <button className="admin-primary">{busy ? 'Проверяем и сохраняем…' : mode === 'create' ? 'Создать доступ' : 'Сменить пароль владельца'}</button>
    </fieldset></form></Drawer>;
}
