import type { OwnerCrm } from '@ryadom/accounts-types';
import { remainingMoscowDays } from '../../../../../packages/admin-demo/owners';
export function ownerPeriod(owner: OwnerCrm): { label: string; detail: string } {
  if (owner.dataScope !== 'production' || !owner.fundedSubscriptionSummary) return { label: 'Оплаченный период не подтверждён', detail: 'CRM запись не означает подписку' };
  const f = owner.fundedSubscriptionSummary; const s = f.subscription;
  const active = s.status === 'active' || (s.status === 'cancelled' && s.cancelAtPeriodEnd);
  const days = active ? remainingMoscowDays(s.currentPeriodEndsAt, s.evaluatedAt, f.billingTimezone) : 0;
  return { label: days === null ? 'Период не определён' : active ? `${days} дней` : 'Оплаченный период завершён', detail: `До ${s.currentPeriodEndsAt ? new Date(s.currentPeriodEndsAt).toLocaleString('ru', { timeZone: f.billingTimezone }) : 'неизвестно'} · ${f.billingTimezone} · снимок ${s.evaluatedAt}` };
}
