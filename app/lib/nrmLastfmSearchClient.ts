import { nrmBackendFetch } from '@/lib/nrmBackendFetch';
import { usesPcBackendInDev } from '@/lib/nrmDevRuntime';
import {
  getDefaultApiBaseUrl,
  getResolvedApiBaseUrl,
} from '@/lib/apiBaseUrl';
import { nrmSearchNotConfiguredMessage } from '@/lib/nrmSearchStrings';
import { buildLastfmChartAuthHeaders } from '@/lib/nrmLastfmTokenSync';
import type {
  LastfmAlbumDetail,
  LastfmAlbumSearchHit,
  LastfmArtistDetail,
  LastfmArtistSearchHit,
  LastfmSearchErrorCode,
  LastfmSearchOutcome,
  LastfmTrackDetail,
  LastfmTrackSearchHit,
} from '@/lib/nrmLastfmSearchTypes';

function errorFromApi(code: string | undefined, httpStatus: number): LastfmSearchErrorCode {
  if (code === 'lastfm_not_configured') return 'not_configured';
  if (code === 'lastfm_auth_failed' || httpStatus === 401 || httpStatus === 403) {
    return 'auth_failed';
  }
  if (
    code === 'lastfm_search_query_required' ||
    code === 'lastfm_search_name_required' ||
    httpStatus === 400
  ) {
    return 'bad_request';
  }
  return 'unknown';
}

function messageForError(code: LastfmSearchErrorCode): string {
  if (code === 'not_configured') return nrmSearchNotConfiguredMessage;
  if (code === 'auth_failed') {
    return 'API 키가 올바르지 않습니다. 설정에서 키를 확인하세요.';
  }
  if (code === 'bad_request') return '검색어 또는 선택 항목을 확인하세요.';
  if (code === 'network') {
    return '백엔드에 연결하지 못했습니다. PC 서버(8787)를 확인하세요.';
  }
  return '검색에 실패했습니다.';
}

async function fetchWithBase<T>(
  base: string,
  path: string,
  headers: HeadersInit,
): Promise<LastfmSearchOutcome<T>> {
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
      const errorCode = errorFromApi(code, res.status);
      return { ok: false, errorCode, message: messageForError(errorCode) };
    }
    return { ok: true, data: JSON.parse(raw) as T };
  } catch {
    return {
      ok: false,
      errorCode: 'network',
      message: messageForError('network'),
    };
  }
}

async function fetchLastfmSearch<T>(
  path: string,
): Promise<LastfmSearchOutcome<T>> {
  const auth = await buildLastfmChartAuthHeaders();
  if ('error' in auth) {
    return {
      ok: false,
      errorCode: 'not_configured',
      message: auth.error,
    };
  }

  const resolved = await getResolvedApiBaseUrl();
  const primary =
    resolved ?? (usesPcBackendInDev() ? getDefaultApiBaseUrl() : null);
  if (!primary) {
    return {
      ok: false,
      errorCode: 'network',
      message: messageForError('network'),
    };
  }

  const first = await fetchWithBase<T>(primary, path, auth.headers);
  if (first.ok || !usesPcBackendInDev()) return first;
  const fallback = getDefaultApiBaseUrl();
  if (fallback === primary) return first;
  return fetchWithBase<T>(fallback, path, auth.headers);
}

export async function searchLastfmArtists(
  query: string,
): Promise<LastfmSearchOutcome<{ artists: LastfmArtistSearchHit[] }>> {
  const q = encodeURIComponent(query.trim());
  return fetchLastfmSearch(`/api/search/lastfm/artist?q=${q}`);
}

export async function fetchLastfmArtistDetail(
  artist: string,
  mbid?: string,
): Promise<LastfmSearchOutcome<LastfmArtistDetail>> {
  const a = encodeURIComponent(artist.trim());
  const mbidQ = mbid?.trim() ? `&mbid=${encodeURIComponent(mbid.trim())}` : '';
  return fetchLastfmSearch(`/api/search/lastfm/artist/detail?artist=${a}${mbidQ}`);
}

export async function searchLastfmAlbums(
  query: string,
): Promise<LastfmSearchOutcome<{ albums: LastfmAlbumSearchHit[] }>> {
  const q = encodeURIComponent(query.trim());
  return fetchLastfmSearch(`/api/search/lastfm/album?q=${q}`);
}

export async function fetchLastfmAlbumDetail(
  artist: string,
  album: string,
): Promise<LastfmSearchOutcome<LastfmAlbumDetail>> {
  const a = encodeURIComponent(artist.trim());
  const al = encodeURIComponent(album.trim());
  return fetchLastfmSearch(
    `/api/search/lastfm/album/detail?artist=${a}&album=${al}`,
  );
}

export async function searchLastfmTracks(
  query: string,
): Promise<LastfmSearchOutcome<{ tracks: LastfmTrackSearchHit[] }>> {
  const q = encodeURIComponent(query.trim());
  return fetchLastfmSearch(`/api/search/lastfm/track?q=${q}`);
}

export async function fetchLastfmTrackDetail(
  artist: string,
  track: string,
): Promise<LastfmSearchOutcome<LastfmTrackDetail>> {
  const a = encodeURIComponent(artist.trim());
  const t = encodeURIComponent(track.trim());
  return fetchLastfmSearch(
    `/api/search/lastfm/track/detail?artist=${a}&track=${t}`,
  );
}
