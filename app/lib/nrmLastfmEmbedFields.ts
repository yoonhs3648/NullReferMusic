/**
 * Last.fm track / artist / album API에서 실제로 내려오는 필드만 ffmpeg 태그로 매핑.
 * (없으면 임베드하지 않음)
 */
export type LastfmRawEmbedFields = {
  album?: string;
  albumArtist?: string;
  genre?: string;
  releaseDate?: string;
  trackNumber?: string;
  coverUrl?: string;
  website?: string;
};

/** API 원시 필드 → NrmAudioFileMetadata 확장 필드 (빈 값 제외) */
export function lastfmRawToOptionalEmbed(
  raw: LastfmRawEmbedFields,
): Partial<
  Pick<
    import('@/lib/nrmDownloadAudioMetadata').NrmAudioFileMetadata,
    | 'album'
    | 'albumArtist'
    | 'genre'
    | 'releaseDate'
    | 'trackNumber'
    | 'coverUrl'
    | 'website'
  >
> {
  const out: Record<string, string> = {};
  const put = (key: string, val: string | undefined) => {
    const t = (val ?? '').trim();
    if (t) out[key] = t;
  };
  put('album', raw.album);
  put('albumArtist', raw.albumArtist);
  put('genre', raw.genre);
  put('releaseDate', raw.releaseDate);
  put('trackNumber', raw.trackNumber);
  put('coverUrl', raw.coverUrl);
  put('website', raw.website);
  return out as Partial<
    Pick<
      import('@/lib/nrmDownloadAudioMetadata').NrmAudioFileMetadata,
      | 'album'
      | 'albumArtist'
      | 'genre'
      | 'releaseDate'
      | 'trackNumber'
      | 'coverUrl'
      | 'website'
    >
  >;
}

export function joinLastfmTagNames(
  tags: { name: string }[],
  max = 5,
): string {
  return tags
    .map((t) => t.name.trim())
    .filter(Boolean)
    .slice(0, max)
    .join(', ');
}

/** Last.fm releasedate / wiki published → yyyy 또는 yyyy-mm-dd */
export function normalizeLastfmReleaseDate(raw: string | undefined): string {
  const s = (raw ?? '').trim();
  if (!s) return '';
  const m = s.match(/(\d{4})/);
  return m ? m[1] : '';
}
