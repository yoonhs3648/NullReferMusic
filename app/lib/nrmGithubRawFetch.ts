/**
 * GitHub raw.githubusercontent.com 요청 시 CDN·프록시 캐시 우회.
 * api.github.com(Contents API)는 이 헬퍼 대상이 아니다.
 */
export function nrmGithubRawCacheBustUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  const sep = trimmed.includes('?') ? '&' : '?';
  return `${trimmed}${sep}t=${Date.now()}`;
}

/** JSON raw 문서 fetch (alarm.json, inquiry.json 등) */
export async function fetchGithubRawJson<T>(
  rawUrl: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetchGithubRaw(rawUrl, init);
  if (!res.ok) {
    throw new Error(`GitHub raw HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function fetchGithubRaw(rawUrl: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }
  if (!headers.has('Cache-Control')) {
    headers.set('Cache-Control', 'no-cache, no-store');
  }
  if (!headers.has('Pragma')) {
    headers.set('Pragma', 'no-cache');
  }
  return fetch(nrmGithubRawCacheBustUrl(rawUrl), {
    ...init,
    headers,
  });
}
