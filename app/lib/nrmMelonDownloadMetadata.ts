import type { NrmAudioFileMetadata } from '@/lib/nrmDownloadAudioMetadata';
import { normalizeCoverArtUrl } from '@/lib/nrmCoverArtUrl';
import type {
  MelonAlbumDetail,
  MelonArtistDetail,
  MelonTrackDetail,
} from '@/lib/nrmMelonSearchTypes';

/** Melon → YouTube 다운로드 시드 (검색·상세에서 전달) */
export type MelonDownloadSeed = {
  songId?: string;
  artist: string;
  title: string;
  album?: string;
  genre?: string;
  releaseDate?: string;
  imageUrl?: string;
};

/** Melon 발매일 `2018.04.04` → ID3용 `2018-04-04` */
export function normalizeMelonReleaseDate(raw: string): string {
  const t = raw.trim();
  const dotted = t.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/);
  if (dotted) {
    const [, y, m, d] = dotted;
    return `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
  }
  return t;
}

function buildMelonCopyright(label: string, agency: string): string {
  const parts: string[] = [];
  const pub = label.trim();
  const plan = agency.trim();
  if (pub) parts.push(`발매사 ${pub}`);
  if (plan && plan !== pub) parts.push(`기획사 ${plan}`);
  return parts.join(' · ');
}

function trackDetailToEmbedFields(
  detail: MelonTrackDetail,
  albumDetail: MelonAlbumDetail | null | undefined,
): Partial<NrmAudioFileMetadata> {
  const info = detail.info;
  const al = albumDetail?.info;
  const track = al?.tracks.find((t) => t.songId === info.songId);
  const out: Partial<NrmAudioFileMetadata> = {
    album: (info.album ?? al?.name ?? '').trim(),
    genre: (info.genre ?? al?.genre ?? '').trim(),
    releaseDate: normalizeMelonReleaseDate(info.releaseDate || al?.releaseDate || ''),
    coverUrl: normalizeCoverArtUrl(info.imageUrl || al?.imageUrl || ''),
    website: (info.url ?? '').trim(),
    composer: (info.credits.composers ?? '').trim(),
    remixer: (info.credits.arrangers ?? '').trim(),
    lyrics: (info.lyrics ?? '').trim(),
  };
  if (al) {
    out.albumArtist = (al.artist ?? '').trim();
    out.copyright = buildMelonCopyright(al.label, al.agency);
    if (track) out.trackNumber = String(track.rank);
  }
  return out;
}

export function buildMelonSeedAudioMetadata(
  seed: MelonDownloadSeed,
  userArtist: string,
  userTitle: string,
): NrmAudioFileMetadata {
  return {
    artist: userArtist.trim(),
    title: userTitle.trim(),
    album: (seed.album ?? '').trim(),
    genre: (seed.genre ?? '').trim(),
    releaseDate: normalizeMelonReleaseDate(seed.releaseDate ?? ''),
    coverUrl: normalizeCoverArtUrl(seed.imageUrl ?? ''),
    website: seed.songId
      ? `https://www.melon.com/song/detail.htm?songId=${seed.songId.trim()}`
      : '',
    downloadPlatform: 'Melon',
  };
}

export function buildMelonTrackAudioMetadata(
  detail: MelonTrackDetail,
  userArtist: string,
  userTitle: string,
): NrmAudioFileMetadata {
  const optional = trackDetailToEmbedFields(detail, detail.albumDetail);
  return {
    artist: userArtist.trim(),
    title: userTitle.trim(),
    album: optional.album ?? '',
    genre: optional.genre ?? '',
    releaseDate: optional.releaseDate ?? '',
    coverUrl: optional.coverUrl ?? '',
    albumArtist: optional.albumArtist,
    trackNumber: optional.trackNumber,
    composer: optional.composer,
    remixer: optional.remixer,
    lyrics: optional.lyrics,
    copyright: optional.copyright,
    website: optional.website,
  };
}

export function buildMelonAlbumAudioMetadata(
  detail: MelonAlbumDetail,
  userArtist: string,
  userTitle: string,
): NrmAudioFileMetadata {
  const info = detail.info;
  return {
    artist: userArtist.trim(),
    title: userTitle.trim(),
    album: (info.name ?? '').trim(),
    genre: (info.genre ?? '').trim(),
    releaseDate: normalizeMelonReleaseDate(info.releaseDate ?? ''),
    coverUrl: (info.imageUrl ?? '').trim(),
    albumArtist: (info.artist ?? '').trim(),
    copyright: buildMelonCopyright(info.label, info.agency),
    website: (info.url ?? '').trim(),
  };
}

export function buildMelonArtistAudioMetadata(
  detail: MelonArtistDetail,
  userArtist: string,
  userTitle: string,
): NrmAudioFileMetadata {
  const info = detail.info;
  return {
    artist: userArtist.trim(),
    title: userTitle.trim(),
    album: '',
    genre: (info.genre ?? '').trim(),
    releaseDate: normalizeMelonReleaseDate(info.debutDate ?? ''),
    coverUrl: (info.imageUrl ?? '').trim(),
    website: (info.url ?? '').trim(),
  };
}

/** YouTube·다운로드 모달용 ChartTrackItem 호환 필드 */
export function melonFieldsToChartTrack(fields: {
  artist: string;
  title: string;
  songId?: string;
  album?: string;
  genre?: string;
  releaseDate?: string;
  imageUrl?: string;
}): import('@/lib/nrmChartsTypes').ChartTrackItem {
  const songId = (fields.songId ?? '').trim();
  return {
    rank: 0,
    trackId: songId,
    title: fields.title,
    artists: fields.artist,
    album: fields.album ?? '',
    genre: fields.genre,
    imageUrl: normalizeCoverArtUrl(fields.imageUrl),
    externalUrl: songId ? `https://www.melon.com/song/detail.htm?songId=${songId}` : '',
    durationMs: 0,
    popularity: 0,
    releaseDate: normalizeMelonReleaseDate(fields.releaseDate ?? ''),
  };
}
