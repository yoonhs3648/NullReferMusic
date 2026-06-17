/**
 * 내장 가사(mp3/m4a) — 멜론 등에서 가져온 **가사 원문(plain)** 전용 메타 키.
 * 이 상수·함수로 쓰는 필드에는 plain 가사 외 데이터를 넣지 않는다.
 */

/** MP3 ID3 TXXX description — plain 가사 원문 전용 */
export const NRM_PLAIN_LYRICS_TXXX_DESC = 'NRM_PLAIN_LYRICS';

/** M4A ffmpeg 커스텀 메타 키 — plain 가사 원문 전용 */
export const NRM_PLAIN_LYRICS_M4A_META_KEY = 'nrm_plain_lyrics';

export function normalizePlainLyricsForEmbed(raw: string | undefined | null): string | null {
  const t = (raw ?? '').trim();
  return t || null;
}
