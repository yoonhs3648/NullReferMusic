/**
 * DeepL /v2/translate 배치·청크·재시도.
 *
 * 정책 (DeepL 문서):
 * - 요청당 text[] 최대 50개, 본문 128 KiB 이하
 * - 권장 ~50 req/s 이하 (429 시 백오프)
 *
 * LRC: 타임스탬프 제외 가사 텍스트 1줄 = text[] 항목 1개. HTTP 요청은 최대 50줄씩 묶음.
 */

/** DeepL 공식: 요청 본문 128 KiB — JSON 오버헤드 여유 */
export const DEEPL_MAX_BODY_BYTES = 120 * 1024;
/** DeepL 공식: 한 요청당 text 파라미터 최대 50개 */
export const DEEPL_MAX_LINES_PER_REQUEST = 50;
/** 연속 HTTP 요청 간 최소 간격 (~20 req/s, Free 티어·모바일 안전) */
export const DEEPL_INTER_REQUEST_DELAY_MS = 50;
export const DEEPL_TRANSLATE_MAX_RETRIES = 2;
export const DEEPL_RETRY_BASE_MS = 800;

export type DeepLTranslateTextsOutcome =
  | { ok: true; texts: string[]; transport: string; apiUsed: 'free' | 'pro' }
  | { ok: false; message: string; transport?: string };

export function estimateTranslateJsonBytes(texts: string[]): number {
  let n = 96;
  for (const t of texts) {
    n += JSON.stringify(t).length + 1;
  }
  return n;
}

/**
 * LRC 줄(각각 `[mm:ss.xx] …`)을 DeepL HTTP 요청 단위로 분할.
 * 줄마다 text[] 슬롯 1개 — 한 요청에 최대 50줄, 128 KiB 미만.
 */
export function chunkLrcLinesForDeepL(lines: string[]): string[][] {
  if (lines.length === 0) return [];
  const chunks: string[][] = [];
  let current: string[] = [];
  let currentBytes = estimateTranslateJsonBytes([]);

  const flush = () => {
    if (current.length > 0) {
      chunks.push(current);
      current = [];
      currentBytes = estimateTranslateJsonBytes([]);
    }
  };

  for (const line of lines) {
    const addBytes = JSON.stringify(line).length + 1;
    const wouldCount = current.length + 1;
    const wouldBytes = currentBytes + addBytes;
    if (
      current.length > 0 &&
      (wouldCount > DEEPL_MAX_LINES_PER_REQUEST || wouldBytes > DEEPL_MAX_BODY_BYTES)
    ) {
      flush();
    }
    current.push(line);
    currentBytes = estimateTranslateJsonBytes(current);
  }
  flush();
  return chunks;
}

/** @deprecated chunkLrcLinesForDeepL 사용 */
export function chunkTextsForDeepL(texts: string[]): string[][] {
  return chunkLrcLinesForDeepL(texts);
}

export function isRetryableDeepLError(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

export function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
