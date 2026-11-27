'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CitiesResponseSchema, PlacesResponseSchema, PlaceResponseSchema, SlugSchema, type City, type Place } from '@ryadom/types';
import { api, message } from '@/lib/api';
import { selectCity } from '@/lib/city';
import styles from './account.module.css';

export function ApplicantPlacePicker({ selected, choose, initialSlug }: { selected: Place | null; choose: (place: Place | null) => void; initialSlug?: string | undefined }) {
  const [cities, setCities] = useState<City[]>([]); const [cityId, setCityId] = useState(''); const [region, setRegion] = useState('');
  const [query, setQuery] = useState(''); const [items, setItems] = useState<Place[]>([]); const [more, setMore] = useState(false); const [page, setPage] = useState(1);
  const [search, setSearch] = useState(''); const [revision, setRevision] = useState(0); const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => { const ac = new AbortController(); api('/cities', CitiesResponseSchema, { signal: ac.signal }).then(r => { if (!ac.signal.aborted) { setCities(r.data.filter(c => c.enabled)); const city = selectCity(r.data); if (city) { setCityId(city.id); setRegion(city.region ?? ''); } } }).catch(e => { if (!ac.signal.aborted) setError(message(e)); }); return () => ac.abort(); }, [revision]);
  useEffect(() => { if (!initialSlug || !SlugSchema.safeParse(initialSlug).success) return; const ac = new AbortController(); api(`/places/${initialSlug}`, PlaceResponseSchema, { signal: ac.signal }).then(r => { if (!ac.signal.aborted) choose(r.data); }).catch(e => { if (!ac.signal.aborted) setError(message(e)); }); return () => ac.abort(); }, [initialSlug]); // choose is a React state setter.
  useEffect(() => () => request.current?.abort(), []);
  async function find(e?: FormEvent<HTMLFormElement>, targetPage = 1) {
    e?.preventDefault(); const city = cities.find(c => c.id === cityId); if (!city) return;
    request.current?.abort(); const ac = new AbortController(); request.current = ac; setLoading(true); setError(''); setItems([]);
    const q = e ? query.trim() : search; setSearch(q);
    try { const params = new URLSearchParams({ city: city.id, lon: String(city.center.lon), lat: String(city.center.lat), radius: '10000', page: String(targetPage), limit: '20' }); if (q) params.set('q', q); const r = await api(`/places/near?${params}`, PlacesResponseSchema, { signal: ac.signal }); if (!ac.signal.aborted) { setItems(r.data.items); setMore(r.data.pagination.hasMore); setPage(targetPage); } }
    catch (err) { if (!ac.signal.aborted) setError(message(err)); } finally { if (!ac.signal.aborted) setLoading(false); }
  }
  return <section className={styles.panel} aria-label="Выбор организации"><h2>Выберите реальную карточку</h2><p>Поиск охватывает 10 км от указанного в каталоге центра города. Для организации за пределами этой зоны откройте её карточку на карте и нажмите «Подтвердить права».</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {cities.length === 0 ? <button type="button" onClick={() => setRevision(v => v + 1)}>Загрузить города повторно</button> : <form className={styles.form} onSubmit={find}><label>Регион<select value={region} onChange={e => { request.current?.abort(); setLoading(false); setRegion(e.target.value); setCityId(''); setItems([]); choose(null); }}><option value="">Все регионы</option>{[...new Set(cities.map(c => c.region).filter(Boolean))].sort().map(r => <option key={r} value={r!}>{r}</option>)}</select></label><label>Город<select required value={cityId} onChange={e => { request.current?.abort(); setLoading(false); setCityId(e.target.value); setItems([]); choose(null); }}><option value="">Выберите город</option>{cities.filter(c => !region || c.region === region).map(c => <option key={c.id} value={c.id}>{c.name} · {c.region}</option>)}</select></label><label>Название или адрес<input value={query} onChange={e => setQuery(e.target.value)} minLength={2} maxLength={200} /></label><div className={styles.actions}><button type="submit" className={styles.primary} disabled={loading || !cityId}>Найти в каталоге</button>{loading && <button type="button" onClick={() => { request.current?.abort(); setLoading(false); }}>Отменить поиск</button>}</div></form>}
    {loading && <p role="status">Ищем реальные карточки…</p>}
    {!loading && search && !error && items.length === 0 && <p>Совпадений в выбранной области нет. Уточните город и запрос или найдите карточку на карте. Отсутствие результата не подтверждает отсутствие организации.</p>}
    <ul className={styles.results}>{items.map(p => <li key={p.id}><strong>{p.name}</strong><p>{p.address}</p><button type="button" aria-pressed={selected?.id === p.id} onClick={() => choose(p)}>{selected?.id === p.id ? 'Карточка выбрана' : `Выбрать ${p.name}`}</button></li>)}</ul>
    {items.length > 0 && <div className={styles.actions}><button type="button" disabled={page <= 1 || loading} onClick={() => void find(undefined, page - 1)}>Предыдущие места</button><span>Страница {page}</span><button type="button" disabled={!more || page >= 100 || loading} onClick={() => void find(undefined, page + 1)}>Следующие места</button></div>}
    {selected && <p role="status" className={styles.success}>Выбрано: {selected.name} · {selected.address}. <a href={`/places/${selected.slug}`} target="_blank" rel="noopener noreferrer">Проверить публичную карточку (новое окно)</a></p>}
  </section>;
}
