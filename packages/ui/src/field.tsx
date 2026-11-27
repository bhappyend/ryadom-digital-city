'use client';

import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: ReactNode;
  error?: string;
}

export function Field({ label, hint, error, id, className = '', ...props }: FieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const description = [props['aria-describedby'], hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined;
  return <div className={`dc-field ${className}`}>
    <label className="dc-field__label" htmlFor={inputId}>{label}{props.required && <span aria-hidden="true"> *</span>}</label>
    <input {...props} id={inputId} className="dc-input" aria-invalid={error ? true : props['aria-invalid']} aria-describedby={description} />
    {hint && <div className="dc-field__hint" id={hintId}>{hint}</div>}
    {error && <div className="dc-field__error" id={errorId}>{error}</div>}
  </div>;
}
