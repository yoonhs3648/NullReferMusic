/** 웹 — Google Translate 공개 엔드포인트로 직접 번역합니다. */

async function translateOneViaGtx(text: string): Promise<{ text: string; sourceLang: string }> {
  const trimmed = text.trim();
  if (!trimmed) {
    return { text: '', sourceLang: '' };
  }
  const url =
    'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ko&dt=t&q=' +
    encodeURIComponent(trimmed);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Google Translate HTTP ${res.status}`);
  }
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    throw new Error('Google Translate 응답 형식이 올바르지 않습니다.');
  }
  const segments = data[0] as Array<[string, ...unknown[]]>;
  const translated = segments.map((seg) => String(seg[0] ?? '')).join('');
  const sourceLang = typeof data[2] === 'string' ? data[2].toUpperCase() : 'EN';
  return { text: translated.trim(), sourceLang };
}

export function attachGoogleTranslateWebView(_ref: unknown): void {}

export function markGoogleTranslateWebViewLoading(): void {}

export function markGoogleTranslateWebViewReady(): void {}

export function routeGoogleTranslateWebViewMessage(_raw: string): void {}

export async function translateTextsViaGoogleTranslateWeb(
  texts: string[],
): Promise<{ texts: string[]; sourceLangs: string[] }> {
  const outTexts: string[] = [];
  const sourceLangs: string[] = [];
  for (let i = 0; i < texts.length; i++) {
    const row = await translateOneViaGtx(texts[i] ?? '');
    outTexts.push(row.text);
    sourceLangs.push(row.sourceLang);
    if (i + 1 < texts.length) {
      await new Promise((r) => setTimeout(r, 60));
    }
  }
  return { texts: outTexts, sourceLangs };
}
