import 'server-only';
import { cookies } from 'next/headers';
import { MeResponseSchema, requiresAdminMfa } from '@ryadom/accounts-types';

export async function adminAccess(): Promise<'allowed' | 'login' | 'denied' | 'unavailable'> {
  const jar = await cookies();
  const session = jar.get('__Host-ryadom-session') ?? jar.get('ryadom-session-dev');
  if (!session) return 'login';
  try {
    const origin = new URL(process.env.API_URL ?? 'http://127.0.0.1:3001');
    if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/') return 'unavailable';
    const res = await fetch(new URL('/api/v1/auth/me', origin), { headers: { Cookie: `${session.name}=${session.value}` }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(6000) });
    if (res.status === 401) return 'login';
    if (res.status === 403) return 'denied';
    if (!res.ok) return 'unavailable';
    const value = MeResponseSchema.safeParse(await res.json());
    if (!value.success) return 'unavailable';
    const { account, session: s } = value.data.data;
    return requiresAdminMfa(account.roles) && account.emailVerified && account.mfaEnrolled && s.assurance === 'mfa' ? 'allowed' : 'denied';
  } catch { return 'unavailable'; }
}
