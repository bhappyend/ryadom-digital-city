import { Suspense } from 'react';
import type { Metadata } from 'next';
import { MapExplorer } from '@/components/map-explorer';
import { createStaticMetadata } from '@/lib/seo/metadata';
export async function generateMetadata({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}):Promise<Metadata>{return createStaticMetadata('/map',{hasSearchParams:Object.keys(await searchParams).length>0});}
export default function MapPage(){return <Suspense fallback={<main id="main" className="dc-container section" role="status">Загружаем поиск…</main>}><MapExplorer/></Suspense>;}
