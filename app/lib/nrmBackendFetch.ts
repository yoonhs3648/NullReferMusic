/** localtunnel (.loca.lt) shows an IP reminder in browsers; API clients need this header. */
export function nrmBackendFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers ?? undefined);
  if (/\.loca\.lt/i.test(url)) {
    headers.set('Bypass-Tunnel-Reminder', 'true');
  }
  return fetch(url, { ...init, headers });
}
