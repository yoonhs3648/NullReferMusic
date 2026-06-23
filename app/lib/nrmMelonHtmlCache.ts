/** 멜론 HTML 직접 fetch — 동일 URL 단기 캐시 (파싱 결과·동작 동일). */

const MELON_HTML_CACHE_TTL_MS = 120_000;
const MELON_HTML_CACHE_MAX = 48;

type CacheEntry = { html: string; at: number };

const cache = new Map<string, CacheEntry>();

function pruneMelonHtmlCache(now: number): void {
  for (const [key, entry] of cache) {
    if (now - entry.at > MELON_HTML_CACHE_TTL_MS) {
      cache.delete(key);
    }
  }
  while (cache.size > MELON_HTML_CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

export function readMelonHtmlCache(url: string): string | null {
  const entry = cache.get(url);
  if (!entry) return null;
  if (Date.now() - entry.at > MELON_HTML_CACHE_TTL_MS) {
    cache.delete(url);
    return null;
  }
  return entry.html;
}

export function writeMelonHtmlCache(url: string, html: string): void {
  const now = Date.now();
  cache.set(url, { html, at: now });
  pruneMelonHtmlCache(now);
}

export function clearMelonHtmlCache(): void {
  cache.clear();
}
