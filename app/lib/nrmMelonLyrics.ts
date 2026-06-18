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

/** 트랙 편집·저장·다운로드 — website로 멜론 원문 가사 재조회 (파일 메타에는 저장하지 않음) */
export async function resolveMelonPlainLyricsForEdit(
  website: string | undefined,
): Promise<string> {
  return fetchMelonPlainLyricsFromWebsite(website);
}

/** 멜론 곡 상세 URL (website 태그 정규화용) */
export function buildMelonTrackWebsite(songId: string): string {
  const id = songId.trim();
  return id ? `https://www.melon.com/song/detail.htm?songId=${id}` : '';
}

/** 저장된 website·URL에서 멜론 songId 추출 */
export function extractMelonSongIdFromUrl(url: string | undefined): string | null {
  const u = (url ?? '').trim();
  if (!u) return null;
  const query = u.match(/[?&]songId=(\d+)/i);
  if (query?.[1]) return query[1];
  const path = u.match(/\/song\/[^/?#]*?(\d{5,})/i);
  return path?.[1] ?? null;
}

/** songId가 있으면 표준 멜론 곡 URL로 정규화 */
export function normalizeMelonTrackWebsite(url: string | undefined): string {
  const songId = extractMelonSongIdFromUrl(url);
  return songId ? buildMelonTrackWebsite(songId) : (url ?? '').trim();
}

/** 트랙 메타 website가 멜론 곡인지 (melon.com + songId) */
export function isMelonTrackWebsite(website: string | undefined): boolean {
  const u = (website ?? '').trim();
  if (!u || !extractMelonSongIdFromUrl(u)) return false;
  try {
    const host = new URL(u).hostname.toLowerCase();
    return host === 'melon.com' || host.endsWith('.melon.com');
  } catch {
    return /melon\.com/i.test(u);
  }
}

/**
 * 멜론 URL 여부에 따라 Whisper↔멜론 가사 패밀리를 정규화.
 * LRC 본문·sentinel은 configured/translation만 담고, 멜론 여부는 website로 구분한다.
 */
export function applyWebsiteLyricsFamily(
  mode: NrmLyricsUiMode,
  website: string | undefined,
): NrmLyricsUiMode {
  if (mode === 'unset') return 'unset';
  if (!isMelonTrackWebsite(website)) return mode;
  if (mode === 'configured') return 'melon';
  if (mode === 'translation') return 'melon_translation';
  return mode;
}

/**
 * 구 트랙 호환: Whisper 패밀리 모드를 멜론 website면 멜론 패밀리로 승격.
 */
export function inferMelonLyricsUiModeFromContext(
  detected: NrmLyricsUiMode,
  website: string | undefined,
): NrmLyricsUiMode {
  return applyWebsiteLyricsFamily(detected, website);
}

/** 트랙 편집 — 메타 website로 멜론 원문 가사 재조회 */
export async function fetchMelonPlainLyricsFromWebsite(
  website: string | undefined,
): Promise<string> {
  const songId = extractMelonSongIdFromUrl(website);
  if (!songId) return '';
  try {
    const { fetchMelonTrackDetail } = await import('@/lib/nrmMelonSearchClient');
    const r = await fetchMelonTrackDetail(songId, { enrich: false });
    if (!r.ok) return '';
    const plain = (r.data.info.lyrics ?? '').trim();
    return isMelonPlainLyricsText(plain) ? plain : '';
  } catch {
    return '';
  }
}
