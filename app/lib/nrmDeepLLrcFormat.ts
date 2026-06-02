/** LRC 줄 파싱·번역지원 포맷 (DeepL·Whisper 공통) */

export type LrcTranslationSlot = {
  /** 원본 LRC lines 배열 인덱스 */
  lineIndex: number;
  ts: string;
  /** 타임스탬프 뒤 원문 (DeepL·LRC 출력 공통) */
  lyricText: string;
  /** DeepL text[]에 넣을 문자열. null이면 API 호출 안 함 */
  deeplText: string | null;
  /** API 없이 괄호에 넣을 고정 번역 (예: [MUSIC] → 음악) */
  localTranslation: string | null;
};

const LRC_LINE_RE = /^\[(\d{2}:\d{2}\.\d{2})\](.*)$/;

/** Whisper·LRC 관례의 비가사·음악 구간 — DeepL 토큰 낭비 방지 */
const MUSIC_LYRIC_RE =
  /^(?:\[\s*music\s*\]|\(\s*music\s*\)|♪+\s*|🎵\s*|〰+\s*)$/i;

export function splitLrcLine(line: string): { ts: string; text: string } | null {
  const m = line.match(LRC_LINE_RE);
  if (!m) return null;
  return { ts: m[1], text: (m[2] ?? '').trim() };
}

export function normalizeLrcLines(lrcText: string): string[] {
  return lrcText
    .split(/\r?\n/)
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

export function isNonTranslatableMusicLyric(lyricText: string): boolean {
  const t = lyricText.trim();
  if (!t) return false;
  return MUSIC_LYRIC_RE.test(t);
}

/**
 * 타임스탬프 줄마다 번역 슬롯 생성.
 * - DeepL: 가사 텍스트만 전송 (타임스탬프 제외), source_lang 미지정 → 자동 감지
 * - [MUSIC] 등: API 생략, 로컬 `(음악)`
 */
export function planLrcTranslationSlots(lines: string[]): LrcTranslationSlot[] {
  const slots: LrcTranslationSlot[] = [];
  for (let i = 0; i < lines.length; i++) {
    const parsed = splitLrcLine(lines[i]);
    if (!parsed) continue;
    if (!parsed.text) continue;

    if (isNonTranslatableMusicLyric(parsed.text)) {
      slots.push({
        lineIndex: i,
        ts: parsed.ts,
        lyricText: parsed.text,
        deeplText: null,
        localTranslation: '음악',
      });
      continue;
    }

    slots.push({
      lineIndex: i,
      ts: parsed.ts,
      lyricText: parsed.text,
      deeplText: parsed.text,
      localTranslation: null,
    });
  }
  return slots;
}

/** @deprecated planLrcTranslationSlots 사용 */
export type LrcTranslationTarget = LrcTranslationSlot & { idx: number; requestLine: string };

/** @deprecated planLrcTranslationSlots 사용 */
export function collectLrcTranslationTargets(lines: string[]): LrcTranslationTarget[] {
  return planLrcTranslationSlots(lines).map((s) => ({
    ...s,
    idx: s.lineIndex,
    requestLine: `[${s.ts}] ${s.lyricText}`,
  }));
}

/** DeepL 응답은 가사만 온다고 가정 (구버전 `[타임] …` 응답도 파싱) */
export function normalizeDeepLLyricTranslation(
  deeplResponse: string,
  requestLyric?: string,
): string {
  const resp = deeplResponse.trim();
  if (!resp) return '';
  const fromResp = splitLrcLine(resp);
  if (fromResp?.text) return fromResp.text;
  if (requestLyric && resp === requestLyric.trim()) return resp;
  return resp;
}

/** `[mm:ss.xx] 원문 (번역)` — 타임스탬프당 한 줄 */
export function buildTranslationSupportedLrc(
  sourceLines: string[],
  translatedByIndex: Map<number, string>,
): string {
  const out: string[] = [];
  for (let i = 0; i < sourceLines.length; i++) {
    const line = sourceLines[i];
    const parsed = splitLrcLine(line);
    if (!parsed) {
      out.push(line);
      continue;
    }
    const translated = (translatedByIndex.get(i) ?? '').trim();
    if (translated) {
      out.push(`[${parsed.ts}] ${parsed.text} (${translated})`);
    } else {
      out.push(`[${parsed.ts}] ${parsed.text}`);
    }
  }
  return out.join('\n').trim();
}

/** API에 보낼 가사 문자열과 슬롯 인덱스 (순서 유지) */
export function extractDeepLTextsFromSlots(slots: LrcTranslationSlot[]): {
  texts: string[];
  slotIndices: number[];
} {
  const texts: string[] = [];
  const slotIndices: number[] = [];
  for (let si = 0; si < slots.length; si++) {
    const text = slots[si].deeplText?.trim();
    if (!text) continue;
    texts.push(text);
    slotIndices.push(si);
  }
  return { texts, slotIndices };
}

export function mergeDeepLResponsesIntoLrc(
  lines: string[],
  slots: LrcTranslationSlot[],
  slotIndices: number[],
  deeplResponses: string[],
): string {
  const byLineIndex = new Map<number, string>();

  for (let i = 0; i < slotIndices.length; i++) {
    const slot = slots[slotIndices[i]];
    const translation = normalizeDeepLLyricTranslation(
      deeplResponses[i] ?? '',
      slot.deeplText ?? undefined,
    );
    if (translation) {
      byLineIndex.set(slot.lineIndex, translation);
    }
  }

  for (const slot of slots) {
    const local = slot.localTranslation?.trim();
    if (local && !byLineIndex.has(slot.lineIndex)) {
      byLineIndex.set(slot.lineIndex, local);
    }
  }

  return buildTranslationSupportedLrc(lines, byLineIndex);
}

/** @deprecated mergeDeepLResponsesIntoLrc 사용 */
export function extractTranslationFromDeepLLine(
  _requestLine: string,
  deeplResponse: string,
): string {
  return normalizeDeepLLyricTranslation(deeplResponse);
}

/** @deprecated mergeDeepLResponsesIntoLrc 사용 */
export function mapTranslationsToLrc(
  lines: string[],
  targets: Array<{ idx: number; requestLine: string; deeplText?: string | null }>,
  deeplResponses: string[],
): string {
  const slots: LrcTranslationSlot[] = targets.map((t) => ({
    lineIndex: t.idx,
    ts: splitLrcLine(t.requestLine)?.ts ?? '00:00.00',
    lyricText: splitLrcLine(t.requestLine)?.text ?? t.requestLine,
    deeplText: t.deeplText ?? t.requestLine.replace(/^\[\d{2}:\d{2}\.\d{2}\]\s*/, ''),
    localTranslation: null,
  }));
  const indices = slots.map((_, i) => i).filter((i) => slots[i].deeplText);
  return mergeDeepLResponsesIntoLrc(lines, slots, indices, deeplResponses);
}
