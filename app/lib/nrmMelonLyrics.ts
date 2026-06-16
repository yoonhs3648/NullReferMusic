import {
  isAutoWhisperLyricsValue,
  parseWhisperLyricsMode,
  buildAutoWhisperLyricsSentinel,
  type NrmWhisperLyricsMode,
} from '@/lib/nrmWhisperLyrics';
import { isLrcMetadataTagLine, isNrmLyricsModeHeaderLine } from '@/lib/nrmLrcUiMode';

/** 멜론 원문 가사 + WhisperX 정렬 모드 */
export type NrmMelonLyricsMode = 'melon' | 'melon_translation';

export type NrmMelonLyricsUiMode = NrmMelonLyricsMode;

/** UI 전체 가사 모드 (Whisper 전사 + 멜론 정렬) */
export type NrmLyricsUiMode = NrmWhisperLyricsMode | NrmMelonLyricsUiMode | 'unset';

export const AUTO_MELON_LYRICS_PREFIX = '__AUTO_FROM_MELON__';

export function isAutoMelonLyricsValue(raw: string | undefined): boolean {
  const v = (raw ?? '').trim();
  return v.startsWith(`${AUTO_MELON_LYRICS_PREFIX}:`);
}

export function parseMelonLyricsMode(raw: string | undefined): NrmMelonLyricsMode | null {
  const v = (raw ?? '').trim();
  if (!v.startsWith(`${AUTO_MELON_LYRICS_PREFIX}:`)) return null;
  const modePart = v.slice(`${AUTO_MELON_LYRICS_PREFIX}:`.length);
  if (modePart === 'melon' || modePart === 'melon_translation') {
    return modePart;
  }
  return null;
}

export function buildAutoMelonLyricsSentinel(mode: NrmMelonLyricsMode): string {
  return `${AUTO_MELON_LYRICS_PREFIX}:${mode}`;
}

/** LRC 타임스탬프·sentinel이 아닌 멜론 plain 가사 텍스트인지 */
export function isMelonPlainLyricsText(raw: string | undefined): boolean {
  const v = (raw ?? '').trim();
  if (!v) return false;
  if (isAutoMelonLyricsValue(v)) return false;
  if (isAutoWhisperLyricsValue(v)) return false;
  if (/^\[\d{1,2}:\d{2}(?:[.,]\d{1,3})?\]/.test(v)) return false;
  const lines = v.split(/\r?\n/).filter((l) => l.trim().length > 0);
  return lines.length >= 2;
}

export function parseLyricsUiMode(raw: string | undefined): NrmLyricsUiMode {
  const melon = parseMelonLyricsMode(raw);
  if (melon) return melon;
  return parseWhisperLyricsMode(raw) ?? 'unset';
}

export function buildLyricsSentinel(mode: Exclude<NrmLyricsUiMode, 'unset'>): string {
  if (mode === 'melon' || mode === 'melon_translation') {
    return buildAutoMelonLyricsSentinel(mode);
  }
  return buildAutoWhisperLyricsSentinel(mode);
}

export function isMelonLyricsUiMode(mode: NrmLyricsUiMode): mode is NrmMelonLyricsUiMode {
  return mode === 'melon' || mode === 'melon_translation';
}

/** LRC 본문에서 타임스탬프·모드·메타데이터 태그를 제거한 plain 가사 추출 (트랙 편집 복원용) */
export function extractPlainLyricsFromLrcText(lrcText: string): string {
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const rawLine of lrcText.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (
      !trimmed ||
      isNrmLyricsModeHeaderLine(trimmed) ||
      isLrcMetadataTagLine(trimmed)
    ) {
      continue;
    }
    const m = trimmed.match(/^\[[^\]]+\](.*)$/);
    if (!m) continue;
    const text = m[1].trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(text);
  }
  const plain = lines.join('\n').trim();
  return lines.length >= 2 ? plain : '';
}

/** 저장된 website(멜론 곡 URL)에서 songId 추출 */
export function extractMelonSongIdFromUrl(url: string | undefined): string | null {
  const u = (url ?? '').trim();
  if (!u) return null;
  const m = u.match(/[?&]songId=(\d+)/i);
  return m?.[1] ?? null;
}

/**
 * LRC 모드 태그가 없는 구 트랙: 멜론 URL + plain 가사가 있으면 Whisper 모드를 멜론 모드로 승격.
 * (차트·멜론 다운로드 후 LRC만 남은 경우 UI 복원용)
 */
export function inferMelonLyricsUiModeFromContext(
  detected: NrmLyricsUiMode,
  melonPlain: string,
  website: string | undefined,
): NrmLyricsUiMode {
  if (!melonPlain.trim() || !extractMelonSongIdFromUrl(website)) return detected;
  if (detected === 'translation') return 'melon_translation';
  if (detected === 'configured') return 'melon';
  return detected;
}

/** 트랙 편집 — 메타 website로 멜론 원문 가사 재조회 */
export async function fetchMelonPlainLyricsFromWebsite(
  website: string | undefined,
): Promise<string> {
  const songId = extractMelonSongIdFromUrl(website);
  if (!songId) return '';
  try {
    const { fetchMelonTrackDetail } = await import('@/lib/nrmMelonSearchClient');
    const r = await fetchMelonTrackDetail(songId);
    if (!r.ok) return '';
    const plain = (r.data.info.lyrics ?? '').trim();
    return isMelonPlainLyricsText(plain) ? plain : '';
  } catch {
    return '';
  }
}
