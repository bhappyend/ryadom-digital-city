'use client';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
export function PublicChrome({ header, footer, children }: { header: ReactNode; footer: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const privateScreen = /^\/(?:admin|auth)(?:\/|$)/.test(pathname) || pathname === '/login';
  return <>{!privateScreen && header}{children}{!privateScreen && footer}</>;
}
