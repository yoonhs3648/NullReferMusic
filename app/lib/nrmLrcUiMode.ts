import { splitLrcLine, normalizeLrcLines } from '@/lib/nrmDeepLLrcFormat';

import type { NrmLyricsUiMode, NrmMelonLyricsMode } from '@/lib/nrmMelonLyrics';

import {

  buildLyricsSentinel,

  isMelonLyricsUiMode,

  parseLyricsUiMode,

} from '@/lib/nrmMelonLyrics';

import type { NrmWhisperLyricsMode } from '@/lib/nrmWhisperLyrics';



/** 동일 타임스탬프에 가사 2줄 이상인 횟수가 이 값 이상이면 번역지원으로 판단 */

export const DUPLICATE_TS_TRANSLATION_THRESHOLD = 10;

const NRM_LRC_MODE_LINE_RE =
  /^\[nrm:(configured|translation|melon|melon_translation)\]$/i;

/** LRC 첫머리에 저장하는 가사 UI 모드 태그 (플레이어는 타임스탬프 줄이 아니므로 무시됨) */
export function buildNrmLrcModeLine(mode: Exclude<NrmLyricsUiMode, 'unset'>): string {
  return `[nrm:${mode}]`;
}

export function parseLyricsModeFromLrcText(lrcText: string): NrmLyricsUiMode | null {
  for (const line of lrcText.split(/\r?\n/).slice(0, 8)) {
    const m = line.trim().match(NRM_LRC_MODE_LINE_RE);
    if (!m) continue;
    const mode = m[1].toLowerCase();
    if (
      mode === 'configured' ||
      mode === 'translation' ||
      mode === 'melon' ||
      mode === 'melon_translation'
    ) {
      return mode;
    }
  }
  return null;
}

/** ffmpeg sentinel, LRC `[nrm:…]` 태그, LRC 본문 순으로 UI 가사 모드 복원 */
export function detectLyricsUiModeFromStoredText(raw: string | undefined): {
  mode: NrmLyricsUiMode;
  lrcModeFromTag: NrmLyricsUiMode | null;
} {
  const text = (raw ?? '').trim();
  if (!text) return { mode: 'unset', lrcModeFromTag: null };

  const fromSentinel = parseLyricsUiMode(text);
  if (fromSentinel !== 'unset') {
    return { mode: fromSentinel, lrcModeFromTag: null };
  }

  const lrcModeFromTag = parseLyricsModeFromLrcText(text);
  const mode = lrcModeFromTag ?? detectLrcUiModeFromText(text);
  return { mode, lrcModeFromTag };
}

export function stripNrmLrcModeLine(lrcText: string): string {
  const lines = lrcText.split(/\r?\n/);
  const filtered = lines.filter((line) => !NRM_LRC_MODE_LINE_RE.test(line.trim()));
  return filtered.join('\n').trim();
}

export function withNrmLyricsModeHeader(
  lrcText: string,
  mode: Exclude<NrmLyricsUiMode, 'unset'>,
): string {
  const body = stripNrmLrcModeLine(lrcText);
  return body ? `${buildNrmLrcModeLine(mode)}\n${body}` : buildNrmLrcModeLine(mode);
}



/** LRC 본문에서 동일 타임스탬프에 가사가 2줄 이상인 타임스탬프 개수 */

export function countDuplicateTimestampLyrics(lrcText: string): number {

  const tsCounts = new Map<string, number>();

  for (const line of normalizeLrcLines(lrcText)) {

    const parsed = splitLrcLine(line);

    if (!parsed?.text) continue;

    tsCounts.set(parsed.ts, (tsCounts.get(parsed.ts) ?? 0) + 1);

  }

  let duplicateTs = 0;

  for (const count of tsCounts.values()) {

    if (count >= 2) duplicateTs += 1;

  }

  return duplicateTs;

}



/**

 * LRC 본문에서 UI 가사 모드 추정.

 * - 번역지원(신 형식): 동일 타임스탬프에 원문·번역 2줄

 * - 번역지원(구 형식): 한 줄 끝 `원문 (번역)` 패턴 (하위 호환)

 */

export function detectLrcUiModeFromText(lrcText: string): NrmLyricsUiMode {

  const lines = normalizeLrcLines(lrcText);

  if (lines.length === 0) return 'unset';



  let lyricLines = 0;

  for (const line of lines) {

    const parsed = splitLrcLine(line);

    if (parsed?.text) lyricLines += 1;

  }

  if (lyricLines === 0) return 'unset';



  if (countDuplicateTimestampLyrics(lrcText) >= DUPLICATE_TS_TRANSLATION_THRESHOLD) {

    return 'translation';

  }



  // 구 형식: `원문 (번역)` 단일 줄

  let withParenTranslation = 0;

  for (const line of lines) {

    const parsed = splitLrcLine(line);

    if (!parsed?.text) continue;

    if (/\([^)]+\)\s*$/.test(parsed.text)) {

      withParenTranslation += 1;

    }

  }

  if (withParenTranslation >= Math.max(1, Math.ceil(lyricLines * 0.25))) {

    return 'translation';

  }

  return 'configured';

}



export type LyricsSidecarAction =

  | { kind: 'none' }

  | { kind: 'delete' }

  | { kind: 'generate'; mode: NrmWhisperLyricsMode }

  | { kind: 'generate-melon'; mode: NrmMelonLyricsMode }

  /** 기존 LRC를 Whisper 재실행 없이 DeepL로 번역 (configured → translation) */

  | { kind: 'translate-lrc' }

  /** 기존 LRC에서 한글 번역 줄만 제거 (translation → configured) — Whisper 재실행 불필요 */

  | { kind: 'strip-translation' };



/**

 * 저장 시 LRC 처리 방식 결정 (Whisper/Melon 재생성 여부).

 *

 * `existingLrcUri`: 현재 트랙에 이미 사이드카 LRC가 있으면 전달.

 * configured → translation 전환 시 Whisper 재실행 없이 기존 LRC를 번역만 한다.

 */

export function resolveLyricsSidecarAction(

  initial: NrmLyricsUiMode,

  next: NrmLyricsUiMode,

  existingLrcUri?: string | null,

): LyricsSidecarAction {

  if (initial === next) return { kind: 'none' };

  if (next === 'unset') return { kind: 'delete' };



  if (isMelonLyricsUiMode(next)) {

    if (next === 'melon') {

      if (

        (initial === 'melon_translation' || initial === 'translation') &&

        existingLrcUri

      ) {

        return { kind: 'strip-translation' };

      }

      return { kind: 'generate-melon', mode: 'melon' };

    }

    if (initial === 'melon' && existingLrcUri) {

      return { kind: 'translate-lrc' };

    }

    if (initial === 'configured' && existingLrcUri) {

      return { kind: 'translate-lrc' };

    }

    return { kind: 'generate-melon', mode: 'melon_translation' };

  }



  if (next === 'configured') {

    if (existingLrcUri) {

      return { kind: 'strip-translation' };

    }

    return { kind: 'generate', mode: 'configured' };

  }

  if (initial === 'configured' && existingLrcUri) {

    return { kind: 'translate-lrc' };

  }

  if (initial === 'melon' && existingLrcUri) {

    return { kind: 'translate-lrc' };

  }

  return { kind: 'generate', mode: 'translation' };

}



export function lyricsUiModeToMetadataField(

  mode: NrmLyricsUiMode,

): string | undefined {

  if (mode === 'unset') return undefined;

  return buildLyricsSentinel(mode);

}


