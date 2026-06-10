/** ffmpeg attached_pic / 커버 스트림에서 잘못 읽히는 제목 */
const BOGUS_TITLES = new Set([
  'album cover',
  'cover (front)',
  'cover',
  'front cover',
  'album art',
]);

export function isBogusEmbeddedAudioTitle(value: string | undefined | null): boolean {
  const t = (value ?? '').trim().toLowerCase();
  if (!t) return true;
  return BOGUS_TITLES.has(t);
}

export function parseArtistTitleFromDisplayLabel(label: string): {
  artist: string;
  title: string;
} {
  const text = label.trim();
  if (!text) return { artist: '', title: '' };
  const sep = text.indexOf(' - ');
  if (sep < 0) return { artist: '', title: text };
  return {
    artist: text.slice(0, sep).trim(),
    title: text.slice(sep + 3).trim(),
  };
}

/** 파일 메타·커버 스트림 오염 시 표시용 폴백 */
export function resolveEditableArtistTitle(
  metaArtist: string,
  metaTitle: string,
  displayLabel: string,
): { artist: string; title: string } {
  const fromLabel = parseArtistTitleFromDisplayLabel(displayLabel);
  const artist = metaArtist.trim();
  const title = metaTitle.trim();
  return {
    artist: artist && !isBogusEmbeddedAudioTitle(artist) ? artist : fromLabel.artist,
    title: !isBogusEmbeddedAudioTitle(title) ? title : fromLabel.title || fromLabel.artist,
  };
}
