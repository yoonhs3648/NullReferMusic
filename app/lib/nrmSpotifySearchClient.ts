import { nrmBackendFetch } from '@/lib/nrmBackendFetch';
import { nrmDirectFetch } from '@/lib/nrmLoggedFetch';
import { isStandaloneApp, usesPcBackendInDev } from '@/lib/nrmDevRuntime';
import {
  getDefaultApiBaseUrl,
  getResolvedApiBaseUrl,
} from '@/lib/apiBaseUrl';
import {
  chartUserMessage,
  spotifyErrorFromApi,
  type ChartErrorCode,
} from '@/lib/nrmChartErrors';
import {
  buildSpotifyChartAuthHeaders,
  refreshSpotifyChartToken,
} from '@/lib/nrmSpotifyTokenSync';
import type {
  SpotifyAlbumDetail,
  SpotifyAlbumSearchHit,
  SpotifyAlbumSearchPage,
  SpotifyArtistDetail,
  SpotifyArtistSearchHit,
  SpotifyArtistSearchPage,
  SpotifySearchOutcome,
  SpotifyTrackDetail,
  SpotifyTrackSearchHit,
  SpotifyTrackSearchPage,
} from '@/lib/nrmSpotifySearchTypes';
import { NRM_SEARCH_PAGE_SIZE } from '@/lib/nrmSearchPageSize';
import { pickSpotifyCoverUrl } from '@/lib/nrmCoverArtUrl';

const SPOTIFY_API = 'https://api.spotify.com/v1';
const MARKET = 'KR';

function fail<T>(errorCode: ChartErrorCode): SpotifySearchOutcome<T> {
  return {
    ok: false,
    errorCode,
    message: chartUserMessage('spotify', errorCode),
  };
}

function httpToChartError(httpStatus: number, apiCode?: string): ChartErrorCode {
  if (httpStatus === 401) return 'auth_failed';
  if (httpStatus === 403) return 'premium_required';
  return spotifyErrorFromApi(apiCode, httpStatus);
}

function bearerFromHeaders(headers: HeadersInit): string {
  const h = headers as Record<string, string>;
  return (h.Authorization ?? h.authorization ?? '').replace(/^Bearer\s+/i, '').trim();
}

async function spotifyApiGet<T>(
  apiPath: string,
  headers: HeadersInit,
): Promise<SpotifySearchOutcome<T>> {
  const token = bearerFromHeaders(headers);
  if (!token) {
    return fail('not_configured');
  }
  try {
    const res = await nrmDirectFetch(
      `${SPOTIFY_API}${apiPath}`,
      { headers: { Authorization: `Bearer ${token}` } },
      'spotify-search',
    );
    if (!res.ok) {
      let apiCode: string | undefined;
      try {
        const body = JSON.parse(await res.text()) as { error?: string };
        apiCode = body.error;
      } catch {
        apiCode = undefined;
      }
      return fail(httpToChartError(res.status, apiCode));
    }
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return fail('network');
  }
}

async function fetchWithBase<T>(
  base: string,
  path: string,
  headers: HeadersInit,
): Promise<SpotifySearchOutcome<T>> {
  try {
    const res = await nrmBackendFetch(`${base}${path}`, { headers });
    const raw = await res.text();
    if (!res.ok) {
      let code: string | undefined;
      try {
        code = (JSON.parse(raw) as { error?: string }).error;
      } catch {
        code = undefined;
      }
      const errorCode = spotifyErrorFromApi(code, res.status);
      return fail(errorCode);
    }
    return { ok: true, data: JSON.parse(raw) as T };
  } catch {
    return fail('network');
  }
}

async function runWithHeaders<T>(
  headers: HeadersInit,
  path: string,
): Promise<SpotifySearchOutcome<T>> {
  if (isStandaloneApp()) {
    const apiPath = path.replace(/^\/api\/search\/spotify/, '');
    return spotifyApiGet<T>(apiPath, headers);
  }
  const resolved = await getResolvedApiBaseUrl();
  const primary = resolved ?? (usesPcBackendInDev() ? getDefaultApiBaseUrl() : null);
  if (!primary) {
    return fail('backend_unreachable');
  }
  const apiPath = path.startsWith('/api/') ? path : `/api/search/spotify${path}`;
  const first = await fetchWithBase<T>(primary, apiPath, headers);
  if (first.ok || !usesPcBackendInDev()) {
    return first;
  }
  const fallback = getDefaultApiBaseUrl();
  if (fallback === primary) {
    return first;
  }
  return fetchWithBase<T>(fallback, apiPath, headers);
}

async function fetchSpotifySearchWithRetry<T>(
  path: string,
): Promise<SpotifySearchOutcome<T>> {
  const auth = await buildSpotifyChartAuthHeaders('official');
  if ('error' in auth) {
    return fail('not_configured');
  }

  let result = await runWithHeaders<T>(auth.headers, path);

  if (!result.ok && result.errorCode === 'auth_failed') {
    const refreshed = await refreshSpotifyChartToken();
    if (refreshed.ok) {
      result = await runWithHeaders<T>(refreshed.headers, path);
    }
  }

  return result;
}

function mapArtistHit(node: Record<string, unknown>): SpotifyArtistSearchHit {
  const images = node.images as { url?: string; width?: number }[] | undefined;
  const imageUrl = pickSpotifyCoverUrl(images);
  const followers = node.followers as { total?: number } | undefined;
  const external = node.external_urls as { spotify?: string } | undefined;
  return {
    id: String(node.id ?? ''),
    name: String(node.name ?? ''),
    imageUrl,
    spotifyUrl: external?.spotify ?? '',
    followers: followers?.total ?? 0,
  };
}

function mapAlbumHit(node: Record<string, unknown>): SpotifyAlbumSearchHit {
  const images = node.images as { url?: string; width?: number }[] | undefined;
  const imageUrl = pickSpotifyCoverUrl(images);
  const artists = (node.artists as { name?: string }[] | undefined) ?? [];
  const external = node.external_urls as { spotify?: string } | undefined;
  return {
    id: String(node.id ?? ''),
    name: String(node.name ?? ''),
    artists: artists.map((a) => a.name ?? '').filter(Boolean).join(', '),
    imageUrl,
    spotifyUrl: external?.spotify ?? '',
    releaseDate: String(node.release_date ?? ''),
  };
}

function mapTrackHit(node: Record<string, unknown>): SpotifyTrackSearchHit {
  const album = node.album as Record<string, unknown> | undefined;
  const images = album?.images as { url?: string; width?: number }[] | undefined;
  const imageUrl = pickSpotifyCoverUrl(images);
  const artists = (node.artists as { name?: string }[] | undefined) ?? [];
  const external = node.external_urls as { spotify?: string } | undefined;
  return {
    id: String(node.id ?? ''),
    name: String(node.name ?? ''),
    artists: artists.map((a) => a.name ?? '').filter(Boolean).join(', '),
    imageUrl,
    spotifyUrl: external?.spotify ?? '',
    albumName: String(album?.name ?? ''),
    durationMs: typeof node.duration_ms === 'number' ? node.duration_ms : 0,
  };
}

function parseSpotifyOffset(cursor: string | null): number {
  const n = parseInt(cursor ?? '0', 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function spotifyNextOffsetCursor(offset: number, count: number): string | null {
  if (count < NRM_SEARCH_PAGE_SIZE) return null;
  return String(offset + count);
}

function spotifySearchQueryPath(
  kind: 'artist' | 'album' | 'track',
  query: string,
  cursor: string | null,
): string {
  const q = encodeURIComponent(query.trim());
  const cursorQ = cursor?.trim() ? `&cursor=${encodeURIComponent(cursor.trim())}` : '';
  return `/${kind}?q=${q}${cursorQ}`;
}

function mapSpotifyArtistPage(root: Record<string, unknown>, offset: number): SpotifyArtistSearchPage {
  const items =
    (root.artists as { items?: Record<string, unknown>[] } | undefined)?.items ?? [];
  const artists = items.map(mapArtistHit);
  return { artists, nextCursor: spotifyNextOffsetCursor(offset, artists.length) };
}

function mapSpotifyAlbumPage(root: Record<string, unknown>, offset: number): SpotifyAlbumSearchPage {
  const items =
    (root.albums as { items?: Record<string, unknown>[] } | undefined)?.items ?? [];
  const albums = items.map(mapAlbumHit);
  return { albums, nextCursor: spotifyNextOffsetCursor(offset, albums.length) };
}

function mapSpotifyTrackPage(root: Record<string, unknown>, offset: number): SpotifyTrackSearchPage {
  const items =
    (root.tracks as { items?: Record<string, unknown>[] } | undefined)?.items ?? [];
  const tracks = items.map(mapTrackHit);
  return { tracks, nextCursor: spotifyNextOffsetCursor(offset, tracks.length) };
}

export async function searchSpotifyArtistsPage(
  query: string,
  cursor: string | null = null,
): Promise<SpotifySearchOutcome<SpotifyArtistSearchPage>> {
  const offset = parseSpotifyOffset(cursor);
  if (isStandaloneApp()) {
    const auth = await buildSpotifyChartAuthHeaders('official');
    if ('error' in auth) return fail('not_configured');
    const q = encodeURIComponent(query.trim());
    const out = await spotifyApiGet<Record<string, unknown>>(
      `/search?type=artist&q=${q}&limit=${NRM_SEARCH_PAGE_SIZE}&offset=${offset}&market=${MARKET}`,
      auth.headers,
    );
    if (!out.ok) return out;
    return { ok: true, data: mapSpotifyArtistPage(out.data, offset) };
  }
  const out = await fetchSpotifySearchWithRetry<SpotifyArtistSearchPage>(
    spotifySearchQueryPath('artist', query, cursor),
  );
  if (!out.ok) return out;
  return {
    ok: true,
    data: {
      artists: out.data.artists ?? [],
      nextCursor: out.data.nextCursor ?? null,
    },
  };
}

export async function searchSpotifyArtists(
  query: string,
): Promise<SpotifySearchOutcome<{ artists: SpotifyArtistSearchHit[] }>> {
  const q = encodeURIComponent(query.trim());
  if (isStandaloneApp()) {
    const out = await fetchSpotifySearchWithRetry<Record<string, unknown>>(
      `/artist?q=${q}`,
    );
    if (!out.ok) return out;
    const root = out.data;
    const items =
      (root.artists as { items?: Record<string, unknown>[] } | undefined)?.items ?? [];
    return { ok: true, data: { artists: items.map(mapArtistHit) } };
  }
  return fetchSpotifySearchWithRetry(`/artist?q=${q}`);
}

export async function fetchSpotifyArtistDetail(
  id: string,
): Promise<SpotifySearchOutcome<SpotifyArtistDetail>> {
  const enc = encodeURIComponent(id.trim());
  if (isStandaloneApp()) {
    const auth = await buildSpotifyChartAuthHeaders('official');
    if ('error' in auth) {
      return fail('not_configured');
    }
    const runDetail = async (
      hdrs: HeadersInit,
    ): Promise<SpotifySearchOutcome<SpotifyArtistDetail>> => {
      const artistOut = await spotifyApiGet<Record<string, unknown>>(`/artists/${enc}`, hdrs);
      if (!artistOut.ok) return artistOut;
      const artist = artistOut.data;
      const [tracksOut, albumsOut] = await Promise.all([
        spotifyApiGet<{ tracks?: Record<string, unknown>[] }>(
          `/artists/${enc}/top-tracks?market=${MARKET}`,
          hdrs,
        ),
        spotifyApiGet<{ items?: Record<string, unknown>[] }>(
          `/artists/${enc}/albums?market=${MARKET}&limit=12&include_groups=album,single`,
          hdrs,
        ),
      ]);
      if (!tracksOut.ok) return tracksOut;
      if (!albumsOut.ok) return albumsOut;
      const genres = (artist.genres as string[] | undefined) ?? [];
      const images = artist.images as { url?: string }[] | undefined;
      const external = artist.external_urls as { spotify?: string } | undefined;
      const followers = artist.followers as { total?: number } | undefined;
      return {
        ok: true,
        data: {
          info: {
            id: String(artist.id ?? id),
            name: String(artist.name ?? ''),
            imageUrl: pickSpotifyCoverUrl(images),
            spotifyUrl: external?.spotify ?? '',
            followers: followers?.total ?? 0,
            popularity: typeof artist.popularity === 'number' ? artist.popularity : 0,
            genres,
          },
          topTracks: (tracksOut.data.tracks ?? []).map((t) => {
            const h = mapTrackHit(t);
            return {
              id: h.id,
              name: h.name,
              artists: h.artists,
              imageUrl: h.imageUrl,
              spotifyUrl: h.spotifyUrl,
              durationMs: h.durationMs,
              popularity: typeof t.popularity === 'number' ? t.popularity : 0,
            };
          }),
          albums: (albumsOut.data.items ?? []).map((a) => {
            const h = mapAlbumHit(a);
            return {
              id: h.id,
              name: h.name,
              artists: h.artists,
              imageUrl: h.imageUrl,
              spotifyUrl: h.spotifyUrl,
              releaseDate: h.releaseDate,
            };
          }),
        },
      };
    };
    let out = await runDetail(auth.headers);
    if (!out.ok && out.errorCode === 'auth_failed') {
      const refreshed = await refreshSpotifyChartToken();
      if (refreshed.ok) {
        out = await runDetail(refreshed.headers);
      }
    }
    return out;
  }
  return fetchSpotifySearchWithRetry(`/artist/detail?id=${enc}`);
}

export async function searchSpotifyAlbumsPage(
  query: string,
  cursor: string | null = null,
): Promise<SpotifySearchOutcome<SpotifyAlbumSearchPage>> {
  const offset = parseSpotifyOffset(cursor);
  if (isStandaloneApp()) {
    const auth = await buildSpotifyChartAuthHeaders('official');
    if ('error' in auth) return fail('not_configured');
    const q = encodeURIComponent(query.trim());
    const out = await spotifyApiGet<Record<string, unknown>>(
      `/search?type=album&q=${q}&limit=${NRM_SEARCH_PAGE_SIZE}&offset=${offset}&market=${MARKET}`,
      auth.headers,
    );
    if (!out.ok) return out;
    return { ok: true, data: mapSpotifyAlbumPage(out.data, offset) };
  }
  const out = await fetchSpotifySearchWithRetry<SpotifyAlbumSearchPage>(
    spotifySearchQueryPath('album', query, cursor),
  );
  if (!out.ok) return out;
  return {
    ok: true,
    data: {
      albums: out.data.albums ?? [],
      nextCursor: out.data.nextCursor ?? null,
    },
  };
}

export async function searchSpotifyAlbums(
  query: string,
): Promise<SpotifySearchOutcome<{ albums: SpotifyAlbumSearchHit[] }>> {
  const q = encodeURIComponent(query.trim());
  if (isStandaloneApp()) {
    const out = await fetchSpotifySearchWithRetry<Record<string, unknown>>(
      `/album?q=${q}`,
    );
    if (!out.ok) return out;
    const root = out.data;
    const items =
      (root.albums as { items?: Record<string, unknown>[] } | undefined)?.items ?? [];
    return { ok: true, data: { albums: items.map(mapAlbumHit) } };
  }
  return fetchSpotifySearchWithRetry(`/album?q=${q}`);
}

export async function fetchSpotifyAlbumDetail(
  id: string,
): Promise<SpotifySearchOutcome<SpotifyAlbumDetail>> {
  const enc = encodeURIComponent(id.trim());
  if (isStandaloneApp()) {
    const run = async (headers: HeadersInit) =>
      spotifyApiGet<Record<string, unknown>>(
        `/albums/${enc}?market=${MARKET}`,
        headers,
      );
    const auth = await buildSpotifyChartAuthHeaders('official');
    if ('error' in auth) {
      return fail('not_configured');
    }
    let albumOut = await run(auth.headers);
    if (!albumOut.ok && albumOut.errorCode === 'auth_failed') {
      const refreshed = await refreshSpotifyChartToken();
      if (refreshed.ok) {
        albumOut = await run(refreshed.headers);
      }
    }
    if (!albumOut.ok) return albumOut;
    const album = albumOut.data;
    const images = album.images as { url?: string }[] | undefined;
    const artists = (album.artists as { name?: string }[] | undefined) ?? [];
    const external = album.external_urls as { spotify?: string } | undefined;
    const trackItems =
      (album.tracks as { items?: Record<string, unknown>[] } | undefined)?.items ?? [];
    return {
      ok: true,
      data: {
        info: {
          id: String(album.id ?? id),
          name: String(album.name ?? ''),
          artists: artists.map((a) => a.name ?? '').filter(Boolean).join(', '),
          imageUrl: pickSpotifyCoverUrl(images),
          spotifyUrl: external?.spotify ?? '',
          releaseDate: String(album.release_date ?? ''),
          totalTracks: typeof album.total_tracks === 'number' ? album.total_tracks : 0,
          label: String(album.label ?? ''),
        },
        tracks: trackItems.map((t) => ({
          id: String(t.id ?? ''),
          name: String(t.name ?? ''),
          trackNumber: typeof t.track_number === 'number' ? t.track_number : 0,
          durationMs: typeof t.duration_ms === 'number' ? t.duration_ms : 0,
        })),
      },
    };
  }
  return fetchSpotifySearchWithRetry(`/album/detail?id=${enc}`);
}

export async function searchSpotifyTracksPage(
  query: string,
  cursor: string | null = null,
): Promise<SpotifySearchOutcome<SpotifyTrackSearchPage>> {
  const offset = parseSpotifyOffset(cursor);
  if (isStandaloneApp()) {
    const auth = await buildSpotifyChartAuthHeaders('official');
    if ('error' in auth) return fail('not_configured');
    const q = encodeURIComponent(query.trim());
    const out = await spotifyApiGet<Record<string, unknown>>(
      `/search?type=track&q=${q}&limit=${NRM_SEARCH_PAGE_SIZE}&offset=${offset}&market=${MARKET}`,
      auth.headers,
    );
    if (!out.ok) return out;
    return { ok: true, data: mapSpotifyTrackPage(out.data, offset) };
  }
  const out = await fetchSpotifySearchWithRetry<SpotifyTrackSearchPage>(
    spotifySearchQueryPath('track', query, cursor),
  );
  if (!out.ok) return out;
  return {
    ok: true,
    data: {
      tracks: out.data.tracks ?? [],
      nextCursor: out.data.nextCursor ?? null,
    },
  };
}

export async function searchSpotifyTracks(
  query: string,
): Promise<SpotifySearchOutcome<{ tracks: SpotifyTrackSearchHit[] }>> {
  const q = encodeURIComponent(query.trim());
  if (isStandaloneApp()) {
    const out = await fetchSpotifySearchWithRetry<Record<string, unknown>>(
      `/track?q=${q}`,
    );
    if (!out.ok) return out;
    const root = out.data;
    const items =
      (root.tracks as { items?: Record<string, unknown>[] } | undefined)?.items ?? [];
    return { ok: true, data: { tracks: items.map(mapTrackHit) } };
  }
  return fetchSpotifySearchWithRetry(`/track?q=${q}`);
}

export async function fetchSpotifyTrackDetail(
  id: string,
): Promise<SpotifySearchOutcome<SpotifyTrackDetail>> {
  const enc = encodeURIComponent(id.trim());
  if (isStandaloneApp()) {
    const run = async (headers: HeadersInit) =>
      spotifyApiGet<Record<string, unknown>>(
        `/tracks/${enc}?market=${MARKET}`,
        headers,
      );
    const auth = await buildSpotifyChartAuthHeaders('official');
    if ('error' in auth) {
      return fail('not_configured');
    }
    let trackOut = await run(auth.headers);
    if (!trackOut.ok && trackOut.errorCode === 'auth_failed') {
      const refreshed = await refreshSpotifyChartToken();
      if (refreshed.ok) {
        trackOut = await run(refreshed.headers);
      }
    }
    if (!trackOut.ok) return trackOut;
    const track = trackOut.data;
    const h = mapTrackHit(track);
    return {
      ok: true,
      data: {
        info: {
          ...h,
          popularity: typeof track.popularity === 'number' ? track.popularity : 0,
          previewUrl: String(track.preview_url ?? ''),
        },
      },
    };
  }
  return fetchSpotifySearchWithRetry(`/track/detail?id=${enc}`);
}
