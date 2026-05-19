/**
 * YouTube URL·짧은 ID에서 11자 video id 추출.
 */
export function parseYoutubeVideoId(input: string): string | null {
  const t = input.trim();
  if (!t) return null;
  const m1 = /[?&]v=([a-zA-Z0-9_-]{11})(?:[^a-zA-Z0-9_-]|$)/.exec(t);
  if (m1) return m1[1];
  const m2 = /youtu\.be\/([a-zA-Z0-9_-]{11})(?:[^a-zA-Z0-9_-]|$)/.exec(t);
  if (m2) return m2[1];
  const m3 = /\/shorts\/([a-zA-Z0-9_-]{11})(?:[^a-zA-Z0-9_-]|$)/.exec(t);
  if (m3) return m3[1];
  if (/^[a-zA-Z0-9_-]{11}$/.test(t)) return t;
  return null;
}
