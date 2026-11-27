import type { Metadata } from 'next';
import '@/components/admin/admin.css';
export const metadata: Metadata = { title: 'Управление городом', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
export default function AdminLayout({ children }: { children: React.ReactNode }) { return children; }
