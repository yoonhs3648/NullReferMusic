import { nrmBackendFetch } from '@/lib/nrmBackendFetch';
import { isStandaloneApp, usesPcBackendInDev } from '@/lib/nrmDevRuntime';
import {
  getDefaultApiBaseUrl,
  getResolvedApiBaseUrl,
} from '@/lib/apiBaseUrl';
import { chartUserMessage } from '@/lib/nrmChartErrors';
import { buildLastfmChartAuthHeaders } from '@/lib/nrmLastfmTokenSync';
import type {
  LastfmAlbumDetail,
  LastfmAlbumSearchHit,
  LastfmArtistDetail,
  LastfmArtistSearchHit,
  LastfmSearchErrorCode,
  LastfmSearchOutcome,
  LastfmTag,
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
  if (code === 'not_configured') return chartUserMessage('lastfm', 'not_configured');
  if (code === 'auth_failed') return chartUserMessage('lastfm', 'auth_failed');
  if (code === 'bad_request') return '검색어 또는 선택 항목을 확인하세요.';
  if (code === 'network') return '네트워크에 연결되지 않았습니다. Wi‑Fi·데이터를 확인하세요.';
  return '검색에 실패했습니다.';
}

// ─── Direct Last.fm API (Standalone APK / IPA) ───────────────────────────────

const LASTFM_API = 'https://ws.audioscrobbler.com/2.0/';

function pickLastfmImage(images: { '#text'?: string; size?: string }[] | undefined): string {
  if (!Array.isArray(images)) return '';
  let large = '';
  let medium = '';
  for (const img of images) {
    const url = img['#text'] ?? '';
    const size = img.size ?? '';
    if (size === 'extralarge' || size === 'large') large = url;
    else if (size === 'medium') medium = url;
  }
  return large || medium;
}

function arrayOrSingle<T>(node: T | T[] | undefined | null): T[] {
  if (node == null) return [];
  return Array.isArray(node) ? node : [node];
}

function stripHtml(html: string | undefined): string {
  if (!html) return '';
  return html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
}

function parseLong(raw: string | number | undefined): number {
  const n = parseInt(String(raw ?? '0').replace(',', ''), 10);
  return isNaN(n) ? 0 : n;
}

async function lastfmGet(
  params: Record<string, string>,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; errorCode: LastfmSearchErrorCode; message: string }> {
  try {
    const qs = new URLSearchParams({ ...params, format: 'json' });
    const res = await fetch(`${LASTFM_API}?${qs.toString()}`);
    if (!res.ok) {
      return { ok: false, errorCode: 'unknown', message: messageForError('unknown') };
    }
    const root = (await res.json()) as Record<string, unknown>;
    if (typeof root.error === 'number') {
      const code = root.error as number;
      if (code === 10 || code === 4 || code === 26) {
        return { ok: false, errorCode: 'auth_failed', message: messageForError('auth_failed') };
      }
      return { ok: false, errorCode: 'unknown', message: messageForError('unknown') };
    }
    return { ok: true, data: root };
  } catch {
    return { ok: false, errorCode: 'network', message: messageForError('network') };
  }
}

function mapTags(tagNode: unknown): LastfmTag[] {
  return arrayOrSingle(tagNode as Record<string, unknown>[] | undefined).flatMap((n) => {
    const name = String(n?.name ?? '');
    return name ? [{ name, url: String(n?.url ?? '') }] : [];
  });
}

async function searchLastfmArtistsDirect(
  apiKey: string,
  query: string,
): Promise<LastfmSearchOutcome<{ artists: LastfmArtistSearchHit[] }>> {
  const r = await lastfmGet({ api_key: apiKey, method: 'artist.search', artist: query, limit: '20' });
  if (!r.ok) return r;
  const nodes = arrayOrSingle(
    ((r.data.results as Record<string, unknown>)?.artistmatches as Record<string, unknown>)?.artist as Record<string, unknown> | Record<string, unknown>[] | undefined,
  );
  const artists: LastfmArtistSearchHit[] = nodes.map((n) => ({
    name: String(n.name ?? ''),
    mbid: String(n.mbid ?? ''),
    url: String(n.url ?? ''),
    imageUrl: pickLastfmImage(n.image as { '#text'?: string; size?: string }[] | undefined),
    listeners: parseLong(n.listeners as string | undefined),
  }));
  return { ok: true, data: { artists } };
}

async function fetchLastfmArtistDetailDirect(
  apiKey: string,
  name: string,
  mbid?: string,
): Promise<LastfmSearchOutcome<LastfmArtistDetail>> {
  const infoParams: Record<string, string> = { api_key: apiKey, method: 'artist.getInfo', artist: name };
  if (mbid?.trim()) infoParams.mbid = mbid.trim();
  const [infoR, simR, topTR, topAR, tagsR] = await Promise.all([
    lastfmGet(infoParams),
    lastfmGet({ api_key: apiKey, method: 'artist.getSimilar', artist: name, limit: '12' }),
    lastfmGet({ api_key: apiKey, method: 'artist.getTopTracks', artist: name, limit: '10' }),
    lastfmGet({ api_key: apiKey, method: 'artist.getTopAlbums', artist: name, limit: '10' }),
    lastfmGet({ api_key: apiKey, method: 'artist.getTopTags', artist: name, limit: '15' }),
  ]);
  if (!infoR.ok) return infoR;
  const artist = infoR.data.artist as Record<string, unknown>;
  const bio = String(
    (artist.bio as Record<string, string> | undefined)?.summary ||
    (artist.bio as Record<string, string> | undefined)?.content || '',
  );
  const stats = artist.stats as Record<string, string> | undefined;
  const info = {
    name: String(artist.name ?? name),
    mbid: String(artist.mbid ?? ''),
    url: String(artist.url ?? ''),
    imageUrl: pickLastfmImage(artist.image as { '#text'?: string; size?: string }[] | undefined),
    bioSummary: stripHtml(bio),
    listeners: parseLong(stats?.listeners),
    playcount: parseLong(stats?.playcount),
    onTour: artist.ontour === '1',
  };
  const similarArtists = arrayOrSingle(
    simR.ok ? (simR.data.similarartists as Record<string, unknown>)?.artist as Record<string, unknown>[] | undefined : undefined,
  ).map((n) => ({ name: String(n.name ?? ''), url: String(n.url ?? ''), imageUrl: pickLastfmImage(n.image as { '#text'?: string; size?: string }[] | undefined) }));
  let tr = 1;
  const topTracks = arrayOrSingle(
    topTR.ok ? (topTR.data.toptracks as Record<string, unknown>)?.track as Record<string, unknown>[] | undefined : undefined,
  ).map((n) => {
    const rankAttr = (n['@attr'] as Record<string, string> | undefined)?.rank;
    const rank = parseInt(String(rankAttr ?? '0'), 10) || tr++;
    const artists = typeof n.artist === 'object' && n.artist
      ? String((n.artist as Record<string, string>).name ?? '')
      : String(n.artist ?? '');
    return { name: String(n.name ?? ''), artist: artists, url: String(n.url ?? ''), imageUrl: pickLastfmImage(n.image as { '#text'?: string; size?: string }[] | undefined), rank, playcount: parseLong(n.playcount as string | undefined) };
  });
  const topAlbums = arrayOrSingle(
    topAR.ok ? (topAR.data.topalbums as Record<string, unknown>)?.album as Record<string, unknown>[] | undefined : undefined,
  ).map((n) => ({
    name: String(n.name ?? ''),
    artist: String((n.artist as Record<string, string> | undefined)?.name ?? ''),
    url: String(n.url ?? ''),
    imageUrl: pickLastfmImage(n.image as { '#text'?: string; size?: string }[] | undefined),
    playcount: parseLong(n.playcount as string | undefined),
  }));
  const tags = tagsR.ok ? mapTags((tagsR.data.toptags as Record<string, unknown>)?.tag) : [];
  return { ok: true, data: { info, similarArtists, topTracks, topAlbums, tags } };
}

async function searchLastfmAlbumsDirect(
  apiKey: string,
  query: string,
): Promise<LastfmSearchOutcome<{ albums: LastfmAlbumSearchHit[] }>> {
  const r = await lastfmGet({ api_key: apiKey, method: 'album.search', album: query, limit: '20' });
  if (!r.ok) return r;
  const nodes = arrayOrSingle(
    ((r.data.results as Record<string, unknown>)?.albummatches as Record<string, unknown>)?.album as Record<string, unknown>[] | undefined,
  );
  const albums: LastfmAlbumSearchHit[] = nodes.map((n) => ({
    name: String(n.name ?? ''),
    artist: String(n.artist ?? ''),
    mbid: String(n.mbid ?? ''),
    url: String(n.url ?? ''),
    imageUrl: pickLastfmImage(n.image as { '#text'?: string; size?: string }[] | undefined),
  }));
  return { ok: true, data: { albums } };
}

async function fetchLastfmAlbumDetailDirect(
  apiKey: string,
  artist: string,
  album: string,
): Promise<LastfmSearchOutcome<LastfmAlbumDetail>> {
  const [infoR, tagsR] = await Promise.all([
    lastfmGet({ api_key: apiKey, method: 'album.getInfo', artist, album }),
    lastfmGet({ api_key: apiKey, method: 'album.getTags', artist, album }).catch(() => ({ ok: false as const, errorCode: 'unknown' as const, message: '' })),
  ]);
  if (!infoR.ok) return infoR;
  const albumNode = infoR.data.album as Record<string, unknown>;
  const wiki = String(
    (albumNode.wiki as Record<string, string> | undefined)?.summary ||
    (albumNode.wiki as Record<string, string> | undefined)?.content || '',
  );
  let ti = 1;
  const tracks = arrayOrSingle(
    (albumNode.tracks as Record<string, unknown>)?.track as Record<string, unknown>[] | undefined,
  ).map((t) => ({
    name: String(t.name ?? ''),
    rank: parseInt(String((t['@attr'] as Record<string, string> | undefined)?.rank ?? '0'), 10) || ti++,
    durationSec: parseInt(String(t.duration ?? '0'), 10),
  }));
  const info = {
    name: String(albumNode.name ?? album),
    artist: String(albumNode.artist ?? artist),
    mbid: String(albumNode.mbid ?? ''),
    url: String(albumNode.url ?? ''),
    imageUrl: pickLastfmImage(albumNode.image as { '#text'?: string; size?: string }[] | undefined),
    listeners: parseLong((albumNode.listeners as string | undefined)),
    playcount: parseLong((albumNode.playcount as string | undefined)),
    published: String((albumNode.releasedate as string | undefined) ?? ''),
    wikiSummary: stripHtml(wiki),
    tracks,
  };
  const tags = tagsR.ok ? mapTags((tagsR.data.tags as Record<string, unknown>)?.tag) : mapTags((albumNode.tags as Record<string, unknown>)?.tag);
  return { ok: true, data: { info, tags } };
}

async function searchLastfmTracksDirect(
  apiKey: string,
  query: string,
): Promise<LastfmSearchOutcome<{ tracks: LastfmTrackSearchHit[] }>> {
  const r = await lastfmGet({ api_key: apiKey, method: 'track.search', track: query, limit: '20' });
  if (!r.ok) return r;
  const nodes = arrayOrSingle(
    ((r.data.results as Record<string, unknown>)?.trackmatches as Record<string, unknown>)?.track as Record<string, unknown>[] | undefined,
  );
  const tracks: LastfmTrackSearchHit[] = nodes.map((n) => ({
    name: String(n.name ?? ''),
    artist: String(n.artist ?? ''),
    url: String(n.url ?? ''),
    imageUrl: pickLastfmImage(n.image as { '#text'?: string; size?: string }[] | undefined),
  }));
  return { ok: true, data: { tracks } };
}

async function fetchLastfmTrackDetailDirect(
  apiKey: string,
  artist: string,
  track: string,
): Promise<LastfmSearchOutcome<LastfmTrackDetail>> {
  const [infoR, simR, tagsR] = await Promise.all([
    lastfmGet({ api_key: apiKey, method: 'track.getInfo', artist, track }),
    lastfmGet({ api_key: apiKey, method: 'track.getSimilar', artist, track, limit: '12' }),
    lastfmGet({ api_key: apiKey, method: 'track.getTopTags', artist, track, limit: '15' }),
  ]);
  if (!infoR.ok) return infoR;
  const trackNode = infoR.data.track as Record<string, unknown>;
  const albumNode = trackNode.album as Record<string, unknown> | undefined;
  const info = {
    name: String(trackNode.name ?? track),
    artist: String((trackNode.artist as Record<string, string> | undefined)?.name ?? artist),
    album: String(albumNode?.title ?? ''),
    url: String(trackNode.url ?? ''),
    imageUrl: pickLastfmImage(albumNode?.image as { '#text'?: string; size?: string }[] | undefined),
    durationSec: Math.floor(parseInt(String(trackNode.duration ?? '0'), 10) / 1000),
    playcount: parseLong(trackNode.playcount as string | undefined),
    listeners: parseLong(trackNode.listeners as string | undefined),
  };
  let sr = 1;
  const similarTracks = arrayOrSingle(
    simR.ok ? (simR.data.similartracks as Record<string, unknown>)?.track as Record<string, unknown>[] | undefined : undefined,
  ).map((n) => {
    const rankAttr = (n['@attr'] as Record<string, string> | undefined)?.rank;
    const rank = parseInt(String(rankAttr ?? '0'), 10) || sr++;
    const artists = typeof n.artist === 'object' && n.artist
      ? String((n.artist as Record<string, string>).name ?? '')
      : String(n.artist ?? '');
    return { name: String(n.name ?? ''), artist: artists, url: String(n.url ?? ''), imageUrl: pickLastfmImage(n.image as { '#text'?: string; size?: string }[] | undefined), rank, playcount: parseLong(n.playcount as string | undefined) };
  });
  const tags = tagsR.ok ? mapTags((tagsR.data.toptags as Record<string, unknown>)?.tag) : [];
  return { ok: true, data: { info, similarTracks, tags } };
}

async function getLastfmApiKey(): Promise<string | null> {
  const auth = await buildLastfmChartAuthHeaders();
  if ('error' in auth) return null;
  const h = auth.headers as Record<string, string>;
  return h['X-NRM-Lastfm-Api-Key'] ?? h.Authorization?.replace(/^Bearer\s+/i, '').trim() ?? null;
}

// ─── Backend proxy (Dev / Expo Go) ───────────────────────────────────────────

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

// ─── Public exports ───────────────────────────────────────────────────────────

export async function searchLastfmArtists(
  query: string,
): Promise<LastfmSearchOutcome<{ artists: LastfmArtistSearchHit[] }>> {
  if (isStandaloneApp()) {
    const apiKey = await getLastfmApiKey();
    if (!apiKey) return { ok: false, errorCode: 'not_configured', message: messageForError('not_configured') };
    return searchLastfmArtistsDirect(apiKey, query.trim());
  }
  const q = encodeURIComponent(query.trim());
  return fetchLastfmSearch(`/api/search/lastfm/artist?q=${q}`);
}

export async function fetchLastfmArtistDetail(
  artist: string,
  mbid?: string,
): Promise<LastfmSearchOutcome<LastfmArtistDetail>> {
  if (isStandaloneApp()) {
    const apiKey = await getLastfmApiKey();
    if (!apiKey) return { ok: false, errorCode: 'not_configured', message: messageForError('not_configured') };
    return fetchLastfmArtistDetailDirect(apiKey, artist.trim(), mbid);
  }
  const a = encodeURIComponent(artist.trim());
  const mbidQ = mbid?.trim() ? `&mbid=${encodeURIComponent(mbid.trim())}` : '';
  return fetchLastfmSearch(`/api/search/lastfm/artist/detail?artist=${a}${mbidQ}`);
}

export async function searchLastfmAlbums(
  query: string,
): Promise<LastfmSearchOutcome<{ albums: LastfmAlbumSearchHit[] }>> {
  if (isStandaloneApp()) {
    const apiKey = await getLastfmApiKey();
    if (!apiKey) return { ok: false, errorCode: 'not_configured', message: messageForError('not_configured') };
    return searchLastfmAlbumsDirect(apiKey, query.trim());
  }
  const q = encodeURIComponent(query.trim());
  return fetchLastfmSearch(`/api/search/lastfm/album?q=${q}`);
}

export async function fetchLastfmAlbumDetail(
  artist: string,
  album: string,
): Promise<LastfmSearchOutcome<LastfmAlbumDetail>> {
  if (isStandaloneApp()) {
    const apiKey = await getLastfmApiKey();
    if (!apiKey) return { ok: false, errorCode: 'not_configured', message: messageForError('not_configured') };
    return fetchLastfmAlbumDetailDirect(apiKey, artist.trim(), album.trim());
  }
  const a = encodeURIComponent(artist.trim());
  const al = encodeURIComponent(album.trim());
  return fetchLastfmSearch(
    `/api/search/lastfm/album/detail?artist=${a}&album=${al}`,
  );
}

export async function searchLastfmTracks(
  query: string,
): Promise<LastfmSearchOutcome<{ tracks: LastfmTrackSearchHit[] }>> {
  if (isStandaloneApp()) {
    const apiKey = await getLastfmApiKey();
    if (!apiKey) return { ok: false, errorCode: 'not_configured', message: messageForError('not_configured') };
    return searchLastfmTracksDirect(apiKey, query.trim());
  }
  const q = encodeURIComponent(query.trim());
  return fetchLastfmSearch(`/api/search/lastfm/track?q=${q}`);
}

export async function fetchLastfmTrackDetail(
  artist: string,
  track: string,
): Promise<LastfmSearchOutcome<LastfmTrackDetail>> {
  if (isStandaloneApp()) {
    const apiKey = await getLastfmApiKey();
    if (!apiKey) return { ok: false, errorCode: 'not_configured', message: messageForError('not_configured') };
    return fetchLastfmTrackDetailDirect(apiKey, artist.trim(), track.trim());
  }
  const a = encodeURIComponent(artist.trim());
  const t = encodeURIComponent(track.trim());
  return fetchLastfmSearch(
    `/api/search/lastfm/track/detail?artist=${a}&track=${t}`,
  );
}
