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
import { resolveEmbedGenre } from '@/lib/nrmGenreResolve';

function mergeMeta(
  base: NrmAudioFileMetadata,
  patch: Partial<NrmAudioFileMetadata>,
): NrmAudioFileMetadata {
  const out: NrmAudioFileMetadata = { ...base };
  for (const [k, v] of Object.entries(patch) as [keyof NrmAudioFileMetadata, string | undefined][]) {
    const val = (v ?? '').trim();
    if (val) out[k] = val;
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
    const genre = await resolveEmbedGenre({ rawGenre: seed.genre ?? base.genre });
    return normalizeDownloadMetadata({ ...base, genre: genre || base.genre });
  }

  const trackR = await fetchMelonTrackDetail(songId);
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
  if (albumId) {
    const albumR = await fetchMelonAlbumDetail(albumId);
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

  const genre = await resolveEmbedGenre({ rawGenre: meta.genre });
  return normalizeDownloadMetadata({ ...meta, genre: genre || meta.genre });
}
