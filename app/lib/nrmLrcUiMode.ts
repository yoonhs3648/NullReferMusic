import { splitLrcLine, normalizeLrcLines } from '@/lib/nrmDeepLLrcFormat';
import type { NrmWhisperLyricsMode, NrmWhisperLyricsUiMode } from '@/lib/nrmWhisperLyrics';
import { buildAutoWhisperLyricsSentinel } from '@/lib/nrmWhisperLyrics';

/** LRC 본문에서 UI 가사 모드 추정 (번역지원: `원문 (번역)` 패턴) */
export function detectLrcUiModeFromText(lrcText: string): NrmWhisperLyricsUiMode {
  const lines = normalizeLrcLines(lrcText);
  if (lines.length === 0) return 'unset';

  let lyricLines = 0;
  let withParenTranslation = 0;
  for (const line of lines) {
    const parsed = splitLrcLine(line);
    if (!parsed?.text) continue;
    lyricLines += 1;
    if (/\([^)]+\)\s*$/.test(parsed.text)) {
      withParenTranslation += 1;
    }
  }
  if (lyricLines === 0) return 'unset';
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
