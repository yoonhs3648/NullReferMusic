/** Google Translate gtx 엔드포인트 공통 유틸 (웹·네이티브 공유). */

/** gtx는 다중 q= 요청 시 첫 줄만 번역하므로 1줄씩 요청 */
export const GTX_BATCH_SIZE = 1;
/** 그룹 간 지연 (rate-limit 방어) */
export const GTX_BATCH_DELAY_MS = 60;
/** 동시에 발사하는 요청 수 — 순차 대비 ~3배 속도, 그룹 사이 딜레이로 rate-limit 보호 */
export const GTX_CONCURRENCY = 3;
export const GTX_FETCH_TIMEOUT_MS = 15_000;

export function buildGtxTranslateUrl(texts: string[]): string {
  const params = new URLSearchParams();
  params.set('client', 'gtx');
  params.set('sl', 'auto');
  params.set('tl', 'ko');
  params.set('dt', 't');
  for (const text of texts) {
    const trimmed = String(text ?? '').trim();
    if (trimmed) {
      params.append('q', trimmed);
    }
  }
  return `https://translate.googleapis.com/translate_a/single?${params.toString()}`;
}

type GtxJson = unknown;

function parseOneQuerySegments(segments: unknown): string {
  if (!Array.isArray(segments)) return '';
  let translated = '';
  for (const seg of segments) {
    if (Array.isArray(seg) && seg.length > 0) {
      translated += String(seg[0] ?? '');
    }
  }
  return translated.trim();
}

/** 단일 q= 응답 (기존과 동일). */
export function parseGtxSingleResponse(data: GtxJson): { text: string; sourceLang: string } {
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    throw new Error('Google Translate 응답 형식이 올바르지 않습니다.');
  }
  const text = parseOneQuerySegments(data[0]);
  const sourceLang = typeof data[2] === 'string' ? data[2].toUpperCase() : 'EN';
  return { text, sourceLang };
}

/** 다중 q= 응답 — 줄마다 독립 번역 (순차 1줄 요청과 동일 의미). */
export function parseGtxMultiResponse(
  data: GtxJson,
  queryCount: number,
): { texts: string[]; sourceLangs: string[] } {
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    throw new Error('Google Translate 응답 형식이 올바르지 않습니다.');
  }
  const root = data[0] as unknown[];
  const sourceLang = typeof data[2] === 'string' ? data[2].toUpperCase() : 'EN';
  const texts: string[] = [];
  const sourceLangs: string[] = [];
  for (let i = 0; i < queryCount; i++) {
    texts.push(parseOneQuerySegments(root[i]));
    sourceLangs.push(sourceLang);
  }
  return { texts, sourceLangs };
}

export type GtxFetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export async function fetchGtxJson(
  fetchFn: GtxFetchFn,
  url: string,
  timeoutMs = GTX_FETCH_TIMEOUT_MS,
): Promise<GtxJson> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return (await res.json()) as GtxJson;
  } finally {
    clearTimeout(timer);
  }
}

export async function translateTextsViaGtxBatched(
  texts: string[],
  fetchFn: GtxFetchFn,
): Promise<{ texts: string[]; sourceLangs: string[] }> {
  if (texts.length === 0) {
    return { texts: [], sourceLangs: [] };
  }

  const outTexts: string[] = new Array(texts.length).fill('');
  const outSourceLangs: string[] = new Array(texts.length).fill('');

  type Slot = { index: number; text: string };
  const slots: Slot[] = [];
  for (let i = 0; i < texts.length; i++) {
    const trimmed = String(texts[i] ?? '').trim();
    if (trimmed) {
      slots.push({ index: i, text: trimmed });
    }
  }

  // GTX_BATCH_SIZE=1(API 제약)이므로 1줄씩 요청하되,
  // GTX_CONCURRENCY 개를 동시에 발사해 속도를 높인다.
  // 그룹 사이에는 GTX_BATCH_DELAY_MS 지연으로 rate-limit을 방어한다.
  for (let groupStart = 0; groupStart < slots.length; groupStart += GTX_CONCURRENCY) {
    const group = slots.slice(groupStart, groupStart + GTX_CONCURRENCY);

    const results = await Promise.all(
      group.map(async (slot) => {
        const url = buildGtxTranslateUrl([slot.text]);
        const data = await fetchGtxJson(fetchFn, url);
        const row = parseGtxSingleResponse(data);
        return { index: slot.index, text: row.text, sourceLang: row.sourceLang };
      }),
    );

    for (const r of results) {
      outTexts[r.index] = r.text;
      outSourceLangs[r.index] = r.sourceLang;
    }

    if (groupStart + GTX_CONCURRENCY < slots.length) {
      await new Promise<void>((resolve) => setTimeout(resolve, GTX_BATCH_DELAY_MS));
    }
  }

  return { texts: outTexts, sourceLangs: outSourceLangs };
}
