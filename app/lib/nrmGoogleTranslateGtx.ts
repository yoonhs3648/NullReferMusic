/** Google Translate gtx 엔드포인트 공통 유틸 (웹·네이티브 공유). */

export const GTX_BATCH_SIZE = 20;
export const GTX_BATCH_DELAY_MS = 60;
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
  const sourceLangs: string[] = new Array(texts.length).fill('');

  type Slot = { index: number; text: string };
  const slots: Slot[] = [];
  for (let i = 0; i < texts.length; i++) {
    const trimmed = String(texts[i] ?? '').trim();
    if (!trimmed) {
      outTexts[i] = '';
      sourceLangs[i] = '';
    } else {
      slots.push({ index: i, text: trimmed });
    }
  }

  for (let batchStart = 0; batchStart < slots.length; batchStart += GTX_BATCH_SIZE) {
    const batch = slots.slice(batchStart, batchStart + GTX_BATCH_SIZE);
    if (batch.length === 0) continue;

    if (batch.length === 1) {
      const url = buildGtxTranslateUrl([batch[0]!.text]);
      const data = await fetchGtxJson(fetchFn, url);
      const row = parseGtxSingleResponse(data);
      outTexts[batch[0]!.index] = row.text;
      sourceLangs[batch[0]!.index] = row.sourceLang;
    } else {
      const url = buildGtxTranslateUrl(batch.map((s) => s.text));
      const data = await fetchGtxJson(fetchFn, url);
      const parsed = parseGtxMultiResponse(data, batch.length);
      if (parsed.texts.length !== batch.length) {
        throw new Error('Google Translate 배치 결과 개수가 요청과 일치하지 않습니다.');
      }
      for (let j = 0; j < batch.length; j++) {
        outTexts[batch[j]!.index] = parsed.texts[j] ?? '';
        sourceLangs[batch[j]!.index] = parsed.sourceLangs[j] ?? 'EN';
      }
    }

    if (batchStart + GTX_BATCH_SIZE < slots.length) {
      await new Promise((r) => setTimeout(r, GTX_BATCH_DELAY_MS));
    }
  }

  return { texts: outTexts, sourceLangs };
}
