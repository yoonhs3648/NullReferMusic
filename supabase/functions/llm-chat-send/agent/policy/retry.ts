/**
 * RetryPolicy — 429/5xx만 재시도, 401은 안 함.
 */

export type RetryableErrorKind = 'rate_limit' | 'network' | 'other' | 'auth' | 'timeout';

export type RetryPolicy = {
  maxRetry: number;
  /** 초기 대기 ms */
  backoffMs: number;
  /** 지수 배율 */
  backoffFactor: number;
  /** 최대 대기 ms */
  maxBackoffMs: number;
  retryableErrors: RetryableErrorKind[];
};

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetry: 1,
  backoffMs: 400,
  backoffFactor: 2,
  maxBackoffMs: 4_000,
  retryableErrors: ['rate_limit', 'network', 'timeout'],
};

export const SEARCH_RETRY_POLICY: RetryPolicy = {
  maxRetry: 2,
  backoffMs: 500,
  backoffFactor: 2,
  maxBackoffMs: 5_000,
  retryableErrors: ['rate_limit', 'network', 'timeout'],
};

export const NO_RETRY_POLICY: RetryPolicy = {
  maxRetry: 0,
  backoffMs: 0,
  backoffFactor: 1,
  maxBackoffMs: 0,
  retryableErrors: [],
};

export function isRetryableKind(policy: RetryPolicy, kind: RetryableErrorKind): boolean {
  if (kind === 'auth') return false;
  return policy.retryableErrors.includes(kind);
}

export function backoffDelayMs(policy: RetryPolicy, attemptIndex: number): number {
  if (policy.maxRetry <= 0) return 0;
  const raw = policy.backoffMs * Math.pow(policy.backoffFactor, Math.max(0, attemptIndex));
  return Math.min(policy.maxBackoffMs, Math.floor(raw));
}

export async function sleepMs(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return;
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
