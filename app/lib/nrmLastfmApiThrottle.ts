/** Last.fm 차트 커버 등 — IP rate limit(429) 방지용 글로벌 직렬 큐 */

const MIN_GAP_MS = 350;
const RATE_LIMIT_COOLDOWN_MS = 10 * 60 * 1000;
const MAX_PENDING = 24;

let chain: Promise<void> = Promise.resolve();
let lastRequestAt = 0;
let cooldownUntil = 0;
let rateLimitLogged = false;

const queuedMbids = new Set<string>();
const inflightMbids = new Set<string>();
let pendingCount = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isLastfmApiInCooldown(): boolean {
  return Date.now() < cooldownUntil;
}

/** 429 또는 Last.fm error 29 — 이후 요청을 일정 시간 중단 */
export function markLastfmApiRateLimited(): void {
  cooldownUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
  if (!rateLimitLogged) {
    rateLimitLogged = true;
  }
}

export function resetLastfmApiRateLimitCooldownForTests(): void {
  cooldownUntil = 0;
  rateLimitLogged = false;
  queuedMbids.clear();
  inflightMbids.clear();
  pendingCount = 0;
  chain = Promise.resolve();
  lastRequestAt = 0;
}

export type LastfmThrottledTaskResult<T> =
  | { ok: true; value: T }
  | { ok: false; skipped: 'cooldown' | 'duplicate' | 'queue_full' }
  | { ok: false; rateLimited: true };

/**
 * mbid 단위로 중복·큐 포화를 막고, 요청 간 최소 350ms 간격을 유지합니다.
 */
export function runLastfmThrottledByMbid<T>(
  mbid: string,
  task: () => Promise<T>,
): Promise<LastfmThrottledTaskResult<T>> {
  const key = mbid.trim().toLowerCase();
  if (!key) {
    return Promise.resolve({ ok: false, skipped: 'duplicate' });
  }
  if (Date.now() < cooldownUntil) {
    return Promise.resolve({ ok: false, skipped: 'cooldown' });
  }
  if (queuedMbids.has(key) || inflightMbids.has(key)) {
    return Promise.resolve({ ok: false, skipped: 'duplicate' });
  }
  if (pendingCount >= MAX_PENDING) {
    return Promise.resolve({ ok: false, skipped: 'queue_full' });
  }

  queuedMbids.add(key);
  pendingCount += 1;

  const run = chain.then(async (): Promise<LastfmThrottledTaskResult<T>> => {
    queuedMbids.delete(key);
    pendingCount = Math.max(0, pendingCount - 1);

    if (Date.now() < cooldownUntil) {
      return { ok: false, skipped: 'cooldown' };
    }

    const wait = Math.max(0, MIN_GAP_MS - (Date.now() - lastRequestAt));
    if (wait > 0) {
      await sleep(wait);
    }
    if (Date.now() < cooldownUntil) {
      return { ok: false, skipped: 'cooldown' };
    }

    lastRequestAt = Date.now();
    inflightMbids.add(key);
    try {
      const value = await task();
      return { ok: true, value };
    } catch (e) {
      if (isRateLimitError(e)) {
        markLastfmApiRateLimited();
        return { ok: false, rateLimited: true };
      }
      throw e;
    } finally {
      inflightMbids.delete(key);
    }
  });

  chain = run.then(
    () => undefined,
    () => undefined,
  );

  return run;
}

function isRateLimitError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const err = e as { rateLimited?: boolean; httpStatus?: number; lastfmError?: number };
  return (
    err.rateLimited === true ||
    err.httpStatus === 429 ||
    err.lastfmError === 29
  );
}
