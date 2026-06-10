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
  | { kind: 'generate'; mode: NrmWhisperLyricsMode };

/** 저장 시 LRC 사이드카 처리 (Whisper 재생성 여부) */
export function resolveLyricsSidecarAction(
  initial: NrmWhisperLyricsUiMode,
  next: NrmWhisperLyricsUiMode,
): LyricsSidecarAction {
  if (initial === next) return { kind: 'none' };
  if (next === 'unset') return { kind: 'delete' };
  if (next === 'configured') {
    return { kind: 'generate', mode: 'configured' };
  }
  return { kind: 'generate', mode: 'translation' };
}

export function lyricsUiModeToMetadataField(
  mode: NrmWhisperLyricsUiMode,
): string | undefined {
  if (mode === 'unset') return undefined;
  return buildAutoWhisperLyricsSentinel(mode);
}
