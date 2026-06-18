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

/** DeepL·Google Translate 응답은 가사만 온다고 가정 (구버전 `[타임] …` 응답도 파싱) */
export function normalizeDeepLLyricTranslation(
  deeplResponse: string,
  requestLyric?: string,
): string {
  const resp = deeplResponse.trim();
  if (!resp) return '';
  const fromResp = splitLrcLine(resp);
  if (fromResp?.text) return fromResp.text;
  if (requestLyric && resp === requestLyric.trim()) return '';
  return resp;
}

/** 한글(가사 번역) 포함 여부 — 오프라인 en→ko 검증용 */
export function containsHangul(text: string): boolean {
  return /[\uAC00-\uD7A3]/.test(text);
}

function isSameLyricTranslation(original: string, translation: string): boolean {
  const orig = original.trim();
  const trans = translation.trim();
  if (!orig || !trans) return true;
  if (orig.toLowerCase() === trans.toLowerCase()) return true;
  const unwrapped =
    trans.startsWith('(') && trans.endsWith(')')
      ? trans.slice(1, -1).trim()
      : trans;
  return orig.toLowerCase() === unwrapped.toLowerCase();
}

/**
 * 원문과 번역을 같은 타임스탬프로 두 줄 출력.
 *   [mm:ss.xx] 원문 가사
 *   [mm:ss.xx] (한글 번역)
 *
 * DeepL이 원문 괄호를 그대로 보존(`(english)` → `(한글)`)하므로,
 * 번역 결과가 이미 `(...)` 로 감싸진 경우 추가로 감싸지 않는다.
 */
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
      out.push(`[${parsed.ts}] ${parsed.text}`);
      // DeepL이 괄호를 보존하면 이미 `(...)` 형태 — 중복 감싸기 방지
      const wrapped =
        translated.startsWith('(') && translated.endsWith(')')
          ? translated
          : `(${translated})`;
      out.push(`[${parsed.ts}] ${wrapped}`);
    } else {
      out.push(`[${parsed.ts}] ${parsed.text}`);
    }
  }
  return out.join('\n').trim();
}

/**
 * 번역 줄 제거 (가사 모드를 번역지원 → 설정으로 변경 시).
 *
 * **새 형식** (이번 수정 이후): 이전 줄과 동일 타임스탬프 + 텍스트 전체가 `(...)` → 번역 줄
 * **구 형식** (이전 다운로드): `원문 (한글번역)` 형태 → 줄 끝의 ` (...)` 제거.
 *   단, 원문이 `(`로 시작하면 내부 판별이 어려우므로 그대로 유지.
 */
export function stripTranslationsFromLrc(lrcText: string): string {
  const lines = normalizeLrcLines(lrcText);
  const out: string[] = [];

  for (const line of lines) {
    const parsed = splitLrcLine(line);
    if (!parsed) {
      out.push(line);
      continue;
    }

    // 새 형식: 직전 출력 줄과 동일 타임스탬프 + 텍스트 전체가 (...)
    if (out.length > 0) {
      const prev = splitLrcLine(out[out.length - 1]);
      if (prev?.ts === parsed.ts && parsed.text.startsWith('(') && parsed.text.endsWith(')')) {
        continue; // 번역 줄 제거
      }
    }

    // 구 형식: 줄 끝의 ` (번역)` 제거 — 원문이 (...)로 시작하지 않는 경우만
    let text = parsed.text;
    if (!text.startsWith('(')) {
      const stripped = text.replace(/\s+\([^)]+\)\s*$/, '').trimEnd();
      if (stripped) text = stripped;
    }
    out.push(`[${parsed.ts}] ${text}`);
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
  sourceLangs?: string[],
): string {
  const byLineIndex = new Map<number, string>();

  for (let i = 0; i < slotIndices.length; i++) {
    const slot = slots[slotIndices[i]];
    const detected = (sourceLangs?.[i] ?? '').trim().toUpperCase();
    if (detected === 'KO') {
      continue;
    }
    const translation = normalizeDeepLLyricTranslation(
      deeplResponses[i] ?? '',
      slot.deeplText ?? undefined,
    );
    if (!translation) {
      continue;
    }
    if (isSameLyricTranslation(slot.lyricText, translation)) {
      continue;
    }
    // 오프라인 en→ko: 한글이 없으면 번역 실패로 간주하고 원문 아래 줄을 추가하지 않음
    if ((detected === 'EN' || detected === '') && !containsHangul(translation)) {
      continue;
    }
    byLineIndex.set(slot.lineIndex, translation);
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

