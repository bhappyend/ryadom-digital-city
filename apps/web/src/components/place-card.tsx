import Link from 'next/link';
import { Button, Icon } from '@ryadom/ui';
import type { NearbyPlace } from '@ryadom/types';
import { distance, opening, safeWebsite } from '@/lib/format';

export function PlaceCard({ place, selected = false, onSelect }: { place: NearbyPlace; selected?: boolean; onSelect?: (place: NearbyPlace) => void }) {
  const photo = place.photos[0], photoUrl = photo ? safeWebsite(photo.url) : null;
  return <article className={`place-card ${selected ? 'is-selected' : ''}`} aria-label={place.name}>
    {photo && photoUrl ? <figure><img src={photoUrl} alt={photo.alt} width={480} height={280} loading="lazy" referrerPolicy="no-referrer" /><figcaption>{photo.attribution} · {photo.license}</figcaption></figure> : <div className="place-no-photo"><Icon name={place.categoryIds[0] ?? 'location'} size={32} /><span>Фотография не добавлена</span></div>}
    <div className="place-card-content"><div className="place-card-heading"><h3><Link href={`/places/${place.slug}`}>{place.name}</Link></h3><span className="distance">{distance(place.distanceMeters)}</span></div>
    {place.rating && <p className="rating">★ {place.rating.value.toFixed(1)} <span className="muted">({place.rating.count}) · {place.rating.source}</span></p>}<p className="muted">{place.address}</p><p className={place.openingState === 'open' ? 'accent' : 'muted'}>{opening(place)}</p>
    <div className="actions">{onSelect && <Button size="sm" variant={selected ? 'primary' : 'secondary'} onClick={() => onSelect(place)} aria-pressed={selected}>На карте</Button>}<Link href={`/places/${place.slug}`} className="text-link">О месте</Link></div></div>
  </article>;
}
