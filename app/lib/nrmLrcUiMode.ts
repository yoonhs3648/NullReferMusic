import { splitLrcLine, normalizeLrcLines } from '@/lib/nrmDeepLLrcFormat';

import type { NrmLyricsUiMode, NrmMelonLyricsMode } from '@/lib/nrmMelonLyrics';

import {
  buildLyricsSentinel,
  isMelonLyricsUiMode,
  isMelonTrackWebsite,
  parseLyricsUiMode,
} from '@/lib/nrmMelonLyrics';

import type { NrmWhisperLyricsMode } from '@/lib/nrmWhisperLyrics';

export const DUPLICATE_TS_TRANSLATION_THRESHOLD = 10;

const LRC_MODE_VALUES = '(configured|translation|melon|melon_translation)';

/** 구 형식 — 플레이어에 가사로 노출될 수 있어 하위 호환 파싱만 유지 */
const LEGACY_NRM_LRC_MODE_LINE_RE = new RegExp(`^\\[nrm:${LRC_MODE_VALUES}\\]$`, 'i');

/** LRC 1.x/2.0 표준 메타데이터 `[re:…]` (프로그램/작성 도구) — 대부분 플레이어가 가사 줄로 표시하지 않음 */
const NRM_LRC_MODE_LINE_RE = new RegExp(`^\\[re:NRM\\/${LRC_MODE_VALUES}\\]$`, 'i');

/** ar/ti/al 등 일반 LRC 메타데이터 줄 (타임스탬프 가사 아님) */
export const LRC_METADATA_TAG_LINE_RE =
  /^\[(?:ar|ti|al|by|offset|re|ve|la|au|length|language|tool|too|version|total|key):[^\]]*\]$/i;

export function isNrmLyricsModeHeaderLine(line: string): boolean {
  const t = line.trim();
  return LEGACY_NRM_LRC_MODE_LINE_RE.test(t) || NRM_LRC_MODE_LINE_RE.test(t);
}

export function isLrcMetadataTagLine(line: string): boolean {
  return LRC_METADATA_TAG_LINE_RE.test(line.trim());
}

function parseModeToken(raw: string): Exclude<NrmLyricsUiMode, 'unset'> | null {
  const mode = raw.toLowerCase();
  if (
    mode === 'configured' ||
    mode === 'translation' ||
    mode === 'melon' ||
    mode === 'melon_translation'
  ) {
    return mode;
  }
  return null;
}

/** LRC 첫머리에 저장하는 가사 UI 모드 — 표준 `[re:…]` 메타데이터 태그 */
export function buildNrmLrcModeLine(mode: Exclude<NrmLyricsUiMode, 'unset'>): string {
  return `[re:NRM/${mode}]`;
}

export function parseLyricsModeFromLrcText(lrcText: string): NrmLyricsUiMode | null {
  for (const line of lrcText.split(/\r?\n/).slice(0, 12)) {
    const t = line.trim();
    const legacy = t.match(LEGACY_NRM_LRC_MODE_LINE_RE);
    if (legacy) {
      const mode = parseModeToken(legacy[1]);
      if (mode) return mode;
    }
    const modern = t.match(NRM_LRC_MODE_LINE_RE);
    if (modern) {
      const mode = parseModeToken(modern[1]);
      if (mode) return mode;
    }
  }
  return null;
}

/** ffmpeg sentinel, LRC `[re:NRM/…]` 태그, LRC 본문 순으로 UI 가사 모드 복원 */
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
  const filtered = lines.filter((line) => !isNrmLyricsModeHeaderLine(line));
  return filtered.join('\n').trim();
}

/** 외장 .lrc — 모드 플래그 줄만 제거하고 순수 싱크 가사 본문만 남긴다 */
export function preparePureSidecarLrcText(lrcText: string): string {
  return stripNrmLrcModeLine(lrcText);
}

/** 외장 .lrc 저장용 — 본문 + `[re:NRM/…]` 모드 태그(선택) */
export function prepareSidecarLrcTextForPersist(
  lrcText: string,
  mode: Exclude<NrmLyricsUiMode, 'unset'> | null | undefined,
): string {
  const body = preparePureSidecarLrcText(lrcText);
  if (!body) return '';
  return mode ? withNrmLyricsModeHeader(body, mode) : body;
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

function lyricsGenerationActionForMode(
  mode: Exclude<NrmLyricsUiMode, 'unset'>,
): LyricsSidecarAction {
  if (mode === 'melon') return { kind: 'generate-melon', mode: 'melon' };
  if (mode === 'melon_translation') {
    return { kind: 'generate-melon', mode: 'melon_translation' };
  }
  if (mode === 'configured') return { kind: 'generate', mode: 'configured' };
  return { kind: 'generate', mode: 'translation' };
}

export function resolveLyricsSidecarAction(

  initial: NrmLyricsUiMode,

  next: NrmLyricsUiMode,

  existingLrcUri?: string | null,

): LyricsSidecarAction {

  if (initial === next) {
    // UI 모드는 같지만 LRC가 아직 없으면(멜론 정렬 실패 등) 저장 시 생성을 허용
    if (next !== 'unset' && !existingLrcUri?.trim()) {
      return lyricsGenerationActionForMode(next);
    }
    return { kind: 'none' };
  }

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

/**
 * USLT/SYLT(mp3)·©lyr(m4a) 등에서 읽은 싱크 가사(LRC) 텍스트인지.
 * sentinel·plain 텍스트는 제외한다.
 */
export function isEmbeddedSyncLyricsText(raw: string | undefined): boolean {
  const text = (raw ?? '').trim();
  if (!text) return false;
  if (parseLyricsUiMode(text) !== 'unset') return false;
  return normalizeLrcLines(text).some((line) => !!splitLrcLine(line)?.text);
}

function pickLrcTextForModeDetection(
  sidecarLrcText: string,
  embeddedSyncLyrics: string,
): string {
  const sidecar = sidecarLrcText.trim();
  if (sidecar) return sidecar;
  return embeddedSyncLyrics.trim();
}

function isTranslationFromDuplicateTimestamps(lrcText: string): boolean {
  const body = lrcText.trim();
  if (!body) return false;
  return countDuplicateTimestampLyrics(body) >= DUPLICATE_TS_TRANSLATION_THRESHOLD;
}

/**
 * 트랙 메타데이터 설정 — 가사 드롭다운 기본값.
 *
 * - unset: 싱크 가사(.lrc·내장) 없음
 * - configured/translation: 싱크만, plain(TXXX·nrm_plain_lyrics) 없음
 * - melon/melon_translation: 싱크 + plain 내장
 * - 번역지원: 동일 타임스탬프 2줄 이상인 구간이 10개 이상
 */
export function resolveStoredLyricsModeFromFlags(input: {
  hasSidecarLrc?: boolean;
  sidecarLrcText?: string;
  embeddedSyncLyrics?: string;
  /** 멜론 곡 URL — 싱크 가사와 함께 있으면 멜론 패밀리로 복원 */
  melonTrackUrl?: string;
}): NrmLyricsUiMode {
  const sidecarText = (input.sidecarLrcText ?? '').trim();
  const hasSidecar = !!(input.hasSidecarLrc && sidecarText);
  const embeddedSync = isEmbeddedSyncLyricsText(input.embeddedSyncLyrics)
    ? (input.embeddedSyncLyrics ?? '').trim()
    : '';
  const hasEmbeddedSync = embeddedSync.length > 0;
  const hasSync = hasSidecar || hasEmbeddedSync;

  if (!hasSync) {
    return 'unset';
  }

  const lrcForDup = pickLrcTextForModeDetection(sidecarText, embeddedSync);
  const isTranslation = isTranslationFromDuplicateTimestamps(lrcForDup);

  const isMelon = isMelonTrackWebsite(input.melonTrackUrl);

  if (isMelon) {
    return isTranslation ? 'melon_translation' : 'melon';
  }

  return isTranslation ? 'translation' : 'configured';
}

export function isWhisperLyricsFamily(mode: NrmLyricsUiMode): mode is NrmWhisperLyricsMode {
  return mode === 'configured' || mode === 'translation';
}

export function lyricsUiModeToMetadataField(

  mode: NrmLyricsUiMode,

): string | undefined {

  if (mode === 'unset') return undefined;

  return buildLyricsSentinel(mode);

}


