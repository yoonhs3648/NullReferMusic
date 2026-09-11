export const MB_BASE_URL = "https://musicbrainz.org/ws/2/";
export const MB_MAX_REDIRECTS = 16;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DATE_RE = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;

export class ContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContractError";
  }
}

type JsonObject = Record<string, unknown>;

export interface ArtistCredit {
  artist_mbid: string;
  name: string;
  sort_name: string | null;
  credited_name: string;
  join_phrase: string;
}

export interface TagValue {
  name: string;
  count: number;
}

export interface GenreValue {
  id: string;
  name: string;
  count: number;
}

export interface DiscoveryCandidate {
  release_mbid: string;
  release_group_mbid: string | null;
  title: string;
  release_date_text: string | null;
  release_status: string | null;
  country_code: string | null;
  primary_type: string | null;
  secondary_types: string[];
}

export interface ParsedSearchPage {
  totalCount: number;
  offset: number;
  candidates: DiscoveryCandidate[];
}

export interface ReleaseEvent {
  date: string | null;
  country: string | null;
}

export interface ReleaseSummary {
  mbid: string;
  title: string;
  status: string | null;
  date: string | null;
  country: string | null;
  trackCount: number;
}

export interface ParsedReleaseGroup {
  mbid: string;
  title: string;
  disambiguation: string | null;
  primaryType: string | null;
  secondaryTypes: string[];
  firstReleaseDate: string | null;
  artistCredit: ArtistCredit[];
  tags: TagValue[];
  genres: GenreValue[];
}

export interface ParsedRecordingReleaseHint {
  mbid: string;
  title: string;
  status: string | null;
  date: string | null;
  country: string | null;
}

export interface ParsedRecording {
  mbid: string;
  title: string;
  disambiguation: string | null;
  lengthMs: number | null;
  video: boolean;
  firstReleaseDate: string | null;
  artistCredit: ArtistCredit[];
  isrcs: string[];
  tags: TagValue[];
  genres: GenreValue[];
  releases: ParsedRecordingReleaseHint[];
}

export interface ParsedRecordingSearchHit {
  mbid: string;
  title: string;
  artistName: string;
  score: number;
}

export interface ParsedTrack {
  mbid: string;
  position: number;
  number: string;
  title: string;
  lengthMs: number | null;
  artistCredit: ArtistCredit[];
  recording: ParsedRecording;
}

export interface ParsedMedium {
  position: number;
  title: string | null;
  format: string | null;
  tracks: ParsedTrack[];
}

export interface ParsedRelease {
  mbid: string;
  title: string;
  status: string | null;
  quality: string | null;
  packaging: string | null;
  country: string | null;
  date: string | null;
  barcode: string | null;
  textLanguage: string | null;
  textScript: string | null;
  releaseGroupMbid: string;
  artistCredit: ArtistCredit[];
  events: ReleaseEvent[];
  media: ParsedMedium[];
  tags: TagValue[];
  genres: GenreValue[];
}

function object(value: unknown, label: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ContractError(`${label} must be an object`);
  }
  return value as JsonObject;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new ContractError(`${label} must be an array`);
  return value;
}

function text(value: unknown, label: string, nullable = false): string | null {
  if (value == null && nullable) return null;
  if (typeof value !== "string" || value.trim() === "" || value.length > 2000) {
    throw new ContractError(`${label} must be non-empty text`);
  }
  return value.trim();
}

function optionalText(value: unknown, label: string): string | null {
  if (value == null || value === "") return null;
  return text(value, label);
}

function integer(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new ContractError(`${label} must be an integer >= ${minimum}`);
  }
  return value as number;
}

export function uuid(value: unknown, label = "mbid"): string {
  const normalized = text(value, label)!.toLowerCase();
  if (!UUID_RE.test(normalized)) throw new ContractError(`${label} must be a UUID`);
  return normalized;
}

export function partialDate(value: unknown, label = "date", nullable = true): string | null {
  if (value == null || value === "") {
    if (nullable) return null;
    throw new ContractError(`${label} is required`);
  }
  const result = text(value, label)!;
  const match = DATE_RE.exec(result);
  if (!match) throw new ContractError(`${label} must be YYYY, YYYY-MM, or YYYY-MM-DD`);
  const year = Number(match[1]);
  const month = match[2] ? Number(match[2]) : 1;
  const day = match[3] ? Number(match[3]) : 1;
  if (year < 1 || month < 1 || month > 12) throw new ContractError(`${label} is invalid`);
  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > maxDay) throw new ContractError(`${label} is invalid`);
  return result;
}

export function coalescePartialDate(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (typeof value === "string" && value !== "") return value;
  }
  return null;
}

export function earliestPartialDate(values: Array<string | null | undefined>): string | null {
  const present = values.filter((value): value is string => typeof value === "string" && value !== "");
  if (present.length === 0) return null;
  return [...present].sort((a, b) => a.localeCompare(b))[0];
}

function hintPartialDate(value: unknown, label: string): string | null {
  try {
    return partialDate(value, label);
  } catch {
    return null;
  }
}

function parseArtistCredit(value: unknown, label: string): ArtistCredit[] {
  return array(value, label).map((entry, index) => {
    const item = object(entry, `${label}[${index}]`);
    const artist = object(item.artist, `${label}[${index}].artist`);
    return {
      artist_mbid: uuid(artist.id, `${label}[${index}].artist.id`),
      name: text(artist.name, `${label}[${index}].artist.name`)!,
      sort_name: optionalText(artist["sort-name"], `${label}[${index}].artist.sort-name`),
      credited_name: optionalText(item.name, `${label}[${index}].name`) ??
        text(artist.name, `${label}[${index}].artist.name`)!,
      join_phrase: typeof item.joinphrase === "string" ? item.joinphrase.slice(0, 100) : "",
    };
  });
}

function parseTags(value: unknown, label: string): TagValue[] {
  if (value == null) return [];
  return array(value, label).slice(0, 200).map((entry, index) => {
    const item = object(entry, `${label}[${index}]`);
    return {
      name: text(item.name, `${label}[${index}].name`)!.normalize("NFKC"),
      count: integer(item.count, `${label}[${index}].count`),
    };
  });
}

function parseGenres(value: unknown, label: string): GenreValue[] {
  if (value == null) return [];
  return array(value, label).slice(0, 200).map((entry, index) => {
    const item = object(entry, `${label}[${index}]`);
    return {
      id: uuid(item.id, `${label}[${index}].id`),
      name: text(item.name, `${label}[${index}].name`)!.normalize("NFKC"),
      count: integer(item.count, `${label}[${index}].count`),
    };
  });
}

function parseRecordingValue(value: unknown, label: string): ParsedRecording {
  const item = object(value, label);
  const length = item.length == null ? null : integer(item.length, `${label}.length`);
  const video = item.video == null ? false : item.video;
  if (typeof video !== "boolean") throw new ContractError(`${label}.video must be boolean`);
  const isrcs = item.isrcs == null
    ? []
    : array(item.isrcs, `${label}.isrcs`).map((entry, index) => {
      const result = text(entry, `${label}.isrcs[${index}]`)!.toUpperCase();
      if (!/^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/.test(result)) {
        throw new ContractError(`${label}.isrcs[${index}] is invalid`);
      }
      return result;
    });
  const releases = item.releases == null
    ? []
    : array(item.releases, `${label}.releases`).slice(0, 50).flatMap((entry, index) => {
      const release = object(entry, `${label}.releases[${index}]`);
      let mbid: string;
      try {
        mbid = uuid(release.id, `${label}.releases[${index}].id`);
      } catch {
        return [];
      }
      return [{
        mbid,
        title: optionalText(release.title, `${label}.releases[${index}].title`) ?? "",
        status: optionalText(release.status, `${label}.releases[${index}].status`),
        date: hintPartialDate(release.date, `${label}.releases[${index}].date`),
        country: optionalText(release.country, `${label}.releases[${index}].country`),
      }];
    });
  return {
    mbid: uuid(item.id, `${label}.id`),
    title: text(item.title, `${label}.title`)!,
    disambiguation: optionalText(item.disambiguation, `${label}.disambiguation`),
    lengthMs: length,
    video,
    firstReleaseDate: partialDate(item["first-release-date"], `${label}.first-release-date`),
    artistCredit: parseArtistCredit(item["artist-credit"], `${label}.artist-credit`),
    isrcs: [...new Set(isrcs)],
    tags: parseTags(item.tags, `${label}.tags`),
    genres: parseGenres(item.genres, `${label}.genres`),
    releases,
  };
}

export function parseReleaseSearchPage(value: unknown): ParsedSearchPage {
  const root = object(value, "search");
  const totalCount = integer(root.count, "search.count");
  const offset = integer(root.offset, "search.offset");
  const releases = array(root.releases, "search.releases");
  if (releases.length > 100) throw new ContractError("search.releases exceeds page limit");
  return {
    totalCount,
    offset,
    candidates: releases.map((entry, index) => {
      const item = object(entry, `search.releases[${index}]`);
      const group = item["release-group"] == null
        ? null
        : object(item["release-group"], `search.releases[${index}].release-group`);
      return {
        release_mbid: uuid(item.id, `search.releases[${index}].id`),
        release_group_mbid: group ? uuid(group.id, `search.releases[${index}].release-group.id`) : null,
        title: text(item.title, `search.releases[${index}].title`)!,
        release_date_text: partialDate(item.date, `search.releases[${index}].date`),
        release_status: optionalText(item.status, `search.releases[${index}].status`),
        country_code: optionalText(item.country, `search.releases[${index}].country`),
        primary_type: group ? optionalText(group["primary-type"], "release-group.primary-type") : null,
        secondary_types: group && group["secondary-types"] != null
          ? array(group["secondary-types"], "release-group.secondary-types").map((v, i) =>
            text(v, `release-group.secondary-types[${i}]`)!
          )
          : [],
      };
    }),
  };
}

export function parseReleaseGroup(value: unknown): ParsedReleaseGroup {
  const root = object(value, "release-group");
  return {
    mbid: uuid(root.id, "release-group.id"),
    title: text(root.title, "release-group.title")!,
    disambiguation: optionalText(root.disambiguation, "release-group.disambiguation"),
    primaryType: optionalText(root["primary-type"], "release-group.primary-type"),
    secondaryTypes: root["secondary-types"] == null
      ? []
      : array(root["secondary-types"], "release-group.secondary-types").map((v, i) =>
        text(v, `release-group.secondary-types[${i}]`)!
      ),
    firstReleaseDate: partialDate(root["first-release-date"], "release-group.first-release-date"),
    artistCredit: parseArtistCredit(root["artist-credit"], "release-group.artist-credit"),
    tags: parseTags(root.tags, "release-group.tags"),
    genres: parseGenres(root.genres, "release-group.genres"),
  };
}

export function parseReleaseBrowse(value: unknown): {
  count: number;
  offset: number;
  releases: ReleaseSummary[];
} {
  const root = object(value, "release-browse");
  return {
    count: integer(root["release-count"], "release-browse.release-count"),
    offset: integer(root["release-offset"], "release-browse.release-offset"),
    releases: array(root.releases, "release-browse.releases").map((entry, index) => {
      const item = object(entry, `release-browse.releases[${index}]`);
      const media = item.media == null ? [] : array(item.media, `release[${index}].media`);
      let trackCount = 0;
      for (const mediumValue of media) {
        const medium = object(mediumValue, `release[${index}].medium`);
        trackCount += medium["track-count"] == null ? 0 : integer(medium["track-count"], "medium.track-count");
      }
      return {
        mbid: uuid(item.id, `release-browse.releases[${index}].id`),
        title: text(item.title, `release-browse.releases[${index}].title`)!,
        status: optionalText(item.status, "release.status"),
        date: partialDate(item.date, "release.date"),
        country: optionalText(item.country, "release.country"),
        trackCount,
      };
    }),
  };
}

export function parseRelease(value: unknown): ParsedRelease {
  const root = object(value, "release");
  const group = object(root["release-group"], "release.release-group");
  const events = root["release-events"] == null
    ? []
    : array(root["release-events"], "release.release-events").map((entry, index) => {
      const item = object(entry, `release.release-events[${index}]`);
      const area = item.area == null ? null : object(item.area, `release.release-events[${index}].area`);
      return {
        date: partialDate(item.date, `release.release-events[${index}].date`),
        country: area ? optionalText(area["iso-3166-1-codes"] instanceof Array
          ? area["iso-3166-1-codes"][0]
          : null, "release-event.country") : null,
      };
    });
  const media = array(root.media, "release.media").map((entry, mediumIndex) => {
    const item = object(entry, `release.media[${mediumIndex}]`);
    const position = integer(item.position, `release.media[${mediumIndex}].position`, 1);
    const tracks = (item.tracks == null ? [] : array(item.tracks, `release.media[${mediumIndex}].tracks`)).map((trackValue, trackIndex) => {
      const track = object(trackValue, `release.media[${mediumIndex}].tracks[${trackIndex}]`);
      return {
        mbid: uuid(track.id, `track[${trackIndex}].id`),
        position: integer(track.position, `track[${trackIndex}].position`, 1),
        number: text(track.number, `track[${trackIndex}].number`)!,
        title: text(track.title, `track[${trackIndex}].title`)!,
        lengthMs: track.length == null ? null : integer(track.length, `track[${trackIndex}].length`),
        artistCredit: parseArtistCredit(track["artist-credit"], `track[${trackIndex}].artist-credit`),
        recording: parseRecordingValue(track.recording, `track[${trackIndex}].recording`),
      };
    });
    return {
      position,
      title: optionalText(item.title, `release.media[${mediumIndex}].title`),
      format: optionalText(item.format, `release.media[${mediumIndex}].format`),
      tracks,
    };
  });
  const textRepresentation = root["text-representation"] == null
    ? {}
    : object(root["text-representation"], "release.text-representation");
  return {
    mbid: uuid(root.id, "release.id"),
    title: text(root.title, "release.title")!,
    status: optionalText(root.status, "release.status"),
    quality: optionalText(root.quality, "release.quality"),
    packaging: optionalText(root.packaging, "release.packaging"),
    country: optionalText(root.country, "release.country"),
    date: partialDate(root.date, "release.date") ??
      earliestPartialDate(events.map((event) => event.date)),
    barcode: optionalText(root.barcode, "release.barcode"),
    textLanguage: optionalText(textRepresentation.language, "release.text-representation.language"),
    textScript: optionalText(textRepresentation.script, "release.text-representation.script"),
    releaseGroupMbid: uuid(group.id, "release.release-group.id"),
    artistCredit: parseArtistCredit(root["artist-credit"], "release.artist-credit"),
    events,
    media,
    tags: parseTags(root.tags, "release.tags"),
    genres: parseGenres(root.genres, "release.genres"),
  };
}

export function parseRecording(value: unknown): ParsedRecording {
  return parseRecordingValue(value, "recording");
}

/** Lucene/Solr reserved chars that make MusicBrainz search return HTTP 400.
 * `-` is not escaped: inside a quoted phrase it is literal, and arid UUIDs must keep hyphens. */
const LUCENE_ESCAPE_CHARS = new Set([
  "\\", "+", "!", "(", ")", "{", "}", "[", "]", "^", '"', "~", "*", "?", ":", "/", "<", ">", "|", "&",
]);

export function normalizeLuceneSearchText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u00A0\u202F\u2007\u2009\u200B-\u200D\uFEFF]/g, " ")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripLuceneNoise(value: string): string {
  return normalizeLuceneSearchText(value)
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Drop feat./remix parentheses so Last.fm chart titles can match MusicBrainz cores. */
export function catalogCoreTitle(value: string): string {
  const normalized = normalizeLuceneSearchText(value);
  const stripped = normalized
    .replace(/\s*[\(\[]\s*(feat\.?|featuring|ft\.?|with)\b[^\)\]]*[\)\]]/gi, " ")
    .replace(/\s+(feat\.?|featuring|ft\.?)\s+.+$/i, " ")
    .replace(
      /\s*[\(\[][^\)\]]*(\bremix\b|\bremaster(?:ed)?\b|\blive\b|\bver(?:sion)?\.?|\binst(?:rumental)?\.?|\bmix\b|\bedit\b)[^\)\]]*[\)\]]/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
  return stripped || normalized;
}

export function catalogMatchKey(value: string): string {
  return catalogCoreTitle(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function luceneText(value: string, mode: "quoted" | "stripped"): string {
  return mode === "stripped" ? stripLuceneNoise(value) : normalizeLuceneSearchText(value);
}

function luceneRecordingClause(trackTitle: string, mode: "quoted" | "stripped"): string {
  const title = luceneText(trackTitle, mode);
  const core = luceneText(catalogCoreTitle(trackTitle), mode);
  const terms = [quoteLucene(title)];
  if (core && core.toLowerCase() !== title.toLowerCase()) terms.push(quoteLucene(core));
  return terms.length === 1
    ? `recording:${terms[0]}`
    : `(${terms.map((term) => `recording:${term}`).join(" OR ")})`;
}

export function quoteLucene(value: string): string {
  const normalized = normalizeLuceneSearchText(value);
  let escaped = "";
  for (const char of normalized) {
    escaped += LUCENE_ESCAPE_CHARS.has(char) ? `\\${char}` : char;
  }
  return `"${escaped}"`;
}

function request(path: string, params: Record<string, string | number>): URL {
  if (path.startsWith("/") || path.includes("..")) throw new ContractError("invalid MusicBrainz path");
  const url = new URL(path, MB_BASE_URL);
  if (url.protocol !== "https:" || url.hostname !== "musicbrainz.org" || !url.pathname.startsWith("/ws/2/")) {
    throw new ContractError("invalid MusicBrainz URL");
  }
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  url.searchParams.set("fmt", "json");
  return url;
}

export interface ParsedArtistSearchHit {
  mbid: string;
  name: string;
  score: number;
}

export function buildArtistSearchRequest(
  artistName: string,
  limit = 5,
  mode: "quoted" | "stripped" = "quoted",
): URL {
  const name = mode === "stripped" ? stripLuceneNoise(artistName) : normalizeLuceneSearchText(artistName);
  if (!name || name.length > 500) throw new ContractError("invalid artist search name");
  if (!Number.isInteger(limit) || limit < 1 || limit > 25) {
    throw new ContractError("invalid artist search limit");
  }
  return request("artist/", {
    query: `artist:${quoteLucene(name)}`,
    limit,
  });
}

export function parseArtistSearch(value: unknown): ParsedArtistSearchHit[] {
  const root = object(value, "artist search");
  const raw = root.artists;
  const artists = raw == null ? [] : array(raw, "artists");
  const hits: ParsedArtistSearchHit[] = [];
  for (const entry of artists) {
    const item = object(entry, "artist hit");
    let mbid: string | null = null;
    try {
      mbid = uuid(item.id, "artist.id");
    } catch {
      mbid = null;
    }
    const name = optionalText(item.name, "artist.name");
    if (!mbid || !name) continue;
    const score = typeof item.score === "number"
      ? item.score
      : typeof item.score === "string" && Number.isFinite(Number(item.score))
      ? Number(item.score)
      : 0;
    hits.push({ mbid, name, score });
  }
  return hits.sort((a, b) => b.score - a.score || a.mbid.localeCompare(b.mbid));
}

export function selectArtistSearchMatch(
  hits: ParsedArtistSearchHit[],
  artistName: string,
): ParsedArtistSearchHit | null {
  if (hits.length === 0) return null;
  const needle = artistName.trim().toLowerCase();
  const exact = hits.find((hit) => hit.name.trim().toLowerCase() === needle);
  if (exact) return exact;
  const key = catalogMatchKey(artistName);
  const keyed = hits.find((hit) => catalogMatchKey(hit.name) === key);
  if (keyed) return keyed;
  if (hits[0].score >= 90) return hits[0];
  return null;
}

export function buildDiscoveryRequest(
  artistMbid: string,
  dateFrom: string,
  dateTo: string,
  offset: number,
  limit = 100,
): URL {
  uuid(artistMbid, "artistMbid");
  partialDate(dateFrom, "dateFrom", false);
  partialDate(dateTo, "dateTo", false);
  if (!Number.isInteger(offset) || offset < 0 || limit < 1 || limit > 100) {
    throw new ContractError("invalid discovery pagination");
  }
  const query = [
    `arid:${quoteLucene(artistMbid)}`,
    `date:[${dateFrom} TO ${dateTo}]`,
    'status:"official"',
  ].join(" AND ");
  return request("release/", { query, offset, limit });
}

export function buildLookupRequest(
  entity: "artist" | "release-group" | "release" | "recording",
  mbid: string,
  extraInc?: string,
): URL {
  const id = uuid(mbid);
  const includes: Record<typeof entity, string> = {
    artist: "aliases+artist-credits+tags+genres",
    "release-group": "artist-credits+tags+genres",
    release: "release-groups+recordings+artist-credits+labels+media+isrcs+tags+genres",
    recording: extraInc ?? "artist-credits+isrcs+tags+genres+releases",
  };
  return request(`${entity}/${id}`, { inc: includes[entity] });
}

export function buildRecordingSearchRequest(
  artistName: string,
  trackTitle: string,
  limit = 5,
  mode: "quoted" | "stripped" = "quoted",
  artistMbid?: string | null,
): URL {
  const artist = luceneText(artistName, mode);
  const title = luceneText(trackTitle, mode);
  const arid = artistMbid ? uuid(artistMbid, "artistMbid") : null;
  if ((!arid && !artist) || !title || (!arid && artist.length > 500) || title.length > 500) {
    throw new ContractError("invalid recording search names");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 25) {
    throw new ContractError("invalid recording search limit");
  }
  const artistClause = arid
    ? `arid:${quoteLucene(arid)}`
    : `(artist:${quoteLucene(artist)} OR artistname:${quoteLucene(artist)} OR creditname:${quoteLucene(artist)})`;
  return request("recording/", {
    query: `${luceneRecordingClause(trackTitle, mode)} AND ${artistClause}`,
    limit,
  });
}

export function parseRecordingSearch(value: unknown): ParsedRecordingSearchHit[] {
  const root = object(value, "recording search");
  const raw = root.recordings;
  const recordings = raw == null ? [] : array(raw, "recordings");
  const hits: ParsedRecordingSearchHit[] = [];
  for (const entry of recordings) {
    const item = object(entry, "recording hit");
    let mbid: string | null = null;
    try {
      mbid = uuid(item.id, "recording.id");
    } catch {
      mbid = null;
    }
    const title = optionalText(item.title, "recording.title");
    if (!mbid || !title) continue;
    let artistName = "";
    try {
      artistName = parseArtistCredit(item["artist-credit"], "recording.artist-credit")
        .map((credit) => credit.credited_name + credit.join_phrase)
        .join("")
        .trim();
    } catch {
      artistName = optionalText(item["artist-credit-phrase"], "recording.artist-credit-phrase") ?? "";
    }
    const score = typeof item.score === "number"
      ? item.score
      : typeof item.score === "string" && Number.isFinite(Number(item.score))
      ? Number(item.score)
      : 0;
    hits.push({ mbid, title, artistName, score });
  }
  return hits.sort((a, b) => b.score - a.score || a.mbid.localeCompare(b.mbid));
}

export function selectRecordingSearchMatch(
  hits: ParsedRecordingSearchHit[],
  artistName: string,
  trackTitle: string,
): ParsedRecordingSearchHit | null {
  if (hits.length === 0) return null;
  const artistNeedle = artistName.trim().toLowerCase();
  const titleNeedle = trackTitle.trim().toLowerCase();
  const artistKey = catalogMatchKey(artistName);
  const titleKey = catalogMatchKey(trackTitle);
  const exact = hits.find((hit) =>
    hit.title.trim().toLowerCase() === titleNeedle &&
    hit.artistName.trim().toLowerCase() === artistNeedle
  );
  if (exact) return exact;
  const keyed = hits.find((hit) =>
    catalogMatchKey(hit.title) === titleKey && catalogMatchKey(hit.artistName) === artistKey
  );
  if (keyed) return keyed;
  const titleExact = hits.find((hit) => hit.title.trim().toLowerCase() === titleNeedle);
  if (titleExact && titleExact.score >= 80) return titleExact;
  const titleKeyed = hits.find((hit) => catalogMatchKey(hit.title) === titleKey);
  if (titleKeyed && (titleKeyed.score >= 80 || catalogMatchKey(titleKeyed.artistName) === artistKey)) {
    return titleKeyed;
  }
  if (hits[0].score >= 90) return hits[0];
  return null;
}

export function selectCatalogRelease(
  releases: ParsedRecordingReleaseHint[],
): ParsedRecordingReleaseHint | null {
  if (releases.length === 0) return null;
  return [...releases].sort((a, b) => {
    const aOfficial = a.status?.toLowerCase() === "official" ? 0 : 1;
    const bOfficial = b.status?.toLowerCase() === "official" ? 0 : 1;
    if (aOfficial !== bOfficial) return aOfficial - bOfficial;
    const aDate = a.date == null ? 1 : 0;
    const bDate = b.date == null ? 1 : 0;
    if (aDate !== bDate) return aDate - bDate;
    const dateCompare = (a.date ?? "").localeCompare(b.date ?? "");
    return dateCompare || a.mbid.localeCompare(b.mbid);
  })[0];
}

export function buildReleaseBrowseRequest(releaseGroupMbid: string, offset: number, limit = 100): URL {
  if (!Number.isInteger(offset) || offset < 0 || limit < 1 || limit > 100) {
    throw new ContractError("invalid release browse pagination");
  }
  return request("release/", {
    "release-group": uuid(releaseGroupMbid, "releaseGroupMbid"),
    inc: "media",
    offset,
    limit,
  });
}

function dateBounds(value: string): [string, string] {
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = monthText ? Number(monthText) : 1;
  const day = dayText ? Number(dayText) : 1;
  const start = `${yearText}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (dayText) return [start, start];
  const endDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const endMonth = monthText ? month : 12;
  const actualEndDay = monthText ? endDay : 31;
  return [start, `${yearText}-${String(endMonth).padStart(2, "0")}-${String(actualEndDay).padStart(2, "0")}`];
}

export function dateOverlaps(value: string, from: string, to: string): boolean {
  partialDate(value, "release event date", false);
  partialDate(from, "from", false);
  partialDate(to, "to", false);
  const [start, end] = dateBounds(value);
  return end >= from && start <= to;
}

export function validateActualRelease(
  release: ParsedRelease,
  artistMbid: string,
  dateFrom: string,
  dateTo: string,
  countries: string[],
  statuses: string[],
): void {
  if (!statuses.some((status) => status.toLowerCase() === (release.status ?? "").toLowerCase())) {
    throw new ContractError("release status is not allowed");
  }
  if (!release.artistCredit.some((credit) => credit.artist_mbid === uuid(artistMbid))) {
    throw new ContractError("release artist credit does not contain allowlisted artist");
  }
  const countrySet = new Set(countries.map((country) => country.toUpperCase()));
  const eventMatches = (date: string | null, country: string | null): boolean =>
    date != null &&
    dateOverlaps(date, dateFrom, dateTo) &&
    (countrySet.size === 0 || (country != null && countrySet.has(country.toUpperCase())));
  const datedEvents = release.events.filter((event) => event.date != null);
  const matchingEvent = datedEvents.some((event) => eventMatches(event.date, event.country));
  if (matchingEvent) return;
  if (datedEvents.length === 0 && eventMatches(release.date, release.country)) return;
  throw new ContractError("no actual release-event matches date/country policy");
}

export function selectRepresentativeRelease(releases: ReleaseSummary[]): ReleaseSummary {
  if (releases.length === 0) throw new ContractError("release group has no releases");
  return [...releases].sort((a, b) => {
    const aOfficial = a.status?.toLowerCase() === "official" ? 0 : 1;
    const bOfficial = b.status?.toLowerCase() === "official" ? 0 : 1;
    if (aOfficial !== bOfficial) return aOfficial - bOfficial;
    const aTracks = a.trackCount > 0 ? 0 : 1;
    const bTracks = b.trackCount > 0 ? 0 : 1;
    if (aTracks !== bTracks) return aTracks - bTracks;
    const aDate = a.date == null ? 1 : 0;
    const bDate = b.date == null ? 1 : 0;
    if (aDate !== bDate) return aDate - bDate;
    const dateCompare = (a.date ?? "").localeCompare(b.date ?? "");
    return dateCompare || a.mbid.localeCompare(b.mbid);
  })[0];
}

export function assertAllowedFinalUrl(url: string): void {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== "musicbrainz.org" ||
    !parsed.pathname.startsWith("/ws/2/")) {
    throw new ContractError("MusicBrainz redirect escaped allowed origin");
  }
}

const HANGUL_RE = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7A3]/;
const KANA_RE = /[\u3040-\u30FF]/;
const KOREAN_TAG_RE =
  /\bk[\s-]?pop\b|\bkpop\b|\bkorean\b|\bk[\s-]?rap\b|\bk[\s-]?hip[\s-]?hop\b|\bkorean hip[\s-]?hop\b|\bk[\s-]?r&b\b|\bk[\s-]?rnb\b|\btrot\b|\bk[\s-]?indie\b|\bk[\s-]?ballad\b|\bk[\s-]?rock\b|\bk[\s-]?soul\b/;
const JAPANESE_TAG_RE = /\bj[\s-]?pop\b|\bjpop\b|\bj[\s-]?rap\b|\bj[\s-]?rock\b|\bj[\s-]?hip[\s-]?hop\b|\bjapanese\b/;

export type CatalogRegionPolicy = "korean_only" | "exclude_korean" | "unfiltered";

export function catalogRegionPolicy(scheduleKey: string | null | undefined): CatalogRegionPolicy {
  switch (scheduleKey) {
    case "musicbrainz-lastfm-korea-catalog":
    case "musicbrainz-lastfm-korea-top":
    case "musicbrainz-lastfm-korean-hiphop-catalog":
    case "musicbrainz-lastfm-korean-hiphop-top":
      return "korean_only";
    case "musicbrainz-lastfm-global-catalog":
    case "musicbrainz-lastfm-global-top":
    case "musicbrainz-lastfm-hiphop-catalog":
    case "musicbrainz-lastfm-hiphop-top":
      return "exclude_korean";
    default:
      return "unfiltered";
  }
}

export function scheduleRequiresKoreanWork(scheduleKey: string | null | undefined): boolean {
  return catalogRegionPolicy(scheduleKey) === "korean_only";
}

export function containsHangul(value: string | null | undefined): boolean {
  return typeof value === "string" && HANGUL_RE.test(value);
}

export function containsKana(value: string | null | undefined): boolean {
  return typeof value === "string" && KANA_RE.test(value);
}

function normalizeTagName(value: string): string {
  return value.normalize("NFKC").toLowerCase().replaceAll("_", " ");
}

export function isSouthKoreaArtist(country: string | null, areaName: string | null): boolean {
  if ((country ?? "").toUpperCase() === "KR") return true;
  const area = (areaName ?? "").trim().toLowerCase();
  return area === "south korea" || area === "korea, republic of" || area === "republic of korea";
}

export interface ParsedArtistGeo {
  mbid: string;
  country: string | null;
  areaName: string | null;
  names: string[];
}

export function parseArtistGeo(value: unknown): ParsedArtistGeo {
  const root = object(value, "artist");
  const area = root.area == null ? null : object(root.area, "artist.area");
  const iso = area && Array.isArray(area["iso-3166-1-codes"])
    ? optionalText(area["iso-3166-1-codes"][0], "artist.area.iso")
    : null;
  const aliases = root.aliases == null
    ? []
    : array(root.aliases, "artist.aliases").flatMap((entry, index) => {
      const alias = object(entry, `artist.aliases[${index}]`);
      const name = optionalText(alias.name, `artist.aliases[${index}].name`);
      return name ? [name] : [];
    });
  const names = [
    optionalText(root.name, "artist.name"),
    optionalText(root["sort-name"], "artist.sort-name"),
    ...aliases,
  ].filter((name): name is string => Boolean(name));
  return {
    mbid: uuid(root.id, "artist.id"),
    country: optionalText(root.country, "artist.country") ?? iso,
    areaName: area ? optionalText(area.name, "artist.area.name") : null,
    names,
  };
}

export function artistLooksKorean(artist: ParsedArtistGeo): boolean {
  return isSouthKoreaArtist(artist.country, artist.areaName) ||
    artist.names.some((name) => containsHangul(name));
}

export type KoreanWorkVerdict = "accept" | "reject" | "check_artist";

export function classifyKoreanWork(input: {
  artistName?: string | null;
  trackTitle?: string | null;
  recordingTitle?: string | null;
  creditedNames?: string[];
  isrcs?: string[];
  tags?: Array<{ name: string }>;
  genres?: Array<{ name: string }>;
}): KoreanWorkVerdict {
  const texts = [
    input.artistName,
    input.trackTitle,
    input.recordingTitle,
    ...(input.creditedNames ?? []),
  ];
  if (texts.some((value) => containsHangul(value))) return "accept";
  if (texts.some((value) => containsKana(value))) return "reject";
  if ((input.isrcs ?? []).some((code) => code.toUpperCase().startsWith("KR"))) return "accept";
  const tagNames = [...(input.tags ?? []), ...(input.genres ?? [])].map((tag) => normalizeTagName(tag.name));
  if (tagNames.some((name) => KOREAN_TAG_RE.test(name))) return "accept";
  const japaneseIsrc = (input.isrcs ?? []).some((code) => code.toUpperCase().startsWith("JP"));
  const japaneseTag = tagNames.some((name) => JAPANESE_TAG_RE.test(name));
  if (japaneseIsrc || japaneseTag) return "reject";
  return "check_artist";
}
