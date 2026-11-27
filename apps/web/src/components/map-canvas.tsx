'use client';
import { useEffect, useRef, useState } from 'react';
import type { Map as LibreMap, Marker, GeoJSONSource } from 'maplibre-gl';
import type { City, Coordinates, MapConfig, Place, RouteResult } from '@ryadom/types';
import 'maplibre-gl/dist/maplibre-gl.css';

export interface MapCanvasProps {
  city: City; config: Extract<MapConfig, { status: 'available' }>; places: Place[];
  origin: Coordinates | null; selected: string | null; route: RouteResult | null;
  onSelect: (id: string) => void; onCoordinate: (value: Coordinates) => void;
}
export default function MapCanvas(props: MapCanvasProps) {
  const host = useRef<HTMLDivElement>(null), mapRef = useRef<LibreMap | null>(null), current = useRef(props);
  current.current = props;
  const [error, setError] = useState(''), [ready, setReady] = useState(false), [generation, setGeneration] = useState(0);
  useEffect(() => {
    let disposed = false; const markers = new Map<string, Marker>(); let originMarker: Marker | null = null;
    let destroy: (() => void) | undefined;
    setReady(false); setError('');
    import('maplibre-gl').then(lib => {
      if(disposed || !host.current) return;
      lib.setWorkerUrl('/vendor/maplibre-gl-worker-6.19.0.mjs');
      const map = new lib.Map({ container: host.current, style: props.config.styleUrl, center: [props.city.center.lon, props.city.center.lat], zoom: 12, minZoom: props.config.minZoom, maxZoom: props.config.maxZoom, attributionControl: { compact: true } });
      mapRef.current = map;
      map.addControl(new lib.NavigationControl({ showCompass: false }), 'top-right');
      let loaded = false;
      const syncMarkers = () => {
        if(!loaded || !map.getSource('places')) return;
        const visible = new Set<string>();
        for(const feature of map.querySourceFeatures('places', { filter: ['!', ['has', 'point_count']] })) {
          const id = String(feature.properties?.id ?? ''); if(!id || visible.has(id)) continue; visible.add(id);
          const place = current.current.places.find(p => p.id === id); if(!place) continue;
          const old = markers.get(id);
          if(old) { const element = old.getElement(); element.classList.toggle('is-selected', current.current.selected === id); element.setAttribute('aria-pressed', String(current.current.selected === id)); continue; }
          const element = document.createElement('button'); element.type = 'button'; element.className = 'map-place-marker';
          element.setAttribute('aria-label', `Выбрать: ${place.name}`); element.setAttribute('aria-pressed', String(current.current.selected === id));
          if(current.current.selected === id) element.classList.add('is-selected');
          const icon = document.createElement('img'); icon.src = `/assets/markers/${place.categoryIds[0] ?? 'services'}.svg`; icon.alt = ''; icon.width = 38; icon.height = 50; element.append(icon);
          element.addEventListener('click', event => { event.stopPropagation(); current.current.onSelect(id); });
          const marker = new lib.Marker({ element, anchor: 'bottom' }).setLngLat([place.coordinates.lon,place.coordinates.lat]).addTo(map); markers.set(id,marker);
        }
        for(const [id, marker] of markers) if(!visible.has(id)) { marker.remove(); markers.delete(id); }
      };
      const update = () => {
        if(!loaded) return;
        const value = current.current;
        (map.getSource('places') as GeoJSONSource).setData({ type: 'FeatureCollection', features: value.places.map(p => ({ type: 'Feature', properties: { id: p.id }, geometry: { type: 'Point', coordinates: [p.coordinates.lon,p.coordinates.lat] } })) });
        (map.getSource('route') as GeoJSONSource).setData({ type: 'FeatureCollection', features: value.route ? [{ type: 'Feature', properties: {}, geometry: value.route.geometry }] : [] });
        originMarker?.remove(); originMarker = null;
        if(value.origin) { const element = document.createElement('div'); element.className = 'map-origin'; const img = document.createElement('img'); img.src='/assets/markers/user-position.svg'; img.alt='Начальная точка поиска'; img.width=36; img.height=36; element.append(img); originMarker = new lib.Marker({ element }).setLngLat([value.origin.lon,value.origin.lat]).addTo(map); }
        syncMarkers();
      };
      map.on('load', () => {
        if(disposed) return; loaded = true;
        map.addSource('places', { type:'geojson', data: { type:'FeatureCollection', features:[] }, cluster:true, clusterRadius:46, clusterMaxZoom:14 });
        map.addLayer({ id:'clusters', type:'circle', source:'places', filter:['has','point_count'], paint:{'circle-color':'#25F5B0','circle-radius':23,'circle-stroke-width':2,'circle-stroke-color':'#061217'} });
        map.addLayer({ id:'cluster-count', type:'symbol', source:'places', filter:['has','point_count'], layout:{'text-field':['get','point_count_abbreviated'],'text-size':14}, paint:{'text-color':'#061217'} });
        map.addSource('route', { type:'geojson', data:{type:'FeatureCollection',features:[]} });
        map.addLayer({ id:'route-line',type:'line',source:'route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#25F5B0','line-width':5} });
        map.on('click','clusters', async e => { const feature = e.features?.[0]; const id=feature?.properties?.cluster_id; if(feature?.geometry.type !== 'Point' || typeof id !== 'number') return; const zoom=await (map.getSource('places') as GeoJSONSource).getClusterExpansionZoom(id); if(disposed) return; const [lon,lat]=feature.geometry.coordinates; if(lon!==undefined && lat!==undefined) map.easeTo({center:[lon,lat],zoom,duration:matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300}); });
        map.on('click',e=> { if(map.queryRenderedFeatures(e.point,{layers:['clusters']}).length) return; current.current.onCoordinate({lon:e.lngLat.lng,lat:e.lngLat.lat}); });
        map.on('sourcedata',syncMarkers); map.on('moveend',syncMarkers);
        host.current?.addEventListener('ryadom-update',update); update(); setReady(true);
      });
      map.on('error', () => setError('Не удалось загрузить карту или часть её данных. Список мест доступен ниже.'));
      const timeout = window.setTimeout(() => { if(!loaded) setError('Карта загружается дольше обычного. Можно продолжить поиск в списке.'); },15000);
      const resize = new ResizeObserver(() => map.resize()); resize.observe(host.current);
      destroy = () => { clearTimeout(timeout); resize.disconnect(); host.current?.removeEventListener('ryadom-update',update); for(const marker of markers.values()) marker.remove(); originMarker?.remove(); map.remove(); mapRef.current = null; };
    }).catch(() => setError('Карта недоступна в этом браузере. Продолжите поиск в списке.'));
    return () => { disposed = true; destroy?.(); };
  },[props.city.id, props.config.styleUrl, generation]);
  useEffect(() => { host.current?.dispatchEvent(new Event('ryadom-update')); },[props.places,props.origin,props.selected,props.route,ready]);
  useEffect(() => {
    if(!ready) return; const map = mapRef.current; if(!map) return;
    const selected = props.places.find(p=>p.id === props.selected);
    const points = props.route?.geometry.coordinates;
    const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300;
    if(points?.length) { const first = points[0]; if(!first) return; let west=first[0],east=first[0],south=first[1],north=first[1]; for(const [lon,lat] of points) { west=Math.min(west,lon);east=Math.max(east,lon);south=Math.min(south,lat);north=Math.max(north,lat); } map.fitBounds([[west,south],[east,north]],{padding:60,maxZoom:16,duration}); }
    else if(selected) map.easeTo({center:[selected.coordinates.lon,selected.coordinates.lat],zoom:Math.max(map.getZoom(),15),duration});
    else if(props.origin) map.easeTo({center:[props.origin.lon,props.origin.lat],duration});
  },[props.origin,props.selected,props.route,ready]);
  return <div className="map-canvas-wrap"><div className="map-canvas" ref={host} role="region" aria-label={`Карта: ${props.city.name}. Места также доступны в списке.`} />{!ready && !error && <div className="map-status" role="status">Загружаем карту…</div>}{error && <div className="map-status" role="alert"><p>{error}</p><button className="dc-button dc-button--secondary dc-button--sm" onClick={()=>setGeneration(v=>v+1)}>Повторить загрузку</button></div>}<p className="map-pick-hint">Нажмите на свободную точку карты, чтобы искать рядом с ней.</p></div>;
}
