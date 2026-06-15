import { splitLrcLine, normalizeLrcLines } from '@/lib/nrmDeepLLrcFormat';
import type { NrmWhisperLyricsMode, NrmWhisperLyricsUiMode } from '@/lib/nrmWhisperLyrics';
import { buildAutoWhisperLyricsSentinel } from '@/lib/nrmWhisperLyrics';

/** 동일 타임스탬프에 가사 2줄 이상인 횟수가 이 값 이상이면 번역지원으로 판단 */
export const DUPLICATE_TS_TRANSLATION_THRESHOLD = 10;

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
export function detectLrcUiModeFromText(lrcText: string): NrmWhisperLyricsUiMode {
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
  /** 기존 LRC를 Whisper 재실행 없이 DeepL로 번역 (configured → translation) */
  | { kind: 'translate-lrc' }
  /** 기존 LRC에서 한글 번역 줄만 제거 (translation → configured) — Whisper 재실행 불필요 */
  | { kind: 'strip-translation' };

/**
 * 저장 시 LRC 처리 방식 결정 (Whisper 재생성 여부).
 *
 * `existingLrcUri`: 현재 트랙에 이미 사이드카 LRC가 있으면 전달.
 * configured → translation 전환 시 Whisper 재실행 없이 기존 LRC를 번역만 한다.
 */
export function resolveLyricsSidecarAction(
  initial: NrmWhisperLyricsUiMode,
  next: NrmWhisperLyricsUiMode,
  existingLrcUri?: string | null,
): LyricsSidecarAction {
  if (initial === next) return { kind: 'none' };
  if (next === 'unset') return { kind: 'delete' };
  if (next === 'configured') {
    // 기존 LRC가 있으면 한글 번역 줄만 제거 — Whisper 재실행 불필요
    if (existingLrcUri) {
      return { kind: 'strip-translation' };
    }
    return { kind: 'generate', mode: 'configured' };
  }
  // configured → translation: 기존 LRC가 있으면 재전사 없이 번역만 수행
  if (initial === 'configured' && existingLrcUri) {
    return { kind: 'translate-lrc' };
  }
  return { kind: 'generate', mode: 'translation' };
}

export function lyricsUiModeToMetadataField(
  mode: NrmWhisperLyricsUiMode,
): string | undefined {
  if (mode === 'unset') return undefined;
  return buildAutoWhisperLyricsSentinel(mode);
}
