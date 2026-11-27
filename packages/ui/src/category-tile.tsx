import type { ButtonHTMLAttributes } from 'react';

export type CategoryName = 'auto' | 'bank' | 'beauty' | 'cafe' | 'education' | 'entertainment'
  | 'fuel' | 'government' | 'hotel' | 'medicine' | 'pharmacy' | 'services' | 'shopping' | 'sport';

export interface CategoryTileProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  category: CategoryName;
  label: string;
  /** Use only for a toggle filter; omit for an action opening a category. */
  selected?: boolean;
}

export function CategoryTile({ category, label, selected, type = 'button', className = '', ...props }: CategoryTileProps) {
  return <button {...props} type={type} aria-pressed={selected}
    className={`dc-category-tile ${className}`}>
    <img src={`/assets/icons/tile-${category}.svg`} width={64} height={64} alt="" aria-hidden="true" />
    <span>{label}</span>
  </button>;
}
