import type { Metadata } from 'next';
import { ApplicantDashboard } from '@/components/business/dashboard';
import { SlugSchema } from '@ryadom/types';
export const metadata: Metadata = { title: 'Мои заявки для бизнеса', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
export default async function ApplicantPage({ searchParams }: { searchParams: Promise<{ place?: string | string[] }> }) { const value = (await searchParams).place; const parsed = SlugSchema.safeParse(value); return <ApplicantDashboard initialSlug={parsed.success ? parsed.data : undefined} />; }
