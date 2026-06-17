import {
  buildMelonSeedAudioMetadata,
  normalizeMelonReleaseDate,
  type MelonDownloadSeed,
} from '@/lib/nrmMelonDownloadMetadata';
import {
  normalizeDownloadMetadata,
  type NrmAudioFileMetadata,
} from '@/lib/nrmDownloadAudioMetadata';
import { fetchMelonAlbumDetail, fetchMelonTrackDetail } from '@/lib/nrmMelonSearchClient';
import { normalizeCoverArtUrl } from '@/lib/nrmCoverArtUrl';

function mergeMeta(
  base: NrmAudioFileMetadata,
  patch: Partial<NrmAudioFileMetadata>,
): NrmAudioFileMetadata {
  const out: NrmAudioFileMetadata = { ...base };
  for (const key of Object.keys(patch) as (keyof NrmAudioFileMetadata)[]) {
    const v = patch[key];
    if (v === undefined || v === null) continue;
    if (key === 'melonAlignLang') {
      if (v === 'ko' || v === 'en') out.melonAlignLang = v;
      continue;
    }
    const val = String(v).trim();
    if (val) (out as Record<string, string>)[key] = val;
  }
  return out;
}

function buildMelonCopyright(label: string, agency: string): string {
  const parts: string[] = [];
  const pub = label.trim();
  const plan = agency.trim();
  if (pub) parts.push(`발매사 ${pub}`);
  if (plan && plan !== pub) parts.push(`기획사 ${plan}`);
  return parts.join(' · ');
}

/**
 * Melon → YouTube 다운로드 직전 메타 보강.
 * songId가 있으면 곡·앨범 상세를 조회해 누락 필드를 채운다.
 */
export async function enrichMelonDownloadMetadata(
  seed: MelonDownloadSeed,
  userArtist: string,
  userTitle: string,
): Promise<NrmAudioFileMetadata> {
  const base = buildMelonSeedAudioMetadata(seed, userArtist, userTitle);
  const songId = (seed.songId ?? '').trim();
  if (!songId) {
    const raw = (base.genre || seed.genre || '').trim();
    return normalizeDownloadMetadata({
      ...base,
      platformGenreRaw: raw || undefined,
    });
  }

  const trackR = await fetchMelonTrackDetail(songId, { enrich: false });
  if (!trackR.ok) {
    return base;
  }

  const { info } = trackR.data;
  let meta = mergeMeta(base, {
    album: info.album,
    genre: info.genre,
    releaseDate: normalizeMelonReleaseDate(info.releaseDate),
    coverUrl: normalizeCoverArtUrl(info.imageUrl),
    website: info.url,
    composer: info.credits.composers,
    remixer: info.credits.arrangers,
    lyrics: info.lyrics,
  });

  const albumId = (info.albumId ?? '').trim();
  const embeddedAlbum = trackR.data.albumDetail?.info;
  if (embeddedAlbum && embeddedAlbum.albumId === albumId) {
    const track = trackR.data.albumDetail?.info.tracks.find((t) => t.songId === songId);
    meta = mergeMeta(meta, {
      album: embeddedAlbum.name || meta.album,
      albumArtist: embeddedAlbum.artist,
      genre: embeddedAlbum.genre || meta.genre,
      releaseDate: normalizeMelonReleaseDate(embeddedAlbum.releaseDate) || meta.releaseDate,
      coverUrl: normalizeCoverArtUrl(embeddedAlbum.imageUrl) || meta.coverUrl,
      trackNumber: track ? String(track.rank) : undefined,
      copyright: buildMelonCopyright(embeddedAlbum.label, embeddedAlbum.agency),
    });
  } else if (albumId) {
    const albumR = await fetchMelonAlbumDetail(albumId, { enrich: false });
    if (albumR.ok) {
      const al = albumR.data.info;
      const track = al.tracks.find((t) => t.songId === songId);
      meta = mergeMeta(meta, {
        album: al.name || meta.album,
        albumArtist: al.artist,
        genre: al.genre || meta.genre,
        releaseDate: normalizeMelonReleaseDate(al.releaseDate) || meta.releaseDate,
        coverUrl: normalizeCoverArtUrl(al.imageUrl) || meta.coverUrl,
        trackNumber: track ? String(track.rank) : undefined,
        copyright: buildMelonCopyright(al.label, al.agency),
      });
    }
  }

  const platformGenreRaw = (meta.genre || seed.genre || '').trim();
  return normalizeDownloadMetadata({
    ...meta,
    platformGenreRaw: platformGenreRaw || undefined,
  });
}
