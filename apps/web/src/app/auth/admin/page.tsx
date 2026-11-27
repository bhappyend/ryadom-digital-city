import type { Metadata } from 'next';
import { AdminLogin } from '@/components/admin/login';
import '@/components/admin/admin.css';
export const metadata: Metadata = { title: 'Вход оператора', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
export default function Page() { return <AdminLogin />; }
