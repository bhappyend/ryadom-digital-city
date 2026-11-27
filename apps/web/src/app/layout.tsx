import type { Metadata, Viewport } from 'next';
import '@ryadom/ui/fonts.css';
import '@ryadom/ui/styles.css';
import './globals.css';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { PwaRegistration } from '@/components/pwa';
import { createLayoutMetadata } from '@/lib/seo/metadata';

const fallbackMetadata: Metadata = {
  ...createLayoutMetadata(),
  title: { default: 'Рядом — всё, что нужно, в вашем городе', template: '%s · Рядом' },
  description: 'Находите организации рядом с вами. Поиск по категориям, карта и маршруты. Пилотный город — Смоленск.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/assets/brand/favicon.svg', apple: '/assets/brand/apple-touch-icon.png' }
};
export async function generateMetadata(): Promise<Metadata> {
  const settings = documentOf(await publicContent('site-settings'), 'settings');
  return { ...fallbackMetadata, ...(settings ? { title: { default: settings.siteTitle, template: `%s · ${settings.siteTitle}` }, description: settings.description, ...(settings.indexingEnabled ? {} : { robots: { index: false, follow: false } }) } : {}) };
}
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#061217', viewportFit: 'cover' };
import { publicContent } from '@/lib/public-cms/server';
import { documentOf } from '@/lib/public-cms/content';
import { PublicChrome } from '@/components/public-cms/chrome';
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [brandResult, contactsResult] = await Promise.all([publicContent('brand'), publicContent('contacts')]);
  const brand = documentOf(brandResult, 'brand'), contacts = documentOf(contactsResult, 'contacts');
  return <html lang="ru"><body className="dc-theme"><PublicChrome header={<Header logo={brand?.logo} />} footer={<Footer logo={brand?.logo} contacts={contacts} />}>{children}</PublicChrome><PwaRegistration /></body></html>;
}
