'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Button, Icon } from '@ryadom/ui';
import { CitiesResponseSchema } from '@ryadom/types';
import type { City } from '@ryadom/types';
import { api } from '@/lib/api';
import { InstallButton } from '@/components/pwa';

import type { CmsAsset } from '@ryadom/accounts-types';
import { CmsBrand } from './public-cms/media';

const links = [['/', 'Главная'], ['/map', 'Карта'], ['/categories', 'Категории'], ['/business', 'Для бизнеса'], ['/about', 'О проекте']] as const;
export function Header({ logo }: { logo?: CmsAsset | null | undefined }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [cities, setCities] = useState<City[]>([]);
  const panel = useRef<HTMLDivElement>(null), toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => { const controller = new AbortController(); api('/cities', CitiesResponseSchema, { signal: controller.signal }).then(r => setCities(r.data.filter(c => c.enabled))).catch(() => {}); return () => controller.abort(); }, []);
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const old = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const items = () => Array.from(panel.current?.querySelectorAll<HTMLElement>('a,button,select') ?? []).filter(el => el.offsetParent !== null && !el.hasAttribute('disabled'));
    items()[0]?.focus();
    const handle = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); toggle.current?.focus(); }
      if (event.key === 'Tab') { const list = items(), first = list[0], last = list.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
    };
    document.addEventListener('keydown', handle);
    return () => { document.body.style.overflow = old; document.removeEventListener('keydown', handle); };
  }, [open]);
  const cityPicker = <label className="header-city"><Icon name="location" size={18} /><span className="dc-sr-only">Выбрать город</span><select aria-label="Выбрать город" defaultValue="" onChange={e => { if(e.target.value) window.location.assign(`/map?city=${encodeURIComponent(e.target.value)}`); }}><option value="">{cities.length ? 'Выбрать город' : 'Смоленск · пилот'}</option>{cities.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label>;
  return <><a className="skip-link" href="#main">Перейти к содержимому</a><header className="site-header"><div className="dc-container header-inner"><Link href="/"><CmsBrand asset={logo} /></Link><nav className="desktop-nav" aria-label="Основная навигация">{links.map(([href, title]) => <Link href={href} key={href} aria-current={pathname === href ? 'page' : undefined}>{title}</Link>)}</nav><div className="header-actions">{cityPicker}<InstallButton className="install-slot dc-button dc-button--secondary dc-button--sm">Установить</InstallButton><Link className="login-link" href="/business">Вход для бизнеса</Link></div><button ref={toggle} type="button" className="dc-button dc-button--secondary mobile-toggle" aria-expanded={open} aria-controls="mobile-navigation" onClick={() => setOpen(true)}>Меню</button></div></header>{open && <div className="mobile-overlay" role="presentation" onClick={e => { if(e.target === e.currentTarget) {setOpen(false); toggle.current?.focus();} }}><div className="mobile-panel" id="mobile-navigation" role="dialog" aria-modal="true" aria-label="Навигация" ref={panel}><Button variant="secondary" onClick={() => {setOpen(false); toggle.current?.focus();}}>Закрыть меню</Button><nav aria-label="Мобильная навигация">{links.map(([href,title]) => <Link href={href} key={href} onClick={() => setOpen(false)} aria-current={pathname === href ? 'page' : undefined}>{title}</Link>)}</nav>{cityPicker}<Link href="/business" onClick={() => setOpen(false)}>Вход для бизнеса</Link><InstallButton className="dc-button dc-button--secondary">Установить приложение</InstallButton></div></div>}</>;
}

