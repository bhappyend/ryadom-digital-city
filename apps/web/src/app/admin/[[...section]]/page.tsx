import Link from 'next/link';
import { AdminPanel } from '@/components/admin/panel';
import { adminAccess } from '@/lib/admin/server';
export default async function AdminPage({ params }: { params: Promise<{ section?: string[] }> }) {
  const parts = (await params).section ?? [];
  const demo = parts[0] === 'demo';
  const section = (demo ? parts[1] : parts[0]) ?? 'overview';
  if (!demo) {
    const access = await adminAccess();
    if (access !== 'allowed') return <main className="admin-gate"><span className="admin-kicker">Рядом / управление</span><h1>{access === 'login' ? 'Вход в панель' : access === 'denied' ? 'Доступ ограничен' : 'Проверка доступа недоступна'}</h1><p>{access === 'login' ? 'Для работы с реальными данными нужна учётная запись оператора и MFA.' : access === 'denied' ? 'Нужны действующая административная роль, подтверждённая учётная запись и MFA. Коды восстановления не дают доступ к панели.' : 'Сервер авторизации не ответил. Данные не загружены.'}</p><div className="admin-actions"><Link prefetch={false} href="/auth/admin">Войти с MFA</Link><Link prefetch={false} href="/admin/demo">Открыть демонстрацию</Link></div></main>;
  }
  return <AdminPanel demo={demo} section={section} />;
}
