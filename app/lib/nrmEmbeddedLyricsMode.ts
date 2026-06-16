import type { NrmLyricsUiMode } from '@/lib/nrmMelonLyrics';
import { parseLyricsUiMode } from '@/lib/nrmMelonLyrics';

/** MP3 ID3 TXXX description / m4a `-metadata nrm_lyrics_mode` — 플레이어 비표시 */
export const NRM_EMBEDDED_LYRICS_MODE_KEY = 'nrm_lyrics_mode';

export const NRM_EMBEDDED_LYRICS_MODE_TXXX_DESC = 'NRM_LYRICS_MODE';

export function lyricsUiModeToEmbeddedToken(
  mode: Exclude<NrmLyricsUiMode, 'unset'>,
): string {
  return mode;
}

export function parseEmbeddedLyricsModeToken(
  raw: string | undefined | null,
): NrmLyricsUiMode | null {
  const token = (raw ?? '').trim();
  if (!token) return null;
  const mode = token.toLowerCase();
  if (
    mode === 'configured' ||
    mode === 'translation' ||
    mode === 'melon' ||
    mode === 'melon_translation'
  ) {
    return mode;
  }
  return parseLyricsUiMode(token) === 'unset' ? null : parseLyricsUiMode(token);
}
