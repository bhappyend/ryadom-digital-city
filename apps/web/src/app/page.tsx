import { Home } from '@/components/home';
import { createStaticMetadata } from '@/lib/seo/metadata';
import { createWebsiteJsonLd } from '@/lib/seo/structured-data';
import { serializeJsonLd } from '@/lib/seo/serialize';
import { publicContent } from '@/lib/public-cms/server';
import { publishedPageMetadata } from '@/lib/public-cms/metadata';
export const dynamic = 'force-dynamic';
export async function generateMetadata() {
  return publishedPageMetadata(createStaticMetadata('/'), await publicContent('site-settings'));
}
export default function Page(){const schema=createWebsiteJsonLd();return <>{schema&&<script type="application/ld+json" dangerouslySetInnerHTML={{__html:serializeJsonLd(schema)}}/>}<Home/></>;}
