export class LastfmContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LastfmContractError";
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type LastfmArtistMethod =
  | "geo.getTopArtists"
  | "chart.getTopArtists"
  | "tag.getTopArtists";

export type LastfmTrackMethod =
  | "geo.getTopTracks"
  | "chart.getTopTracks"
  | "tag.getTopTracks";

export type LastfmMethod = LastfmArtistMethod | LastfmTrackMethod;

export interface LastfmTopArtist {
  rank: number;
  name: string;
  mbid: string | null;
  playcount: number | null;
  listeners: number | null;
}

export interface LastfmTopArtistsPage {
  method: LastfmArtistMethod;
  param: string | null;
  artists: LastfmTopArtist[];
}

export interface LastfmTopTrack {
  rank: number;
  title: string;
  artistName: string;
  mbid: string | null;
  artistMbid: string | null;
  playcount: number | null;
  listeners: number | null;
}

export interface LastfmTopTracksPage {
  method: LastfmTrackMethod;
  param: string | null;
  page: number;
  pageSize: number;
  totalPages: number | null;
  total: number | null;
  tracks: LastfmTopTrack[];
}

export interface LastfmTrackTag {
  name: string;
  count: number;
}

export interface LastfmTrackTopTags {
  tags: LastfmTrackTag[];
  returnedMbid: string | null;
  returnedTrackName: string | null;
  returnedArtistName: string | null;
}

const LASTFM_NOISE_TAGS = new Set([
  "personal",
  "seen live",
  "favourite",
  "favorite",
  "favorites",
  "favourites",
  "albums i own",
  "awesome",
  "love",
  "sexy",
  "beautiful",
  "guilty pleasure",
  "under 2 minutes",
  "songs i know",
  "check out",
  "heard on pandora",
  "my music",
  "best",
  "good",
  "amazing",
  "cool",
  "nice",
  "wow",
  "fuck",
  "shit",
]);

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new LastfmContractError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function normalizeMbid(value: unknown): string | null {
  const text = asString(value);
  if (!text || !UUID_RE.test(text)) return null;
  return text.toLowerCase();
}

export function normalizeLastfmGeoCountry(country: string): string {
  const trimmed = country.trim();
  const folded = trimmed.toLowerCase().replace(/\s+/g, " ");
  const aliases: Record<string, string> = {
    "south korea": "Korea, Republic of",
    "republic of korea": "Korea, Republic of",
    korea: "Korea, Republic of",
    kr: "Korea, Republic of",
    "korea (the republic of)": "Korea, Republic of",
    "korea, republic of": "Korea, Republic of",
  };
  return aliases[folded] ?? trimmed;
}

export function normalizeLastfmTagName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export function catalogIdentityKey(artistName: string, trackTitle: string): string {
  const material = `${normalizeLastfmTagName(artistName)}\u001f${normalizeLastfmTagName(trackTitle)}`;
  return material;
}

const LASTFM_HANGUL_RE = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7A3]/;
const LASTFM_KANA_RE = /[\u3040-\u30FF]/;
const LASTFM_KOREAN_TAG_RE =
  /\bk[\s-]?pop\b|\bkpop\b|\bkorean\b|\bk[\s-]?rap\b|\bk[\s-]?hip[\s-]?hop\b|\bkorean hip[\s-]?hop\b|\bk[\s-]?r&b\b|\bk[\s-]?rnb\b|\btrot\b|\bk[\s-]?indie\b|\bk[\s-]?ballad\b|\bk[\s-]?rock\b|\bk[\s-]?soul\b/;
const LASTFM_HIPHOP_TAG_RE =
  /\bhip[\s-]?hop\b|\brap\b|\btrap\b|\bgrime\b|\bk[\s-]?rap\b|\bkorean hip[\s-]?hop\b/;
const LASTFM_JAPANESE_TAG_RE = /\bj[\s-]?pop\b|\bjpop\b|\bj[\s-]?rap\b|\bj[\s-]?rock\b|\bjapanese\b/;

export type LastfmListCheapVerdict = "korean" | "not_korean" | "need_tags";
export type LastfmListKeepDecision = "keep" | "drop" | "need_tags";

export function lastfmTextHasHangul(value: string | null | undefined): boolean {
  return typeof value === "string" && LASTFM_HANGUL_RE.test(value);
}

export function lastfmTextHasKana(value: string | null | undefined): boolean {
  return typeof value === "string" && LASTFM_KANA_RE.test(value);
}

export function lastfmCheapKoreanVerdict(
  artistName: string,
  trackTitle: string,
): LastfmListCheapVerdict {
  if (lastfmTextHasHangul(artistName) || lastfmTextHasHangul(trackTitle)) return "korean";
  if (lastfmTextHasKana(artistName) || lastfmTextHasKana(trackTitle)) return "not_korean";
  return "need_tags";
}

export function lastfmTagsLookKorean(tags: LastfmTrackTag[]): boolean {
  return tags.some((tag) => LASTFM_KOREAN_TAG_RE.test(normalizeLastfmTagName(tag.name)));
}

export function lastfmTagsLookHipHop(tags: LastfmTrackTag[]): boolean {
  return tags.some((tag) => LASTFM_HIPHOP_TAG_RE.test(normalizeLastfmTagName(tag.name)));
}

export function lastfmTagsLookJapanese(tags: LastfmTrackTag[]): boolean {
  return tags.some((tag) => LASTFM_JAPANESE_TAG_RE.test(normalizeLastfmTagName(tag.name)));
}

export function lastfmCatalogSourceIsHipHop(
  method: LastfmTrackMethod,
  param: string | null,
): boolean {
  if (method !== "tag.getTopTracks" || !param) return false;
  return LASTFM_HIPHOP_TAG_RE.test(normalizeLastfmTagName(param));
}

export function lastfmCatalogRequiresHipHop(scheduleKey: string): boolean {
  return scheduleKey === "musicbrainz-lastfm-korean-hiphop-catalog" ||
    scheduleKey === "musicbrainz-lastfm-hiphop-catalog" ||
    scheduleKey === "musicbrainz-lastfm-korean-hiphop-top" ||
    scheduleKey === "musicbrainz-lastfm-hiphop-top";
}

export function decideLastfmCatalogTrack(input: {
  regionPolicy: "korean_only" | "exclude_korean" | "unfiltered";
  requireHipHop: boolean;
  cheap: LastfmListCheapVerdict;
  tags: LastfmTrackTag[] | null;
}): LastfmListKeepDecision {
  const { regionPolicy, requireHipHop, cheap, tags } = input;
  if (regionPolicy === "unfiltered" && !requireHipHop) return "keep";
  if (regionPolicy === "korean_only" && cheap === "not_korean") return "drop";
  if (regionPolicy === "exclude_korean" && cheap === "korean") return "drop";
  if (tags == null) {
    if (regionPolicy === "korean_only" && cheap === "need_tags") return "need_tags";
    if (requireHipHop) return "need_tags";
  }
  const korean = cheap === "korean" || (tags != null && lastfmTagsLookKorean(tags));
  const japanese = tags != null && lastfmTagsLookJapanese(tags);
  if (regionPolicy === "korean_only") {
    if (!korean || japanese) return "drop";
  } else if (regionPolicy === "exclude_korean") {
    if (korean) return "drop";
  }
  if (requireHipHop && tags != null && !lastfmTagsLookHipHop(tags)) return "drop";
  return "keep";
}

function lastfmBaseParams(apiKey: string, method: string): Record<string, string> {
  if (!apiKey || apiKey.length < 16) {
    throw new LastfmContractError("LASTFM_API_KEY is missing or too short");
  }
  return {
    method,
    api_key: apiKey,
    format: "json",
  };
}

function applyChartParam(
  params: Record<string, string>,
  method: LastfmMethod,
  param: string | null,
): void {
  if (method === "geo.getTopArtists" || method === "geo.getTopTracks") {
    if (!param) throw new LastfmContractError(`${method} requires country`);
    params.country = normalizeLastfmGeoCountry(param);
  } else if (method === "tag.getTopArtists" || method === "tag.getTopTracks") {
    if (!param) throw new LastfmContractError(`${method} requires tag`);
    params.tag = param;
  } else if (param != null && param !== "") {
    throw new LastfmContractError(`${method} does not accept a param`);
  }
}

/** 앱 차트 조회와 동일: encodeURIComponent, 공백은 %20 (URLSearchParams의 + 아님). */
export function buildLastfmUrl(params: Record<string, string>): URL {
  const qs = Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
  return new URL(`https://ws.audioscrobbler.com/2.0/?${qs}`);
}

export function artistMethodToTrackMethod(method: LastfmArtistMethod): LastfmTrackMethod {
  if (method === "geo.getTopArtists") return "geo.getTopTracks";
  if (method === "chart.getTopArtists") return "chart.getTopTracks";
  return "tag.getTopTracks";
}

export function uniqueArtistsFromTopTracks(
  tracks: LastfmTopTrack[],
  limit: number,
): LastfmTopArtist[] {
  const artists: LastfmTopArtist[] = [];
  const seen = new Set<string>();
  for (const track of tracks) {
    const key = track.artistName.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    artists.push({
      rank: artists.length + 1,
      name: track.artistName,
      mbid: track.artistMbid,
      playcount: track.playcount,
      listeners: track.listeners,
    });
    if (artists.length >= limit) break;
  }
  return artists;
}

export function buildLastfmTopArtistsUrl(
  apiKey: string,
  method: LastfmArtistMethod,
  param: string | null,
  limit: number,
): URL {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    throw new LastfmContractError("invalid Last.fm artist limit");
  }
  const params = lastfmBaseParams(apiKey, method);
  params.limit = String(limit);
  params.page = "1";
  applyChartParam(params, method, param);
  return buildLastfmUrl(params);
}

export function buildLastfmTopTracksUrl(
  apiKey: string,
  method: LastfmTrackMethod,
  param: string | null,
  page: number,
  limit: number,
): URL {
  if (!Number.isInteger(page) || page < 1 || page > 2000) {
    throw new LastfmContractError("invalid Last.fm track page");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new LastfmContractError("invalid Last.fm track page size");
  }
  const params = lastfmBaseParams(apiKey, method);
  params.page = String(page);
  params.limit = String(limit);
  applyChartParam(params, method, param);
  return buildLastfmUrl(params);
}

export function buildLastfmArtistTopTagsUrl(
  apiKey: string,
  options: { mbid?: string | null; artist?: string | null },
): URL {
  const params = lastfmBaseParams(apiKey, "artist.getTopTags");
  const mbid = options.mbid ? normalizeMbid(options.mbid) : null;
  if (mbid) {
    params.mbid = mbid;
    return buildLastfmUrl(params);
  }
  const artist = asString(options.artist);
  if (!artist) {
    throw new LastfmContractError("artist.getTopTags requires mbid or artist");
  }
  params.artist = artist;
  params.autocorrect = "0";
  return buildLastfmUrl(params);
}

export function buildLastfmTrackTopTagsUrl(
  apiKey: string,
  options: { mbid?: string | null; artist?: string | null; track?: string | null },
): URL {
  const params = lastfmBaseParams(apiKey, "track.getTopTags");
  const mbid = options.mbid ? normalizeMbid(options.mbid) : null;
  if (mbid) {
    params.mbid = mbid;
    return buildLastfmUrl(params);
  }
  const artist = asString(options.artist);
  const track = asString(options.track);
  if (!artist || !track) {
    throw new LastfmContractError("track.getTopTags requires mbid or artist+track");
  }
  params.artist = artist;
  params.track = track;
  params.autocorrect = "0";
  return buildLastfmUrl(params);
}

export function parseLastfmTopArtists(
  value: unknown,
  method: LastfmArtistMethod,
  param: string | null,
  limit: number,
): LastfmTopArtistsPage {
  const root = asObject(value, "lastfm response");
  if (root.error != null) {
    throw new LastfmContractError(
      `Last.fm API error ${String(root.error)}: ${asString(root.message) ?? "unknown"}`,
    );
  }
  const containerKey = method === "chart.getTopArtists" ? "artists" : "topartists";
  const container = asObject(root[containerKey], containerKey);
  const raw = container.artist;
  const list = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
  const artists: LastfmTopArtist[] = [];
  for (let index = 0; index < list.length && artists.length < limit; index += 1) {
    const item = asObject(list[index], `artist[${index}]`);
    const name = asString(item.name);
    if (!name) continue;
    const attrs = item["@attr"];
    const rankFromAttr = attrs && typeof attrs === "object" && !Array.isArray(attrs)
      ? asNumber((attrs as Record<string, unknown>).rank)
      : null;
    artists.push({
      rank: rankFromAttr != null && Number.isInteger(rankFromAttr) && rankFromAttr >= 1
        ? Math.min(rankFromAttr, 5000)
        : artists.length + 1,
      name,
      mbid: normalizeMbid(item.mbid),
      playcount: asNumber(item.playcount),
      listeners: asNumber(item.listeners),
    });
  }
  return { method, param, artists };
}

export function parseLastfmTopTracks(
  value: unknown,
  method: LastfmTrackMethod,
  param: string | null,
  page: number,
  limit: number,
): LastfmTopTracksPage {
  const root = asObject(value, "lastfm response");
  if (root.error != null) {
    throw new LastfmContractError(
      `Last.fm API error ${String(root.error)}: ${asString(root.message) ?? "unknown"}`,
    );
  }
  const container = root.toptracks != null
    ? asObject(root.toptracks, "toptracks")
    : asObject(root.tracks, "tracks");
  const raw = container.track;
  const list = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
  const tracks: LastfmTopTrack[] = [];
  for (let index = 0; index < list.length && tracks.length < limit; index += 1) {
    const item = asObject(list[index], `track[${index}]`);
    const title = asString(item.name);
    const artistValue = item.artist;
    const artist = artistValue == null || typeof artistValue === "string"
      ? { name: asString(artistValue), mbid: null as string | null }
      : (() => {
        const artistObject = asObject(artistValue, `track[${index}].artist`);
        return {
          name: asString(artistObject.name),
          mbid: normalizeMbid(artistObject.mbid),
        };
      })();
    if (!title || !artist.name) continue;
    const attrs = item["@attr"];
    const rankFromAttr = attrs && typeof attrs === "object" && !Array.isArray(attrs)
      ? asNumber((attrs as Record<string, unknown>).rank)
      : null;
    const fallbackRank = (page - 1) * limit + tracks.length + 1;
    tracks.push({
      rank: rankFromAttr != null && Number.isInteger(rankFromAttr) && rankFromAttr >= 1
        ? Math.min(rankFromAttr, 5000)
        : fallbackRank,
      title,
      artistName: artist.name,
      mbid: normalizeMbid(item.mbid),
      artistMbid: artist.mbid,
      playcount: asNumber(item.playcount),
      listeners: asNumber(item.listeners),
    });
  }
  const pageAttr = container["@attr"];
  const attr = pageAttr && typeof pageAttr === "object" && !Array.isArray(pageAttr)
    ? pageAttr as Record<string, unknown>
    : {};
  return {
    method,
    param,
    page: asNumber(attr.page) ?? page,
    pageSize: asNumber(attr.perPage) ?? limit,
    totalPages: asNumber(attr.totalPages),
    total: asNumber(attr.total),
    tracks,
  };
}

export function parseLastfmTrackTopTags(value: unknown): LastfmTrackTopTags {
  const root = asObject(value, "lastfm response");
  if (root.error != null) {
    throw new LastfmContractError(
      `Last.fm API error ${String(root.error)}: ${asString(root.message) ?? "unknown"}`,
    );
  }
  const container = asObject(root.toptags, "toptags");
  const raw = container.tag;
  const list = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
  if (list.length > 200) {
    throw new LastfmContractError("Last.fm tag list exceeds parser cap");
  }
  const tags: LastfmTrackTag[] = [];
  for (let index = 0; index < list.length; index += 1) {
    const item = asObject(list[index], `tag[${index}]`);
    const name = asString(item.name);
    const count = asNumber(item.count);
    if (!name || count == null || count < 0) continue;
    tags.push({ name, count });
  }
  const attr = container["@attr"];
  const meta = attr && typeof attr === "object" && !Array.isArray(attr)
    ? attr as Record<string, unknown>
    : {};
  return {
    tags,
    returnedMbid: normalizeMbid(meta.mbid),
    returnedTrackName: asString(meta.track),
    returnedArtistName: asString(meta.artist),
  };
}

export interface LastfmSelectedTag {
  sourceTagName: string;
  canonicalName: string;
  normalizedName: string;
  weightedCount: number;
  normalizedWeight: number;
  category: "personal" | "noise" | "unknown";
  embeddingEnabled: boolean;
}

export function selectLastfmVectorTags(tags: LastfmTrackTag[]): LastfmSelectedTag[] {
  const collapsed = new Map<string, {
    sourceTagName: string;
    canonicalName: string;
    weightedCount: number;
  }>();
  for (const tag of tags) {
    const canonicalName = tag.name.normalize("NFKC").trim().replace(/\s+/g, " ");
    if (!canonicalName || canonicalName.length > 80) continue;
    if (/[\u0000-\u001f]/.test(canonicalName)) continue;
    const normalizedName = canonicalName.toLowerCase();
    const existing = collapsed.get(normalizedName);
    if (!existing || tag.count > existing.weightedCount) {
      collapsed.set(normalizedName, {
        sourceTagName: tag.name,
        canonicalName,
        weightedCount: tag.count,
      });
    }
  }
  const ranked = [...collapsed.entries()]
    .map(([normalizedName, value]) => {
      const isNoise = LASTFM_NOISE_TAGS.has(normalizedName);
      return {
        sourceTagName: value.sourceTagName,
        canonicalName: value.canonicalName,
        normalizedName,
        weightedCount: value.weightedCount,
        category: (isNoise ? "noise" : "unknown") as LastfmSelectedTag["category"],
        embeddingEnabled: !isNoise,
      };
    })
    .filter((tag) => tag.embeddingEnabled)
    .sort((a, b) =>
      b.weightedCount - a.weightedCount ||
      a.normalizedName.localeCompare(b.normalizedName, "en", { sensitivity: "variant" })
    )
    .slice(0, 20);
  const weightSum = ranked.reduce((sum, tag) => sum + tag.weightedCount, 0) || 1;
  return ranked.map((tag) => ({
    ...tag,
    normalizedWeight: tag.weightedCount / weightSum,
  }));
}

export function assertAllowedLastfmUrl(url: string): void {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "ws.audioscrobbler.com" ||
    parsed.pathname !== "/2.0/"
  ) {
    throw new LastfmContractError("Last.fm response URL escaped allowed origin");
  }
}
