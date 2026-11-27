'use client';

import type { ButtonHTMLAttributes } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'icon';
  loading?: boolean;
}

export function Button({ variant = 'primary', size = 'md', loading = false, disabled,
  type = 'button', className = '', children, ...props }: ButtonProps) {
  return <button {...props} type={type} disabled={disabled || loading}
    aria-busy={loading || props['aria-busy']}
    className={`dc-button dc-button--${variant} dc-button--${size} ${className}`}>
    {loading && <span className="dc-spinner" aria-hidden="true" />}
    {children}
  </button>;
}
