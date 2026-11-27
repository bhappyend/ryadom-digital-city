export interface BrandProps {
  variant?: 'horizontal' | 'mark';
  className?: string;
}

/** Supplied logo geometry and text, inline so the locally loaded Manrope applies. */
export function Brand({ variant = 'horizontal', className = '' }: BrandProps) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox={variant === 'mark' ? '0 0 64 64' : '0 0 210 60'}
    className={`dc-brand dc-brand--${variant} ${className}`} role="img"
    aria-label="Рядом by Patchvale" focusable="false">
    <g transform={variant === 'mark' ? undefined : 'translate(5 4) scale(.8)'}>
      <path d="M32 3C16 3 6 14 6 28c0 17 26 34 26 34s26-17 26-34C58 14 48 3 32 3Z" fill="#25F5B0" />
      <circle cx="32" cy="27" r="10" fill="#061217" />
    </g>
    {variant === 'horizontal' && <>
      <text x="61" y="34" fontFamily="Manrope, Arial, sans-serif" fontSize="36" fontWeight="800" letterSpacing="-1.6" fill="#F4F9FA">рядом.</text>
      <text x="63" y="49" fontFamily="Manrope, Arial, sans-serif" fontSize="12" fontWeight="500" fill="#91A9B2">by Patchvale</text>
    </>}
  </svg>;
}
