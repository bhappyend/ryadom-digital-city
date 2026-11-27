import type { CSSProperties } from 'react';
import { iconArtwork } from './icon-artwork';

export type IconName = keyof typeof iconArtwork;
export interface IconProps {
  name: IconName;
  /** Omit for decoration; otherwise use a concise accessible name. */
  label?: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
}

/** Inline paths copied from the supplied SVGs: currentColor inherits correctly. */
export function Icon({ name, label, size = 24, className = '', style }: IconProps) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size}
    className={`dc-icon ${className}`} style={style} focusable="false"
    role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
    {iconArtwork[name]}
  </svg>;
}
