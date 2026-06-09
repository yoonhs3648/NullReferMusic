import { nrmLoggedFetch } from '@/lib/nrmLoggedFetch';

/** localtunnel (.loca.lt) shows an IP reminder in browsers; API clients need this header. */
export function nrmBackendFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers ?? undefined);
  if (/\.loca\.lt/i.test(url)) {
    headers.set('Bypass-Tunnel-Reminder', 'true');
  }
  return nrmLoggedFetch(url, { ...init, headers }, { tag: 'backend' });
}
