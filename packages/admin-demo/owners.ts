/** Browser-memory fixtures only. Never import into auth, billing or public statistics. */
export const DEMO_NOTICE = 'Демонстрационные данные. Не реальные клиенты и оплаты.';
export interface DemoOwner { id: string; displayName: string; phone: string; remainingDays: number; dataScope: 'demo'; productionEntitlement: false }
const first = ['Александр', 'Мария', 'Иван', 'Анна', 'Дмитрий', 'Елена', 'Сергей'];
const last = [['Северов', 'Северова'], ['Луговой', 'Луговая'], ['Ветров', 'Ветрова'], ['Озерский', 'Озерская'], ['Кленов', 'Кленова']];
export function createDemoOwners(): DemoOwner[] {
  return Array.from({ length: 35 }, (_, i) => ({ id: `demo-owner-${i + 1}`, displayName: `${first[i % 7]} ${last[Math.floor(i / 7)]?.[[1, 3, 5].includes(i % 7) ? 1 : 0]} · демо`, phone: `+7 (9XX) XXX-XX-${String(i + 1).padStart(2, '0')}`, remainingDays: 22 + i % 9, dataScope: 'demo', productionEntitlement: false }));
}
export function maskDemoPhone(phone: string) { return phone.replace(/\d{2}$/, '••'); }
/** Counts local Moscow calendar boundaries, exclusively from the server snapshot. */
export function remainingMoscowDays(periodEndsAt: string | null, evaluatedAt: string, timeZone = 'Europe/Moscow'): number | null {
  if (!periodEndsAt) return null;
  const day = (value: string) => { const d = new Date(value); if (!Number.isFinite(d.getTime())) return NaN; let parts: Intl.DateTimeFormatPart[]; try { parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d); } catch { return NaN; } const p = (key: string) => Number(parts.find(v => v.type === key)?.value); return Date.UTC(p('year'), p('month') - 1, p('day')); };
  const result = Math.ceil((day(periodEndsAt) - day(evaluatedAt)) / 86400000);
  return Number.isFinite(result) ? Math.max(0, result) : null;
}
