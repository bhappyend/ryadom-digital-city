'use client';
import { useState } from 'react';
import { Brand } from '@ryadom/ui';
import type { CmsAsset } from '@ryadom/accounts-types';
import { approvedAsset } from '../../lib/public-cms/content';

export function CmsImage({ asset, hero = false }: { asset: CmsAsset; hero?: boolean }) {
  const [failed, setFailed] = useState<string | null>(null);
  const approved = approvedAsset(asset);
  if (!approved || failed === approved.url) return hero ? <img src="/assets/backgrounds/hero-city.webp" alt="" width={1672} height={941} /> : null;
  return <img src={approved.url} alt={approved.alt} width={hero ? 1672 : 960} height={hero ? 941 : 540}
    style={{ maxWidth: '100%', height: hero ? '100%' : 'auto', objectFit: hero ? 'cover' : 'contain' }}
    loading={hero ? 'eager' : 'lazy'} onError={() => setFailed(approved.url)} />;
}
export function CmsBrand({ asset, variant = 'horizontal' }: { asset?: CmsAsset | null | undefined; variant?: 'horizontal' | 'mark' }) {
  const [failed, setFailed] = useState<string | null>(null);
  const approved = approvedAsset(asset);
  if (!approved || failed === approved.url) return <Brand variant={variant} />;
  return <img className={`dc-brand dc-brand--${variant}`} src={approved.url} alt={approved.alt}
    width={variant === 'mark' ? 64 : 210} height={variant === 'mark' ? 64 : 60}
    style={{ aspectRatio: variant === 'mark' ? '1' : '3.5', objectFit: 'contain' }} onError={() => setFailed(approved.url)} />;
}
