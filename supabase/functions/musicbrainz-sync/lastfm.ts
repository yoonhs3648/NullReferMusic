export class LastfmContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LastfmContractError";
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type LastfmMethod =
  | "geo.getTopArtists"
  | "chart.getTopArtists"
  | "tag.getTopArtists";

export interface LastfmTopArtist {
  rank: number;
  name: string;
  mbid: string | null;
  playcount: number | null;
  listeners: number | null;
}

export interface LastfmTopArtistsPage {
  method: LastfmMethod;
  param: string | null;
  artists: LastfmTopArtist[];
}

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

export function buildLastfmTopArtistsUrl(
  apiKey: string,
  method: LastfmMethod,
  param: string | null,
  limit: number,
): URL {
  if (!apiKey || apiKey.length < 16) {
    throw new LastfmContractError("LASTFM_API_KEY is missing or too short");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    throw new LastfmContractError("invalid Last.fm artist limit");
  }
  const url = new URL("https://ws.audioscrobbler.com/2.0/");
  url.searchParams.set("method", method);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", String(limit));
  if (method === "geo.getTopArtists") {
    if (!param) throw new LastfmContractError("geo.getTopArtists requires country");
    url.searchParams.set("country", normalizeLastfmGeoCountry(param));
  } else if (method === "tag.getTopArtists") {
    if (!param) throw new LastfmContractError("tag.getTopArtists requires tag");
    url.searchParams.set("tag", param);
  } else if (param != null && param !== "") {
    throw new LastfmContractError("chart.getTopArtists does not accept a param");
  }
  return url;
}

export function parseLastfmTopArtists(
  value: unknown,
  method: LastfmMethod,
  param: string | null,
  limit: number,
): LastfmTopArtistsPage {
  const root = asObject(value, "lastfm response");
  if (root.error != null) {
    throw new LastfmContractError(
      `Last.fm API error ${String(root.error)}: ${asString(root.message) ?? "unknown"}`,
    );
  }
  const containerKey = method === "geo.getTopArtists"
    ? "topartists"
    : method === "tag.getTopArtists"
    ? "topartists"
    : "artists";
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
      rank: rankFromAttr ?? artists.length + 1,
      name,
      mbid: normalizeMbid(item.mbid),
      playcount: asNumber(item.playcount),
      listeners: asNumber(item.listeners),
    });
  }
  return { method, param, artists };
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
