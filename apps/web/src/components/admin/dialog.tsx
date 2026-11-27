'use client';
import { useEffect, useRef, type ReactNode, type KeyboardEvent } from 'react';
export function Drawer({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; ref.current?.showModal(); return () => { previous?.focus(); }; }, []);
  function keepFocus(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Tab') return;
    const dialog = event.currentTarget;
    const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button,input,select,textarea,a[href],[tabindex]')).filter(el => el.tabIndex >= 0 && !el.matches(':disabled,[hidden],[inert]') && !el.closest('[hidden],[inert]') && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden');
    const first = controls[0]; const last = controls[controls.length - 1];
    if (!first || !last) { event.preventDefault(); dialog.focus(); return; }
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === dialog || !dialog.contains(active))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (active === last || active === dialog || !dialog.contains(active))) { event.preventDefault(); first.focus(); }
  }
  return <dialog ref={ref} tabIndex={-1} className="admin-dialog" onKeyDown={keepFocus} onCancel={e => { e.preventDefault(); close(); }} aria-labelledby="drawer-title"><header><h2 id="drawer-title">{title}</h2><button type="button" onClick={close} aria-label="Закрыть форму">Закрыть</button></header>{children}</dialog>;
}
