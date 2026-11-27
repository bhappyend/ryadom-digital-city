import type { HTMLAttributes } from 'react';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: 'neutral' | 'accent' | 'warning' | 'danger' | 'info';
}

export function Badge({ tone = 'neutral', className = '', children, ...props }: BadgeProps) {
  return <span {...props} className={`dc-badge dc-badge--${tone} ${className}`}>{children}</span>;
}
