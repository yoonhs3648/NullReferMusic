import { lyricsUiModeToEmbeddedToken } from '@/lib/nrmEmbeddedLyricsMode';
import type { NrmLyricsUiMode } from '@/lib/nrmMelonLyrics';
import { normalizePlainLyricsForEmbed } from '@/lib/nrmPlainLyricsEmbed';

/**
 * 멜론 plain 가사 원문을 mp3/m4a에 내장한다.
 * 다운로드는 ffmpeg 메타 패스에서 처리 — 트랙 편집·재저장 시에만 호출.
 */
export async function persistPlainLyricsEmbedIfNeeded(
  audioUri: string,
  extension: string,
  plain: string | null | undefined,
  lyricsMode?: Exclude<NrmLyricsUiMode, 'unset'> | null,
): Promise<boolean> {
  const normalized = normalizePlainLyricsForEmbed(plain);
  if (!normalized) return false;
  const ext = extension.toLowerCase();
  if (ext !== '.mp3' && ext !== '.m4a') return false;
  const modeToken = lyricsMode ? lyricsUiModeToEmbeddedToken(lyricsMode) : undefined;
  const { embedPlainLyricsIntoAudio } = await import('@/lib/nrmApplyAudioMetadata.native');
  await embedPlainLyricsIntoAudio(audioUri, ext, normalized, modeToken);
  return true;
}
