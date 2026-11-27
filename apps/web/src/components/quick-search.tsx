'use client';
import { useRouter } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import { Button, Field, Icon } from '@ryadom/ui';
import { CATEGORIES } from '@ryadom/types';
import type { City } from '@ryadom/types';
import { locationFromBrowser } from '@/lib/format';
import { selectCity } from '@/lib/city';

export function QuickSearch({ cities }: { cities: City[] }) {
  const router = useRouter();
  const [city, setCity] = useState(selectCity(cities)?.id ?? '');
  const [q, setQ] = useState(''), [category, setCategory] = useState(''), [error, setError] = useState(''), [locating, setLocating] = useState(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  function params() { const p = new URLSearchParams(); if (city) p.set('city', city); if (category) p.set('category', category); return p; }
  async function locate() {
    setLocating(true); setError('');
    try { const c = await locationFromBrowser(); if(!active.current) return; const p = params(); p.set('lon', String(c.lon)); p.set('lat', String(c.lat)); router.push(`/map?${p}`); }
    catch (e) { if(active.current) setError(e instanceof Error ? e.message : 'Не удалось определить местоположение'); }
    finally { if(active.current) setLocating(false); }
  }
  return <form className="quick-search" id="quick-search" aria-label="Поиск поблизости" onSubmit={e => { e.preventDefault(); const p = params(); if(q.trim()) p.set('q', q.trim()); router.push(`/map?${p}`); }}>
    <label className="dc-field"><span className="dc-field__label">Город</span><select className="dc-input" value={city} onChange={e => setCity(e.target.value)} disabled={!cities.length}><option value="">{cities.length ? 'Выберите город' : 'Города загружаются'}</option>{cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    <Field label="Адрес или район" placeholder="Введите адрес" value={q} onChange={e => setQ(e.target.value)} minLength={3} maxLength={200} />
    <label className="dc-field"><span className="dc-field__label">Категория</span><select className="dc-input" value={category} onChange={e => setCategory(e.target.value)}><option value="">Все категории</option>{CATEGORIES.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
    <Button variant="secondary" loading={locating} onClick={locate} aria-label="Разрешить определение местоположения и найти рядом"><Icon name="navigation" size={20} /><span>Моё место</span></Button><Button type="submit"><Icon name="search" size={20} />Найти поблизости</Button>
    <p className="search-consent muted">«Моё место» запросит разрешение браузера. Адрес можно ввести вручную.</p>{error && <p className="form-error" role="alert">{error}</p>}
  </form>;
}
