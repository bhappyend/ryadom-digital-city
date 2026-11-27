'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import * as C from '@ryadom/accounts-types';
import { adminRequest, adminMessage, jsonWrite } from '@/lib/admin/api';
import { claimDecisions, claimStatuses, listingApprovalGaps, verificationMethods, type AdminClaim } from '@/lib/admin/business-verification/policy';
import { Drawer } from '../dialog';
import styles from './verification.module.css';

type Access = { can: (permission: string) => boolean; onRequireStepUp?: (() => void) | undefined };
const decisions = { verify: 'Подтвердить права', reject: 'Отклонить заявку', revoke: 'Отозвать подтверждение' };

export function BusinessVerificationQueue({ actorId, can, revision, onRequireStepUp }: Access & { actorId: string; revision: number }) {
  const [items, setItems] = useState<AdminClaim[]>([]);
  const [page, setPage] = useState(1); const [more, setMore] = useState(false);
  const [refresh, setRefresh] = useState(0); const [loading, setLoading] = useState(true);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<AdminClaim | null>(null);
  const allowed = can('claims:read');
  useEffect(() => {
    const ac = new AbortController(); setItems([]); setMore(false); setSelected(null); setError('');
    if (!allowed) { setLoading(false); return () => ac.abort(); }
    setLoading(true);
    adminRequest(`/admin/claims?page=${page}&limit=20`, C.AdminClaimsResponseSchema, { signal: ac.signal })
      .then(r => { if (!ac.signal.aborted) { setItems(r.data.items); setMore(r.data.pagination.hasMore); } })
      .catch(err => { if (!ac.signal.aborted) setError(adminMessage(err)); })
      .finally(() => { if (!ac.signal.aborted) setLoading(false); });
    return () => ac.abort();
  }, [allowed, actorId, page, revision, refresh]);
  if (!allowed) return <p>Нет разрешения на чтение заявок о правах владельца.</p>;
  return <section className={styles.scope} aria-label="Проверка владельцев" aria-busy={loading}>
    <h2>Проверка прав владельца</h2>
    <p>Сверьте полномочия заявителя с независимым источником. Запись CRM, оплаченный месяц и телефон, изменённый самим заявителем, не подтверждают права.</p>
    <div className="admin-actions"><button type="button" onClick={() => { setNotice(''); setRefresh(v => v + 1); }}>Обновить заявки о правах</button>{onRequireStepUp && <button type="button" onClick={onRequireStepUp}>Подтвердить MFA перед решением</button>}</div>
    {error && <p role="alert" className="admin-error">{error}</p>}
    {notice && <p role="status" className="admin-success">{notice}</p>}
    {loading && <p role="status">Загружаем реальные заявки о правах…</p>}
    {!loading && !error && items.length === 0 && <p className="admin-empty">Заявок на этой странице нет. Открытые карточки каталога не являются заявками владельцев.</p>}
    {items.map(item => <article key={item.claim.id} className={styles.record}>
      <h3>{claimStatuses[item.claim.status]}</h3>
      <dl className={styles.facts}><dt>Организация</dt><dd>{item.claim.placeId}</dd><dt>Заявитель</dt><dd>{item.applicantId}</dd><dt>Полномочия</dt><dd>{item.relationship === 'owner' ? 'Владелец' : 'Уполномоченный представитель'}</dd></dl>
      <p><small>Заявка {item.claim.id} · версия {item.claim.version}</small></p>
      <button type="button" onClick={() => setSelected(item)}>Изучить доказательства и решение</button>
    </article>)}
    <div className="admin-actions"><button type="button" disabled={loading || page <= 1} onClick={() => setPage(v => v - 1)}>Предыдущие заявки о правах</button><span>Страница {page}</span><button type="button" disabled={loading || !more || page >= 100} onClick={() => setPage(v => v + 1)}>Следующие заявки о правах</button></div>
    {selected && <ClaimReview key={`${selected.claim.id}-${selected.claim.version}`} item={selected} actorId={actorId} can={can} close={() => setSelected(null)} done={() => { setSelected(null); setNotice('Сервер сохранил решение с аудитом. Проверка прав сама по себе не активирует подписку.'); setRefresh(v => v + 1); }} onRequireStepUp={onRequireStepUp} />}
  </section>;
}

function ClaimReview({ item, actorId, can, close, done, onRequireStepUp }: Access & { item: AdminClaim; actorId: string; close: () => void; done: () => void }) {
  const formId = useId();
  const available = can('claims:decide') ? claimDecisions(item, actorId) : [];
  const [decision, setDecision] = useState<(typeof available)[number]>(available[0] ?? 'reject');
  const [method, setMethod] = useState(''); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''); const [stale, setStale] = useState(false); const sending = useRef(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (sending.current || stale || !available.includes(decision)) return;
    const form = new FormData(e.currentTarget); setError('');
    try {
      const body = C.ClaimDecisionRequestSchema.parse({ decision, expectedVersion: item.claim.version, verificationMethod: method, verificationNote: form.get('note') });
      sending.current = true; setBusy(true);
      await adminRequest(`/admin/claims/${item.claim.id}/decision`, C.AdminClaimResponseSchema, jsonWrite('POST', body)); done();
    } catch (err) { setError(adminMessage(err)); if (sending.current) setStale(true); }
    finally { sending.current = false; setBusy(false); }
  }
  return <Drawer title="Проверка доказательств владения" close={close}><div className={styles.scope}>
    <p>Организация: {item.claim.placeId} · заявитель: {item.applicantId}</p>
    <h3>Исходные сведения заявителя</h3><p className={styles.evidence}>{item.evidenceText}</p>
    {item.verificationNote && <><h3>Последнее заключение</h3><p className={styles.evidence}>{item.verificationNote}</p><p>Проверил: {item.reviewerId ?? 'не указан'} · {item.claim.reviewedAt}</p></>}
    {available.length === 0 ? <p>Решение недоступно: проверьте разрешения, статус заявки и независимость проверяющего. Свою заявку проверять нельзя.</p> : <form className="admin-form" onSubmit={submit}>
      <p>Укажите фактически проведённую проверку: реестр и запись, ранее независимо подтверждённый контакт либо очную проверку полномочий. Не копируйте лишние персональные данные. Доказательства остаются в закрытой заявке.</p>
      <label htmlFor={`${formId}-decision`}>Решение</label><select id={`${formId}-decision`} value={decision} onChange={e => setDecision(e.target.value as typeof decision)} disabled={busy || stale}>{available.map(value => <option key={value} value={value}>{decisions[value]}</option>)}</select>
      <label htmlFor={`${formId}-method`}>Фактический способ проверки</label><select id={`${formId}-method`} value={method} onChange={e => setMethod(e.target.value)} required disabled={busy || stale}><option value="">Выберите проведённую проверку</option>{Object.entries(verificationMethods).filter(([key]) => decision !== 'verify' || key !== 'insufficient_evidence').map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
      <label htmlFor={`${formId}-note`}>Источник, выполненная проверка и обоснование</label><textarea id={`${formId}-note`} name="note" required minLength={20} maxLength={2000} disabled={busy || stale} />
      <label className="admin-check"><input type="checkbox" required disabled={busy || stale} />Я независимый проверяющий; заключение основано на фактических доказательствах.</label>
      {onRequireStepUp && <button type="button" disabled={busy} onClick={() => { close(); onRequireStepUp(); }}>Подтвердить MFA и открыть заявку заново</button>}
      {error && <p role="alert" className="admin-error">{error}</p>}
      {stale && <p>Закройте форму и обновите очередь перед повторным решением. Отмена формы не отменяет уже сохранённую операцию.</p>}
      <button className="admin-primary" disabled={busy || stale}>{busy ? 'Проверяем и сохраняем…' : decisions[decision]}</button>
    </form>}
  </div></Drawer>;
}

export function ListingDecision({ item, can, done, onRequireStepUp }: Access & { item: C.AdminListingLookup; done: () => void }) {
  const [open, setOpen] = useState(false);
  if (!can('listing:quote') || !can('moderation:decide')) return null;
  return <><button type="button" onClick={() => setOpen(true)}>Решение по анкете</button>{open && <ListingReview listingId={item.listing.id} close={() => setOpen(false)} done={() => { setOpen(false); done(); }} onRequireStepUp={onRequireStepUp} />}</>;
}

function ListingReview({ listingId, close, done, onRequireStepUp }: { listingId: string; close: () => void; done: () => void; onRequireStepUp?: (() => void) | undefined }) {
  const formId = useId();
  const [item, setItem] = useState<C.AdminListingLookup | null>(null); const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [stale, setStale] = useState(false);
  const [error, setError] = useState(''); const [decision, setDecision] = useState(''); const sending = useRef(false);
  useEffect(() => {
    const ac = new AbortController(); setLoading(true); setError(''); setItem(null); setDecision('');
    adminRequest(`/admin/listings/${listingId}`, C.AdminListingLookupResponseSchema, { signal: ac.signal })
      .then(r => { if (!ac.signal.aborted) { setItem(r.data); setStale(false); } })
      .catch(err => { if (!ac.signal.aborted) setError(adminMessage(err)); })
      .finally(() => { if (!ac.signal.aborted) setLoading(false); });
    return () => ac.abort();
  }, [listingId, refresh]);
  const gaps = item ? listingApprovalGaps(item) : [];
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!item || sending.current || stale || (decision === 'approve' && gaps.length)) return;
    const form = new FormData(e.currentTarget); setError('');
    try {
      const body = C.ModerationDecisionRequestSchema.parse({ decision, expectedVersion: item.listing.version, note: form.get('note') });
      sending.current = true; setBusy(true);
      await adminRequest(`/admin/listings/${listingId}/decision`, C.ListingResponseSchema, jsonWrite('POST', body)); done();
    } catch (err) { setError(adminMessage(err)); if (sending.current) setStale(true); }
    finally { sending.current = false; setBusy(false); }
  }
  return <Drawer title="Финальное решение по анкете" close={close}><div className={styles.scope}>
    {loading && <p role="status">Проверяем текущую версию анкеты…</p>}
    {error && <p role="alert" className="admin-error">{error}</p>}
    {item && <><h3>{item.businessName}</h3><p>{item.ownerDisplayName ?? 'CRM владелец не указан'} · версия {item.listing.version}</p>
      <dl className={styles.facts}><dt>Права</dt><dd>{item.listing.ownershipState === 'verified' ? 'Подтверждены' : 'Не подтверждены'}</dd><dt>Согласование</dt><dd>{item.currentAgreement ? `${item.currentAgreement.acceptedBy} · ${item.currentAgreement.acceptedAt} · ${item.currentAgreement.channel}` : 'Не зарегистрировано'}</dd><dt>Условия</dt><dd>{item.currentQuote ? `${item.currentQuote.amountRub} ₽ / месяц · ${item.currentQuote.terms}` : 'Не заданы'}</dd><dt>Поступление</dt><dd>{item.listing.paymentState === 'manually-confirmed' ? 'Записано оператором; действительный период проверит сервер' : 'Не подтверждено'}</dd></dl>
      {gaps.length > 0 && <ul>{gaps.map(gap => <li key={gap}>{gap}</li>)}</ul>}
      <p>Сервер атомарно проверит независимость модератора, актуальные права, принятие условий и оплаченный период по журналу поступлений. Отсутствие активной сводки до публикации не означает отсутствие платежа.</p>
      {item.listing.placementState === 'pending-review' && <form className="admin-form" onSubmit={submit}>
        <label htmlFor={`${formId}-decision`}>Решение</label><select id={`${formId}-decision`} value={decision} onChange={e => setDecision(e.target.value)} required disabled={busy || stale}><option value="">Выберите решение</option><option value="approve" disabled={gaps.length > 0}>Одобрить анкету</option><option value="reject">Отклонить анкету</option></select>
        <label htmlFor={`${formId}-note`}>Заключение независимого модератора</label><textarea id={`${formId}-note`} key={refresh} name="note" required minLength={10} maxLength={1000} disabled={busy || stale} />
        <label className="admin-check"><input key={refresh} type="checkbox" required disabled={busy || stale} />Я независимо проверил анкету и основания решения. Отклонение не означает возврат денег.</label>
        {onRequireStepUp && <button type="button" disabled={busy} onClick={() => { close(); onRequireStepUp(); }}>Подтвердить MFA и открыть анкету заново</button>}
        {stale && <p>Результат повторно не отправляется. Обновите анкету и проверьте сохранённое состояние.</p>}
        <button className="admin-primary" disabled={busy || stale || !decision || (decision === 'approve' && gaps.length > 0)}>{busy ? 'Проверяем и сохраняем…' : 'Сохранить решение по анкете'}</button>
      </form>}
    </>}
    <button type="button" disabled={busy || loading} onClick={() => setRefresh(v => v + 1)}>Обновить анкету</button>
  </div></Drawer>;
}
