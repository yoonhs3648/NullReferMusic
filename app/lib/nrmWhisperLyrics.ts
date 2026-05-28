/** Whisper large-v3 로컬 전사로 생성하는 자동 가사 (yt-dlp 자막 미사용) */
export const AUTO_WHISPER_LYRICS_PREFIX = '__AUTO_FROM_WHISPER__';

/** @deprecated 이전 자막 기반 sentinel — 호환용 */
export const LEGACY_AUTO_SUBTITLE_LYRICS_PREFIX = '__AUTO_FROM_SUBTITLE__';

export type NrmWhisperLyricsMode = 'configured' | 'translation';

export type NrmWhisperLyricsUiMode = NrmWhisperLyricsMode | 'unset';

export function isAutoWhisperLyricsValue(raw: string | undefined): boolean {
  const v = (raw ?? '').trim();
  return (
    v.startsWith(`${AUTO_WHISPER_LYRICS_PREFIX}:`) ||
    v.startsWith(`${LEGACY_AUTO_SUBTITLE_LYRICS_PREFIX}:`) ||
    v === LEGACY_AUTO_SUBTITLE_LYRICS_PREFIX
  );
}

/** UI·API용 모드 파싱 (레거시 ko/en/ko_translation → configured) */
export function parseWhisperLyricsMode(raw: string | undefined): NrmWhisperLyricsMode | null {
  const v = (raw ?? '').trim();
  if (!v) return null;
  let modePart = v;
  if (v.startsWith(`${AUTO_WHISPER_LYRICS_PREFIX}:`)) {
    modePart = v.slice(`${AUTO_WHISPER_LYRICS_PREFIX}:`.length);
  } else if (v.startsWith(`${LEGACY_AUTO_SUBTITLE_LYRICS_PREFIX}:`)) {
    modePart = v.slice(`${LEGACY_AUTO_SUBTITLE_LYRICS_PREFIX}:`.length);
  } else if (v === LEGACY_AUTO_SUBTITLE_LYRICS_PREFIX) {
    return 'configured';
  } else {
    return null;
  }
  if (modePart === 'configured' || modePart === 'translation') {
    return modePart;
  }
  if (modePart === 'ko' || modePart === 'en' || modePart === 'ko_translation') {
    return 'configured';
  }
  return null;
}

export function buildAutoWhisperLyricsSentinel(mode: NrmWhisperLyricsMode): string {
  return `${AUTO_WHISPER_LYRICS_PREFIX}:${mode}`;
}

export type WhisperSegment = {
  startMs: number;
  text: string;
};

const MAX_EMBED_LYRICS_CHARS = 100000;

export function segmentsToLrc(segments: WhisperSegment[]): string {
  const lines: string[] = [];
  for (const seg of segments) {
    const text = seg.text.trim();
    if (!text) continue;
    lines.push(`[${formatLrcTimestamp(seg.startMs)}]${text}`);
  }
  return lines.join('\n').trim();
}

export function formatLrcTimestamp(startMs: number): string {
  const totalCs = Math.max(0, Math.round(startMs / 10));
  const cs = totalCs % 100;
  const totalSec = Math.floor(totalCs / 100);
  const sec = totalSec % 60;
  const min = Math.floor(totalSec / 60) % 60;
  const hour = Math.floor(totalSec / 3600);
  const mm = String(min + hour * 60).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  const cc = String(cs).padStart(2, '0');
  return `${mm}:${ss}.${cc}`;
}

export function truncateLyricsForId3Embed(lrc: string): { embed: string; truncated: boolean } {
  const trimmed = lrc.trim();
  if (trimmed.length <= MAX_EMBED_LYRICS_CHARS) {
    return { embed: trimmed, truncated: false };
  }
  const slice = trimmed.slice(0, MAX_EMBED_LYRICS_CHARS);
  const lastNewline = slice.lastIndexOf('\n');
  const safeCut = lastNewline > MAX_EMBED_LYRICS_CHARS * 0.6 ? lastNewline : slice.length;
  return { embed: slice.slice(0, Math.max(1, safeCut)).trim(), truncated: true };
}
