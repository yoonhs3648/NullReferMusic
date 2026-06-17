import { normalizePlainLyricsForEmbed } from '@/lib/nrmPlainLyricsEmbed';

/**
 * 멜론 plain 가사 원문을 mp3/m4a에 내장한다.
 * LRC 임베드 성공 여부·사이드카 모드와 무관하게 호출 가능.
 */
export async function persistPlainLyricsEmbedIfNeeded(
  audioUri: string,
  extension: string,
  plain: string | null | undefined,
): Promise<boolean> {
  const normalized = normalizePlainLyricsForEmbed(plain);
  if (!normalized) return false;
  const ext = extension.toLowerCase();
  if (ext !== '.mp3' && ext !== '.m4a') return false;
  const { embedPlainLyricsIntoAudio } = await import('@/lib/nrmApplyAudioMetadata.native');
  await embedPlainLyricsIntoAudio(audioUri, ext, normalized);
  return true;
}
