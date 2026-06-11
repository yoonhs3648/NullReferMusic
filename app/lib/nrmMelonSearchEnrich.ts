import { needsMelonCoverFallback, normalizeCoverArtUrl } from '@/lib/nrmCoverArtUrl';
import {
  fallbackMelonAlbumCover,
  fallbackMelonArtistCover,
  fallbackMelonTrackCover,
} from '@/lib/nrmMelonCoverFallback';
import type {
  MelonAlbumDetail,
  MelonAlbumSearchHit,
  MelonArtistDetail,
  MelonArtistSearchHit,
  MelonTrackDetail,
  MelonTrackSearchHit,
  MelonTrackSummary,
} from '@/lib/nrmMelonSearchTypes';
import {
  melonAlbumDetailUrl,
  MELON_ARTIST_POPULAR_TRACK_LIMIT,
  parseMelonAlbumCoverFromDetailHtml,
  parseMelonArtistCoverFromDetailHtml,
  parseMelonSongCoverFromDetailHtml,
} from '@/lib/nrmMelonSearchParse';

const MELON_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const albumCoverCache = new Map<string, string>();
const albumCoverInflight = new Map<string, Promise<string>>();

async function fetchMelonHtml(url: string, referer: string): Promise<string | null> {
  try {
    const { nrmDirectFetch } = await import('@/lib/nrmLoggedFetch');
    const res = await nrmDirectFetch(
      url,
      {
        headers: {
          'User-Agent': MELON_UA,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'ko-KR,ko;q=0.9',
          Referer: referer,
        },
      },
      'melon-cover',
    );
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function fetchMelonAlbumCoverById(albumId: string): Promise<string> {
  const id = albumId.trim();
  if (!id) return '';
  const cached = albumCoverCache.get(id);
  if (cached !== undefined) return cached;
  const inflight = albumCoverInflight.get(id);
  if (inflight) return inflight;

  const task = (async () => {
    const url = melonAlbumDetailUrl(id);
    const html = await fetchMelonHtml(url, url);
    const cover = html ? parseMelonAlbumCoverFromDetailHtml(html) : '';
    albumCoverCache.set(id, cover);
    albumCoverInflight.delete(id);
    return cover;
  })();
  albumCoverInflight.set(id, task);
  return task;
}

async function resolveCover(
  current: string,
  melonFetch: () => Promise<string>,
  lastfmFetch: () => Promise<string>,
): Promise<string> {
  if (!needsMelonCoverFallback(current)) {
    return normalizeCoverArtUrl(current);
  }
  const fromMelon = await melonFetch();
  if (!needsMelonCoverFallback(fromMelon)) {
    return normalizeCoverArtUrl(fromMelon);
  }
  const fromLastfm = await lastfmFetch();
  return normalizeCoverArtUrl(fromLastfm || fromMelon || current);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const i = index++;
      out[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return out;
}

async function prefetchMelonAlbumCovers(albumIds: string[], limit = 12): Promise<void> {
  const unique = [...new Set(albumIds.map((id) => id.trim()).filter(Boolean))].slice(0, limit);
  if (unique.length === 0) return;
  await mapWithConcurrency(unique, 3, (id) => fetchMelonAlbumCoverById(id));
}

async function enrichMelonTrackSummaries(
  tracks: MelonTrackSummary[],
  limit = 12,
): Promise<MelonTrackSummary[]> {
  if (tracks.length === 0) return tracks;
  const slice = tracks.slice(0, limit);
  await prefetchMelonAlbumCovers(
    slice.map((t) => t.albumId),
    limit,
  );
  return mapWithConcurrency(slice, 4, async (t) => {
    const imageUrl = await resolveCover(
      t.imageUrl,
      () => (t.albumId ? fetchMelonAlbumCoverById(t.albumId) : Promise.resolve('')),
      () => fallbackMelonTrackCover(t.artist, t.name, t.album),
    );
    return imageUrl === t.imageUrl ? t : { ...t, imageUrl };
  }).then((enriched) => [...enriched, ...tracks.slice(limit)]);
}

export async function enrichMelonArtistSearchHits(
  hits: MelonArtistSearchHit[],
): Promise<MelonArtistSearchHit[]> {
  return mapWithConcurrency(hits, 4, async (hit) => {
    const imageUrl = await resolveCover(
      hit.imageUrl,
      async () => {
        const html = await fetchMelonHtml(hit.url, hit.url);
        return html ? parseMelonArtistCoverFromDetailHtml(html) : '';
      },
      () => fallbackMelonArtistCover(hit.name),
    );
    return imageUrl === hit.imageUrl ? hit : { ...hit, imageUrl };
  });
}

export async function enrichMelonAlbumSearchHits(
  hits: MelonAlbumSearchHit[],
): Promise<MelonAlbumSearchHit[]> {
  return mapWithConcurrency(hits, 4, async (hit) => {
    const imageUrl = await resolveCover(
      hit.imageUrl,
      () => fetchMelonAlbumCoverById(hit.albumId),
      () => fallbackMelonAlbumCover(hit.artist, hit.name),
    );
    return imageUrl === hit.imageUrl ? hit : { ...hit, imageUrl };
  });
}

export async function enrichMelonTrackSearchHits(
  hits: MelonTrackSearchHit[],
): Promise<MelonTrackSearchHit[]> {
  if (hits.length === 0) return hits;
  await prefetchMelonAlbumCovers(
    hits.map((h) => h.albumId),
    20,
  );
  return mapWithConcurrency(hits, 5, async (hit) => {
    const imageUrl = await resolveCover(
      hit.imageUrl,
      () => (hit.albumId ? fetchMelonAlbumCoverById(hit.albumId) : Promise.resolve('')),
      () => fallbackMelonTrackCover(hit.artist, hit.name, hit.album),
    );
    return imageUrl === hit.imageUrl ? hit : { ...hit, imageUrl };
  });
}

export async function enrichMelonArtistDetail(detail: MelonArtistDetail): Promise<MelonArtistDetail> {
  const info = detail.info;
  const imageUrl = await resolveCover(
    info.imageUrl,
    async () => {
      const html = await fetchMelonHtml(info.url, info.url);
      return html ? parseMelonArtistCoverFromDetailHtml(html) : '';
    },
    () => fallbackMelonArtistCover(info.name),
  );
  const [popularTracks, popularAlbums] = await Promise.all([
    enrichMelonTrackSummaries(detail.popularTracks ?? [], MELON_ARTIST_POPULAR_TRACK_LIMIT),
    enrichMelonAlbumSearchHits(detail.popularAlbums ?? []),
  ]);
  const nextInfo = imageUrl === info.imageUrl ? info : { ...info, imageUrl };
  if (
    nextInfo === info &&
    popularTracks === detail.popularTracks &&
    popularAlbums === detail.popularAlbums
  ) {
    return detail;
  }
  return { info: nextInfo, popularTracks, popularAlbums };
}

export async function enrichMelonAlbumDetail(detail: MelonAlbumDetail): Promise<MelonAlbumDetail> {
  const info = detail.info;
  const imageUrl = await resolveCover(
    info.imageUrl,
    () => fetchMelonAlbumCoverById(info.albumId),
    () => fallbackMelonAlbumCover(info.artist, info.name),
  );
  if (imageUrl === info.imageUrl) return detail;
  return { info: { ...info, imageUrl } };
}

export async function enrichMelonTrackDetail(detail: MelonTrackDetail): Promise<MelonTrackDetail> {
  const info = detail.info;
  let albumDetail = detail.albumDetail;
  if (albumDetail) {
    albumDetail = await enrichMelonAlbumDetail(albumDetail);
  }
  const imageUrl = await resolveCover(
    info.imageUrl,
    async () => {
      if (albumDetail && !needsMelonCoverFallback(albumDetail.info.imageUrl)) {
        return albumDetail.info.imageUrl;
      }
      const html = await fetchMelonHtml(info.url, info.url);
      if (html) {
        const songCover = parseMelonSongCoverFromDetailHtml(html);
        if (!needsMelonCoverFallback(songCover)) return songCover;
      }
      return info.albumId ? fetchMelonAlbumCoverById(info.albumId) : '';
    },
    () => fallbackMelonTrackCover(info.artist, info.name, info.album),
  );
  let similarTracks = detail.similarTracks;
  if (similarTracks.length > 0) {
    similarTracks = await enrichMelonTrackSummaries(similarTracks);
  }
  const nextInfo = imageUrl === info.imageUrl ? info : { ...info, imageUrl };
  if (
    nextInfo === info &&
    similarTracks === detail.similarTracks &&
    albumDetail === detail.albumDetail
  ) {
    return detail;
  }
  return { info: nextInfo, similarTracks, albumDetail };
}
