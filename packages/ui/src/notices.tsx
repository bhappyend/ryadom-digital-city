'use client';

import { useId, type ReactNode } from 'react';
import { Icon, type IconName } from './icon';

export interface EmptyStateProps {
  title: string;
  description: string;
  icon?: IconName;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, icon = 'search', action, className = '' }: EmptyStateProps) {
  const titleId = useId();
  return <section className={`dc-empty-state ${className}`} aria-labelledby={titleId}>
    <Icon name={icon} size={32} />
    <h3 id={titleId}>{title}</h3>
    <p>{description}</p>
    {action && <div className="dc-empty-state__action">{action}</div>}
  </section>;
}

export interface ProviderNoticeProps {
  title: string;
  description: string;
  action?: ReactNode;
  /** Enable only when a provider changes state after a user action. */
  announce?: boolean;
  className?: string;
}

export function ProviderNotice({ title, description, action, announce = false, className = '' }: ProviderNoticeProps) {
  return <div className={`dc-provider-notice ${className}`} role={announce ? 'status' : undefined}>
    <Icon name="map" />
    <div><p className="dc-provider-notice__title">{title}</p><p>{description}</p>{action}</div>
  </div>;
}
