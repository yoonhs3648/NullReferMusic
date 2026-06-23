import { nrmBackendFetch } from '@/lib/nrmBackendFetch';
import { nrmDirectFetch } from '@/lib/nrmLoggedFetch';
import { Platform } from 'react-native';

import { isExpoGo, isStandaloneApp, usesPcBackendInDev } from '@/lib/nrmDevRuntime';
import {
  getDefaultApiBaseUrl,
  getResolvedApiBaseUrl,
} from '@/lib/apiBaseUrl';
import type {
  MelonAlbumDetail,
  MelonAlbumSearchHit,
  MelonAlbumSearchPage,
  MelonArtistDetail,
  MelonArtistSearchHit,
  MelonArtistSearchPage,
  MelonSearchErrorCode,
  MelonSearchOutcome,
  MelonTrackDetail,
  MelonTrackSearchHit,
  MelonTrackSearchPage,
} from '@/lib/nrmMelonSearchTypes';
import {
  applyArtistFanCount,
  melonAlbumDetailUrl,
  melonAlbumSearchNextCursor,
  melonAlbumSearchUrl,
  melonArtistAlbumUrl,
  melonArtistDetailUrl,
  melonArtistPopularAlbumsUrl,
  melonArtistPopularSongsUrl,
  melonArtistSearchNextCursor,
  melonArtistSearchUrl,
  melonArtistSongUrl,
  melonFanCountUrl,
  melonSongDetailUrl,
  melonSongSearchNextCursor,
  melonSongSearchUrl,
  parseMelonAlbumDetailHtml,
  parseMelonAlbumSearchHtml,
  parseMelonArtistDetailHtml,
  parseMelonArtistPopularAlbumsHtml,
  parseMelonArtistPopularSongsHtml,
  parseMelonArtistSearchHtml,
  parseMelonFanCountJson,
  parseMelonSearchStartIndex,
  parseMelonSongDetailHtml,
  parseMelonSongSearchHtml,
  MELON_ALBUM_SEARCH_PAGE_SIZE,
  MELON_ARTIST_SEARCH_PAGE_SIZE,
  MELON_BASE,
  MELON_SONG_SEARCH_PAGE_SIZE,
} from '@/lib/nrmMelonSearchParse';
import {
  enrichMelonAlbumDetail,
  enrichMelonAlbumSearchHits,
  enrichMelonArtistDetail,
  enrichMelonArtistSearchHits,
  enrichMelonTrackDetail,
  enrichMelonTrackSearchHits,
} from '@/lib/nrmMelonSearchEnrich';
import { readMelonHtmlCache, writeMelonHtmlCache } from '@/lib/nrmMelonHtmlCache';
import { getMelonAdultCookieHeader } from '@/lib/nrmMelonAdultSession';

const MELON_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function messageForError(code: MelonSearchErrorCode): string {
  if (code === 'bad_request') return '검색어 또는 선택 항목을 확인하세요.';
  if (code === 'network') return '네트워크에 연결되지 않았습니다. Wi‑Fi·데이터를 확인하세요.';
  return '검색에 실패했습니다.';
}

function requireQuery(query: string): string | null {
  const q = query.trim();
  return q.length > 0 ? q : null;
}

async function melonFetchHtml(url: string, referer = `${MELON_BASE}/`): Promise<string | null> {
  const cookieHeader = await getMelonAdultCookieHeader();
  const cacheKey = cookieHeader ? `${url}\0${cookieHeader}` : url;
  const cached = readMelonHtmlCache(cacheKey);
  if (cached !== null) {
    return cached;
  }
  try {
    const headers: Record<string, string> = {
      'User-Agent': MELON_UA,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'ko-KR,ko;q=0.9',
      Referer: referer,
    };
    if (cookieHeader) {
      headers.Cookie = cookieHeader;
    }
    const res = await nrmDirectFetch(
      url,
      { headers },
      'melon-search',
    );
    if (!res.ok) return null;
    const html = await res.text();
    writeMelonHtmlCache(cacheKey, html);
    return html;
  } catch {
    return null;
  }
}

async function melonFetchText(url: string, referer: string): Promise<string | null> {
  try {
    const cookieHeader = await getMelonAdultCookieHeader();
    const headers: Record<string, string> = {
      'User-Agent': MELON_UA,
      Accept: 'application/json,text/plain,*/*',
      Referer: referer,
    };
    if (cookieHeader) {
      headers.Cookie = cookieHeader;
    }
    const res = await nrmDirectFetch(
      url,
      { headers },
      'melon-search',
    );
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function searchMelonArtistsDirectPage(
  query: string,
  cursor: string | null,
): Promise<MelonSearchOutcome<MelonArtistSearchPage>> {
  const q = requireQuery(query);
  if (!q) {
    return { ok: false, errorCode: 'bad_request', message: messageForError('bad_request') };
  }
  const startIndex = parseMelonSearchStartIndex(cursor);
  const referer = melonArtistSearchUrl(q, 1);
  const html = await melonFetchHtml(melonArtistSearchUrl(q, startIndex), referer);
  if (!html) {
    return { ok: false, errorCode: 'network', message: messageForError('network') };
  }
  const artists = parseMelonArtistSearchHtml(html, MELON_ARTIST_SEARCH_PAGE_SIZE);
  return {
    ok: true,
    data: {
      artists,
      nextCursor: melonArtistSearchNextCursor(startIndex, artists.length),
    },
  };
}

async function searchMelonAlbumsDirectPage(
  query: string,
  cursor: string | null,
): Promise<MelonSearchOutcome<MelonAlbumSearchPage>> {
  const q = requireQuery(query);
  if (!q) {
    return { ok: false, errorCode: 'bad_request', message: messageForError('bad_request') };
  }
  const startIndex = parseMelonSearchStartIndex(cursor);
  const referer = melonAlbumSearchUrl(q, 1);
  const html = await melonFetchHtml(melonAlbumSearchUrl(q, startIndex), referer);
  if (!html) {
    return { ok: false, errorCode: 'network', message: messageForError('network') };
  }
  const albums = parseMelonAlbumSearchHtml(html, MELON_ALBUM_SEARCH_PAGE_SIZE);
  return {
    ok: true,
    data: {
      albums,
      nextCursor: melonAlbumSearchNextCursor(startIndex, albums.length),
    },
  };
}

async function searchMelonTracksDirectPage(
  query: string,
  cursor: string | null,
): Promise<MelonSearchOutcome<MelonTrackSearchPage>> {
  const q = requireQuery(query);
  if (!q) {
    return { ok: false, errorCode: 'bad_request', message: messageForError('bad_request') };
  }
  const startIndex = parseMelonSearchStartIndex(cursor);
  const referer = melonSongSearchUrl(q, 1);
  const html = await melonFetchHtml(melonSongSearchUrl(q, startIndex), referer);
  if (!html) {
    return { ok: false, errorCode: 'network', message: messageForError('network') };
  }
  const tracks = parseMelonSongSearchHtml(html, MELON_SONG_SEARCH_PAGE_SIZE);
  return {
    ok: true,
    data: {
      tracks,
      nextCursor: melonSongSearchNextCursor(startIndex, tracks.length),
    },
  };
}

async function searchMelonArtistsDirect(
  query: string,
): Promise<MelonSearchOutcome<{ artists: MelonArtistSearchHit[] }>> {
  const out = await searchMelonArtistsDirectPage(query, null);
  if (!out.ok) return out;
  return { ok: true, data: { artists: out.data.artists } };
}

async function searchMelonAlbumsDirect(
  query: string,
): Promise<MelonSearchOutcome<{ albums: MelonAlbumSearchHit[] }>> {
  const out = await searchMelonAlbumsDirectPage(query, null);
  if (!out.ok) return out;
  return { ok: true, data: { albums: out.data.albums } };
}

async function searchMelonTracksDirect(
  query: string,
): Promise<MelonSearchOutcome<{ tracks: MelonTrackSearchHit[] }>> {
  const out = await searchMelonTracksDirectPage(query, null);
  if (!out.ok) return out;
  return { ok: true, data: { tracks: out.data.tracks } };
}

async function fetchMelonArtistDetailDirect(
  artistId: string,
): Promise<MelonSearchOutcome<MelonArtistDetail>> {
  const id = artistId.trim();
  if (!id) {
    return { ok: false, errorCode: 'bad_request', message: messageForError('bad_request') };
  }
  const detailUrl = melonArtistDetailUrl(id);
  const html = await melonFetchHtml(detailUrl);
  if (!html) {
    return { ok: false, errorCode: 'network', message: messageForError('network') };
  }
  const base = parseMelonArtistDetailHtml(html, id);
  const songReferer = melonArtistSongUrl(id);
  const albumReferer = melonArtistAlbumUrl(id);
  const [fanJson, songsHtml, albumsHtml] = await Promise.all([
    melonFetchText(melonFanCountUrl(id), detailUrl),
    melonFetchHtml(melonArtistPopularSongsUrl(id), songReferer),
    melonFetchHtml(melonArtistPopularAlbumsUrl(id), albumReferer),
  ]);
  const fanCount = fanJson ? parseMelonFanCountJson(fanJson) : 0;
  const withPopular: MelonArtistDetail = {
    ...applyArtistFanCount(base, fanCount),
    popularTracks: songsHtml ? parseMelonArtistPopularSongsHtml(songsHtml) : [],
    popularAlbums: albumsHtml ? parseMelonArtistPopularAlbumsHtml(albumsHtml) : [],
  };
  return { ok: true, data: withPopular };
}

async function fetchMelonAlbumDetailDirect(
  albumId: string,
): Promise<MelonSearchOutcome<MelonAlbumDetail>> {
  const id = albumId.trim();
  if (!id) {
    return { ok: false, errorCode: 'bad_request', message: messageForError('bad_request') };
  }
  const url = melonAlbumDetailUrl(id);
  const html = await melonFetchHtml(url);
  if (!html) {
    return { ok: false, errorCode: 'network', message: messageForError('network') };
  }
  return { ok: true, data: parseMelonAlbumDetailHtml(html, id) };
}

async function fetchMelonTrackDetailDirect(
  songId: string,
): Promise<MelonSearchOutcome<MelonTrackDetail>> {
  const id = songId.trim();
  if (!id) {
    return { ok: false, errorCode: 'bad_request', message: messageForError('bad_request') };
  }
  const url = melonSongDetailUrl(id);
  const html = await melonFetchHtml(url);
  if (!html) {
    return { ok: false, errorCode: 'network', message: messageForError('network') };
  }
  const parsed = parseMelonSongDetailHtml(html, id);
  let albumDetail: MelonAlbumDetail | null = null;
  const albumId = parsed.info.albumId.trim();
  if (albumId) {
    const albumUrl = melonAlbumDetailUrl(albumId);
    const albumHtml = await melonFetchHtml(albumUrl, url);
    if (albumHtml) {
      albumDetail = parseMelonAlbumDetailHtml(albumHtml, albumId);
    }
  }
  return { ok: true, data: { ...parsed, albumDetail } };
}

async function fetchMelonSearchBackend<T>(path: string): Promise<MelonSearchOutcome<T>> {
  try {
    const resolved = await getResolvedApiBaseUrl();
    const primary =
      resolved ?? (usesPcBackendInDev() ? getDefaultApiBaseUrl() : null);
    if (!primary) {
      return { ok: false, errorCode: 'network', message: messageForError('network') };
    }
    const cookieHeader = await getMelonAdultCookieHeader();
    const backendHeaders: Record<string, string> = {};
    if (cookieHeader) {
      backendHeaders['X-NRM-Melon-Cookie'] = cookieHeader;
    }
    const tryBase = async (base: string): Promise<MelonSearchOutcome<T>> => {
      const res = await nrmBackendFetch(`${base}${path}`, { headers: backendHeaders });
      const raw = await res.text();
      if (!res.ok) {
        let code: string | undefined;
        try {
          code = (JSON.parse(raw) as { error?: string }).error;
        } catch {
          code = undefined;
        }
        const errorCode: MelonSearchErrorCode =
          code === 'melon_search_query_required' ||
          code === 'melon_search_id_required' ||
          res.status === 400
            ? 'bad_request'
            : 'unknown';
        return { ok: false, errorCode, message: messageForError(errorCode) };
      }
      return { ok: true, data: JSON.parse(raw) as T };
    };
    const first = await tryBase(primary);
    if (first.ok || !usesPcBackendInDev()) return first;
    const fallback = getDefaultApiBaseUrl();
    if (fallback === primary) return first;
    return tryBase(fallback);
  } catch {
    return { ok: false, errorCode: 'network', message: messageForError('network') };
  }
}

/** 웹은 CORS — APK·Expo Go는 멜론 HTML 직접 조회 */
function useDirect(): boolean {
  if (Platform.OS === 'web') return false;
  return isStandaloneApp() || isExpoGo();
}

function melonSearchPagePath(
  kind: 'artist' | 'album' | 'track',
  query: string,
  cursor: string | null,
): string {
  const params = new URLSearchParams({ q: query.trim() });
  if (cursor?.trim()) params.set('cursor', cursor.trim());
  return `/api/search/melon/${kind}?${params.toString()}`;
}

export async function searchMelonArtistsPage(
  query: string,
  cursor: string | null = null,
): Promise<MelonSearchOutcome<MelonArtistSearchPage>> {
  const out = useDirect()
    ? await searchMelonArtistsDirectPage(query, cursor)
    : await fetchMelonSearchBackend<MelonArtistSearchPage>(
        melonSearchPagePath('artist', query, cursor),
      );
  if (!out.ok) return out;
  return {
    ok: true,
    data: {
      artists: await enrichMelonArtistSearchHits(out.data.artists ?? []),
      nextCursor: out.data.nextCursor ?? null,
    },
  };
}

export async function searchMelonAlbumsPage(
  query: string,
  cursor: string | null = null,
): Promise<MelonSearchOutcome<MelonAlbumSearchPage>> {
  const out = useDirect()
    ? await searchMelonAlbumsDirectPage(query, cursor)
    : await fetchMelonSearchBackend<MelonAlbumSearchPage>(
        melonSearchPagePath('album', query, cursor),
      );
  if (!out.ok) return out;
  return {
    ok: true,
    data: {
      albums: await enrichMelonAlbumSearchHits(out.data.albums ?? []),
      nextCursor: out.data.nextCursor ?? null,
    },
  };
}

export async function searchMelonTracksPage(
  query: string,
  cursor: string | null = null,
): Promise<MelonSearchOutcome<MelonTrackSearchPage>> {
  const out = useDirect()
    ? await searchMelonTracksDirectPage(query, cursor)
    : await fetchMelonSearchBackend<MelonTrackSearchPage>(
        melonSearchPagePath('track', query, cursor),
      );
  if (!out.ok) return out;
  return {
    ok: true,
    data: {
      tracks: await enrichMelonTrackSearchHits(out.data.tracks ?? []),
      nextCursor: out.data.nextCursor ?? null,
    },
  };
}

export async function searchMelonArtists(
  query: string,
): Promise<MelonSearchOutcome<{ artists: MelonArtistSearchHit[] }>> {
  const out = useDirect()
    ? await searchMelonArtistsDirect(query)
    : await fetchMelonSearchBackend<{ artists: MelonArtistSearchHit[] }>(
        `/api/search/melon/artist?q=${encodeURIComponent(query.trim())}`,
      );
  if (!out.ok) return out;
  return {
    ok: true,
    data: { artists: await enrichMelonArtistSearchHits(out.data.artists ?? []) },
  };
}

export async function searchMelonAlbums(
  query: string,
): Promise<MelonSearchOutcome<{ albums: MelonAlbumSearchHit[] }>> {
  const out = useDirect()
    ? await searchMelonAlbumsDirect(query)
    : await fetchMelonSearchBackend<{ albums: MelonAlbumSearchHit[] }>(
        `/api/search/melon/album?q=${encodeURIComponent(query.trim())}`,
      );
  if (!out.ok) return out;
  return {
    ok: true,
    data: { albums: await enrichMelonAlbumSearchHits(out.data.albums ?? []) },
  };
}

export async function searchMelonTracks(
  query: string,
): Promise<MelonSearchOutcome<{ tracks: MelonTrackSearchHit[] }>> {
  const out = useDirect()
    ? await searchMelonTracksDirect(query)
    : await fetchMelonSearchBackend<{ tracks: MelonTrackSearchHit[] }>(
        `/api/search/melon/track?q=${encodeURIComponent(query.trim())}`,
      );
  if (!out.ok) return out;
  return {
    ok: true,
    data: { tracks: await enrichMelonTrackSearchHits(out.data.tracks ?? []) },
  };
}

export async function fetchMelonArtistDetail(
  artistId: string,
  _artistName?: string,
): Promise<MelonSearchOutcome<MelonArtistDetail>> {
  const out = useDirect()
    ? await fetchMelonArtistDetailDirect(artistId)
    : await fetchMelonSearchBackend<MelonArtistDetail>(
        `/api/search/melon/artist/detail?${new URLSearchParams({ artistId: artistId.trim() }).toString()}`,
      );
  if (!out.ok) return out;
  const data: MelonArtistDetail = {
    info: out.data.info,
    popularTracks: out.data.popularTracks ?? [],
    popularAlbums: out.data.popularAlbums ?? [],
  };
  return { ok: true, data: await enrichMelonArtistDetail(data) };
}

export async function fetchMelonAlbumDetail(
  albumId: string,
  options?: { enrich?: boolean },
): Promise<MelonSearchOutcome<MelonAlbumDetail>> {
  const out = useDirect()
    ? await fetchMelonAlbumDetailDirect(albumId)
    : await fetchMelonSearchBackend<MelonAlbumDetail>(
        `/api/search/melon/album/detail?albumId=${encodeURIComponent(albumId.trim())}`,
      );
  if (!out.ok) return out;
  if (options?.enrich === false) {
    return { ok: true, data: out.data };
  }
  return { ok: true, data: await enrichMelonAlbumDetail(out.data) };
}

export async function fetchMelonTrackDetail(
  songId: string,
  options?: { enrich?: boolean },
): Promise<MelonSearchOutcome<MelonTrackDetail>> {
  const out = useDirect()
    ? await fetchMelonTrackDetailDirect(songId)
    : await fetchMelonSearchBackend<MelonTrackDetail>(
        `/api/search/melon/track/detail?songId=${encodeURIComponent(songId.trim())}`,
      );
  if (!out.ok) return out;
  const data: MelonTrackDetail = {
    info: out.data.info,
    similarTracks: out.data.similarTracks ?? [],
    albumDetail: out.data.albumDetail ?? null,
  };
  if (options?.enrich === false) {
    return { ok: true, data };
  }
  return { ok: true, data: await enrichMelonTrackDetail(data) };
}
