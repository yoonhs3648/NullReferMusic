import {
  assertAllowedFinalUrl,
  buildArtistSearchRequest,
  buildDiscoveryRequest,
  buildLookupRequest,
  buildRecordingSearchRequest,
  buildReleaseBrowseRequest,
  ContractError,
  MB_MAX_REDIRECTS,
  artistLooksKorean,
  catalogRegionPolicy,
  classifyKoreanWork,
  containsHangul,
  parseArtistGeo,
  parseArtistSearch,
  parseRecording,
  parseRecordingSearch,
  parseRelease,
  parseReleaseBrowse,
  parseReleaseGroup,
  parseReleaseSearchPage,
  selectArtistSearchMatch,
  coalescePartialDate,
  selectCatalogRelease,
  selectRecordingSearchMatch,
  selectRepresentativeRelease,
  validateActualRelease,
} from "./musicbrainz.ts";
import {
  assertAllowedLastfmUrl,
  artistMethodToTrackMethod,
  buildLastfmArtistTopTagsUrl,
  buildLastfmTopTracksUrl,
  buildLastfmTrackTopTagsUrl,
  catalogIdentityKey,
  decideLastfmCatalogTrack,
  LastfmContractError,
  lastfmCatalogRequiresHipHop,
  lastfmCatalogSourceIsHipHop,
  lastfmCheapKoreanVerdict,
  type LastfmArtistMethod,
  type LastfmTopArtist,
  type LastfmTopTrack,
  type LastfmTrackMethod,
  type LastfmTrackTag,
  parseLastfmTopTracks,
  parseLastfmTrackTopTags,
  selectLastfmVectorTags,
  uniqueArtistsFromTopTracks,
} from "./lastfm.ts";

export interface WorkerEnvironment {
  supabaseUrl: string;
  serviceRoleKey: string;
  userAgent: string;
  lastfmApiKey?: string;
  lastfmUserAgent?: string;
  fetcher?: typeof fetch;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
}

interface ClaimedWork {
  job_id: string;
  job_kind:
    | "lastfm_artist_pool"
    | "lastfm_track_pool"
    | "mb_catalog_track_resolve"
    | "lastfm_tags"
    | "lastfm_tag_refresh"
    | "mb_discovery"
    | "mb_release_hydrate"
    | "mb_recording_hydrate"
    | "mb_upcoming_verify";
  entity_id: string;
  fence_token: string;
  attempt_count: number;
  context: Record<string, unknown>;
}

interface FixedPoint<T> {
  value: T;
  requestedMbid: string;
  finalMbid: string;
  aliases: Array<{ mbid: string; redirect_target_mbid: string }>;
}

export interface WorkerResult {
  worker_id: string;
  claimed: number;
  succeeded: number;
  retried: number;
  quarantined: number;
  requests: number;
  has_more: boolean;
}

class RequestBudgetExhausted extends Error {}

class HttpFailure extends Error {
  constructor(
    readonly status: number,
    readonly retryAfter: string | null,
    message: string,
    readonly source: "musicbrainz" | "lastfm" = "musicbrainz",
  ) {
    super(message);
  }
}

class RpcClient {
  constructor(private readonly env: WorkerEnvironment) {}

  async call<T>(name: string, body: Record<string, unknown>): Promise<T> {
    const started = (this.env.now ?? Date.now)();
    const response = await (this.env.fetcher ?? fetch)(
      `${this.env.supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/${name}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.env.serviceRoleKey}`,
          apikey: this.env.serviceRoleKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) {
      const message = (await response.text()).slice(0, 500);
      throw new Error(`RPC ${name} failed (${response.status}): ${message}`);
    }
    const parsed = await response.json() as T;
    if (name !== "nrm_rpc_system_schedule_log_append") {
      schedulerConsole("rpc_ok", {
        rpc: name,
        ms: (this.env.now ?? Date.now)() - started,
      });
    }
    return parsed;
  }

  async log(
    event: string,
    level: "debug" | "info" | "warn" | "error",
    detail: Record<string, unknown> = {},
    extra: {
      schedule_id?: string;
      schedule_key?: string;
      schedule_run_id?: string;
      job_id?: string;
    } = {},
  ): Promise<void> {
    schedulerConsole(event, { level, ...detail, ...extra });
    try {
      await this.call("nrm_rpc_system_schedule_log_append", {
        p_source: "edge",
        p_event: event.slice(0, 80),
        p_level: level,
        p_detail: detail,
        p_schedule_id: extra.schedule_id ?? null,
        p_schedule_key: extra.schedule_key ?? null,
        p_schedule_run_id: extra.schedule_run_id ?? null,
        p_job_id: extra.job_id ?? null,
      });
    } catch (error) {
      schedulerConsole("persist_log_failed", {
        event,
        message: sanitize(error),
      });
    }
  }
}

class Gateway {
  requests = 0;
  readonly artistKoreaCache = new Map<string, boolean>();
  readonly lastfmArtistTagCache = new Map<string, LastfmTrackTag[]>();
  private readonly startedAt: number;

  constructor(
    private readonly env: WorkerEnvironment,
    private readonly rpc: RpcClient,
    private readonly workerId: string,
    private readonly requestLimit: number,
    private readonly deadlineMs: number,
  ) {
    this.startedAt = (env.now ?? Date.now)();
  }

  private remaining(): boolean {
    return this.requests < this.requestLimit &&
      (this.env.now ?? Date.now)() - this.startedAt < this.deadlineMs;
  }

  async json(url: URL): Promise<{ value: unknown; finalUrl: string; hash: string }> {
    if (!this.remaining()) throw new RequestBudgetExhausted("request budget exhausted");
    const sleeper = this.env.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
    for (;;) {
      const permit = await this.rpc.call<Array<{
        granted: boolean;
        retry_at: string;
        permit_token: string | null;
      }>>("music_rpc_acquire_mb_permit", {
        p_worker_id: this.workerId,
        p_lease_seconds: 15,
      });
      if (permit[0]?.granted) break;
      const delay = Math.max(25, new Date(permit[0]?.retry_at ?? 0).getTime() - (this.env.now ?? Date.now)());
      if (!this.remaining()) throw new RequestBudgetExhausted("request budget exhausted waiting for permit");
      await sleeper(Math.min(delay, 1100));
    }

    this.requests += 1;
    return await this.fetchJson(url, assertAllowedFinalUrl, { kind: "musicbrainz" });
  }

  async lastfmJson(url: URL): Promise<{ value: unknown; finalUrl: string; hash: string }> {
    if (!this.remaining()) throw new RequestBudgetExhausted("request budget exhausted");
    this.requests += 1;
    return await this.fetchJson(url, assertAllowedLastfmUrl, {
      kind: "lastfm",
      userAgent: this.env.lastfmUserAgent ?? "NullReferMusic/lastfm-sync",
      accept: "*/*",
    });
  }

  private async fetchJson(
    url: URL,
    assertUrl: (finalUrl: string) => void,
    headers?: { kind?: "lastfm" | "musicbrainz"; userAgent?: string; accept?: string },
  ): Promise<{ value: unknown; finalUrl: string; hash: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    let response: Response;
    try {
      response = await (this.env.fetcher ?? fetch)(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          Accept: headers?.accept ?? "application/json",
          "User-Agent": headers?.userAgent ?? this.env.userAgent,
        },
      });
    } catch (error) {
      const aborted = error instanceof Error &&
        (error.name === "AbortError" || /aborted|abort/i.test(error.message));
      throw new HttpFailure(
        0,
        null,
        aborted ? "request timeout" : error instanceof Error ? error.message : "network failure",
        headers?.kind === "lastfm" ? "lastfm" : "musicbrainz",
      );
    } finally {
      clearTimeout(timeout);
    }
    assertUrl(response.url || url.href);
    if (!response.ok) {
      if (headers?.kind === "lastfm") {
        const raw = await response.text();
        const redacted = raw.replace(/api_key=[^&\s"]+/gi, "api_key=[redacted]").slice(0, 240);
        schedulerConsole("lastfm_http_error", {
          status: response.status,
          content_type: response.headers.get("content-type"),
          body: redacted,
        });
        try {
          const parsed = JSON.parse(raw) as { error?: number; message?: string };
          if (typeof parsed.error === "number") {
            throw new LastfmContractError(
              `Last.fm API error ${parsed.error}: ${parsed.message ?? "unknown"}`,
            );
          }
        } catch (error) {
          if (error instanceof LastfmContractError) throw error;
        }
      }
      throw new HttpFailure(
        response.status,
        response.headers.get("retry-after"),
        `HTTP ${response.status}`,
        headers?.kind === "lastfm" ? "lastfm" : "musicbrainz",
      );
    }
    const raw = await response.text();
    if (raw.length > 10_000_000) throw new ContractError("response exceeds size limit");
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new ContractError("invalid JSON response");
    }
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
    return {
      value,
      finalUrl: response.url || url.href,
      hash: [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""),
    };
  }
}

function rpcBytea(hex: string): string {
  return `\\x${hex}`;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function asString(value: unknown, label: string): string {
  if (typeof value !== "string" || value === "") throw new ContractError(`${label} is missing`);
  return value;
}

function scheduleKeyOf(job: ClaimedWork): string {
  return typeof job.context.schedule_key === "string" ? job.context.schedule_key : "";
}

async function artistIsKorean(gateway: Gateway, mbid: string): Promise<boolean> {
  const key = mbid.toLowerCase();
  const cached = gateway.artistKoreaCache.get(key);
  if (cached != null) return cached;
  try {
    const resolved = await fixedPoint(gateway, "artist", key, parseArtistGeo);
    const korean = artistLooksKorean(resolved.value);
    gateway.artistKoreaCache.set(key, korean);
    gateway.artistKoreaCache.set(resolved.finalMbid, korean);
    return korean;
  } catch (error) {
    if (error instanceof HttpFailure && error.status === 404) {
      gateway.artistKoreaCache.set(key, false);
      return false;
    }
    throw error;
  }
}

async function catalogKoreanDecision(
  gateway: Gateway,
  scheduleKey: string,
  artistName: string,
  trackTitle: string,
  recording: ReturnType<typeof parseRecording> | null,
): Promise<"accept" | "reject" | "need_recording"> {
  const policy = catalogRegionPolicy(scheduleKey);
  if (policy === "unfiltered") return "accept";
  const verdict = classifyKoreanWork({
    artistName,
    trackTitle,
    recordingTitle: recording?.title,
    creditedNames: recording?.artistCredit.map((credit) => credit.credited_name) ?? [],
    isrcs: recording?.isrcs ?? [],
    tags: recording?.tags ?? [],
    genres: recording?.genres ?? [],
  });
  if (policy === "korean_only") {
    if (verdict === "accept") return "accept";
    if (verdict === "reject") return "reject";
    if (!recording) return "need_recording";
    for (const credit of recording.artistCredit) {
      if (await artistIsKorean(gateway, credit.artist_mbid)) return "accept";
    }
    return "reject";
  }
  if (verdict === "accept") return "reject";
  if (verdict === "reject") return "accept";
  if (!recording) return "need_recording";
  for (const credit of recording.artistCredit) {
    if (await artistIsKorean(gateway, credit.artist_mbid)) return "reject";
  }
  return "accept";
}

function catalogSkipReason(scheduleKey: string): "not_korean_work" | "korean_work" {
  return catalogRegionPolicy(scheduleKey) === "exclude_korean" ? "korean_work" : "not_korean_work";
}

async function skipCatalogRegion(
  rpc: RpcClient,
  job: ClaimedWork,
  reason: "not_korean_work" | "korean_work",
): Promise<void> {
  const result = await rpc.call<Array<{ applied: boolean; result_code: string }>>(
    "music_rpc_skip_catalog_recording",
    {
      p_job_id: job.job_id,
      p_fence_token: job.fence_token,
      p_reason: reason,
    },
  );
  if (!result[0]?.applied) {
    throw new Error(`catalog region skip failed: ${result[0]?.result_code ?? "unknown"}`);
  }
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) return [];
  return value as string[];
}

const HTTP_5XX_MAX_RETRIES = 3;
const HTTP_5XX_RETRY_MS = [3_000, 3_000, 3_000] as const;
const MB_TRANSIENT_RETRY_KINDS = new Set<ClaimedWork["job_kind"]>([
  "mb_catalog_track_resolve",
  "mb_discovery",
  "mb_release_hydrate",
  "mb_recording_hydrate",
  "mb_upcoming_verify",
]);

async function runJobWithTransientRetries(
  env: WorkerEnvironment,
  job: ClaimedWork,
  run: () => Promise<void>,
): Promise<void> {
  const sleeper = env.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  let lastError: unknown;
  for (let attempt = 1; attempt <= HTTP_5XX_MAX_RETRIES; attempt += 1) {
    try {
      await run();
      return;
    } catch (error) {
      lastError = error;
      if (error instanceof RequestBudgetExhausted) throw error;
      const status = error instanceof HttpFailure ? error.status : 0;
      if (!isTransient(status) || attempt === HTTP_5XX_MAX_RETRIES) throw error;
      const delay = HTTP_5XX_RETRY_MS[attempt - 1];
      schedulerConsole(job.job_kind.startsWith("lastfm_") ? "lastfm_http_retry" : "job_http_retry", {
        job_kind: job.job_kind,
        attempt,
        status,
        delay_ms: delay,
      });
      await sleeper(delay);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("transient request failed");
}

function notFoundRetryAt(attempt: number): string | null {
  const days = [1, 7, 30][attempt - 1];
  return days == null ? null : new Date(Date.now() + days * 86_400_000).toISOString();
}

function schedulerConsole(event: string, detail: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({
    fn: "musicbrainz-sync",
    ts: new Date().toISOString(),
    event,
    ...detail,
  }));
}

function sanitize(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/Bearer\s+\S+/gi, "Bearer [redacted]").replace(/[?&](?:token|key)=[^&\s]+/gi, "").slice(0, 900);
}

function isTransient(status: number): boolean {
  return status === 0 || [408, 429, 500, 502, 503, 504].includes(status);
}

async function jsonSearchOrStripped(
  gateway: Gateway,
  primary: URL,
  fallback: () => URL,
): Promise<{ value: unknown; hash: string }> {
  try {
    return await gateway.json(primary);
  } catch (error) {
    if (!(error instanceof HttpFailure && error.status === 400)) throw error;
    try {
      return await gateway.json(fallback());
    } catch (fallbackError) {
      if (fallbackError instanceof ContractError) throw error;
      throw fallbackError;
    }
  }
}

async function searchCatalogRecordingMatch(
  gateway: Gateway,
  artistName: string,
  trackTitle: string,
): Promise<ReturnType<typeof parseRecordingSearch>[number] | null> {
  const searchOnce = async (name: string, title: string, artistMbid?: string | null) => {
    const search = await jsonSearchOrStripped(
      gateway,
      buildRecordingSearchRequest(name, title, 15, "quoted", artistMbid),
      () => buildRecordingSearchRequest(name, title, 15, "stripped", artistMbid),
    );
    return selectRecordingSearchMatch(parseRecordingSearch(search.value), name, title);
  };
  const direct = await searchOnce(artistName, trackTitle);
  if (direct) return direct;
  const artistSearch = await jsonSearchOrStripped(
    gateway,
    buildArtistSearchRequest(artistName, 5),
    () => buildArtistSearchRequest(artistName, 5, "stripped"),
  );
  const artistHit = selectArtistSearchMatch(parseArtistSearch(artistSearch.value), artistName);
  if (!artistHit) return null;
  return await searchOnce(artistName, trackTitle, artistHit.mbid);
}

async function fixedPoint<T>(
  gateway: Gateway,
  entity: "artist" | "release" | "release-group" | "recording",
  requestedMbid: string,
  parser: (value: unknown) => T & { mbid: string },
): Promise<FixedPoint<T>> {
  const visited = new Set<string>();
  const aliases: Array<{ mbid: string; redirect_target_mbid: string }> = [];
  let current = requestedMbid.toLowerCase();
  for (let depth = 0; depth < MB_MAX_REDIRECTS; depth += 1) {
    if (visited.has(current)) throw new ContractError("MusicBrainz redirect cycle");
    visited.add(current);
    const response = await gateway.json(buildLookupRequest(entity, current));
    const parsed = parser(response.value);
    if (parsed.mbid === current) {
      return { value: parsed, requestedMbid, finalMbid: current, aliases };
    }
    if (visited.has(parsed.mbid)) throw new ContractError("MusicBrainz redirect cycle");
    aliases.push({ mbid: current, redirect_target_mbid: parsed.mbid });
    current = parsed.mbid;
  }
  throw new ContractError("MusicBrainz redirect depth exceeded");
}

function releaseBundle(
  candidateId: string,
  source: FixedPoint<ReturnType<typeof parseRelease>>,
  group: FixedPoint<ReturnType<typeof parseReleaseGroup>>,
  representative: FixedPoint<ReturnType<typeof parseRelease>>,
) {
  const release = representative.value;
  return {
    candidate_id: candidateId,
    source_release_mbid: source.requestedMbid,
    source_release_final_mbid: source.finalMbid,
    release_aliases: representative.aliases,
    validation_status: "applied",
    album: {
      mbid: group.finalMbid,
      aliases: group.aliases,
      title: group.value.title,
      disambiguation: group.value.disambiguation,
      primary_type: group.value.primaryType,
      secondary_types: group.value.secondaryTypes,
      first_release_date_text: group.value.firstReleaseDate,
      artist_credit: group.value.artistCredit,
      tags: group.value.tags,
      genres: group.value.genres,
    },
    release: {
      mbid: representative.finalMbid,
      title: release.title,
      status: release.status,
      quality: release.quality,
      packaging: release.packaging,
      country_code: release.country,
      release_date_text: release.date,
      barcode: release.barcode,
      text_language: release.textLanguage,
      text_script: release.textScript,
      artist_credit: release.artistCredit,
      tags: release.tags,
      genres: release.genres,
      media: release.media.map((medium) => ({
        position: medium.position,
        title: medium.title,
        format: medium.format,
        tracks: medium.tracks.map((track) => ({
          mbid: track.mbid,
          position: track.position,
          number: track.number,
          title: track.title,
          length_ms: track.lengthMs,
          artist_credit: track.artistCredit,
          recording: {
            mbid: track.recording.mbid,
            title: track.recording.title,
            disambiguation: track.recording.disambiguation,
            length_ms: track.recording.lengthMs,
            video: track.recording.video,
            first_release_date_text: track.recording.firstReleaseDate,
            artist_credit: track.recording.artistCredit,
          },
        })),
      })),
    },
  };
}

async function processLastfmArtistPool(
  gateway: Gateway,
  rpc: RpcClient,
  env: WorkerEnvironment,
  job: ClaimedWork,
): Promise<void> {
  const context = job.context;
  const method = asString(context.lastfm_method, "lastfm_method") as LastfmArtistMethod;
  if (
    method !== "geo.getTopArtists" &&
    method !== "chart.getTopArtists" &&
    method !== "tag.getTopArtists"
  ) {
    throw new LastfmContractError("unsupported Last.fm method");
  }
  const param = typeof context.lastfm_param === "string" && context.lastfm_param !== ""
    ? context.lastfm_param
    : null;
  const limit = Number(context.lastfm_limit ?? 100);
  if (!env.lastfmApiKey) throw new LastfmContractError("LASTFM_API_KEY is not configured");
  const trackMethod = artistMethodToTrackMethod(method);
  const pageSize = 100;
  const regionPolicy = catalogRegionPolicy(scheduleKeyOf(job));
  const filterRegion = regionPolicy !== "unfiltered";
  const collectLimit = filterRegion ? Math.max(limit * 5, limit) : limit;
  const maxPages = filterRegion ? 10 : 3;
  const artists: LastfmTopArtist[] = [];
  const seen = new Set<string>();
  let responseHash = "";
  for (let page = 1; page <= maxPages && artists.length < collectLimit; page += 1) {
    const lastfmUrl = buildLastfmTopTracksUrl(env.lastfmApiKey, trackMethod, param, page, pageSize);
    const lastfmResponse = await gateway.lastfmJson(lastfmUrl);
    if (!responseHash) responseHash = lastfmResponse.hash;
    const parsed = parseLastfmTopTracks(lastfmResponse.value, trackMethod, param, page, pageSize);
    for (const artist of uniqueArtistsFromTopTracks(parsed.tracks, collectLimit)) {
      const key = artist.name.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      artists.push({ ...artist, rank: artists.length + 1 });
      if (artists.length >= collectLimit) break;
    }
    if (parsed.tracks.length < pageSize) break;
    if (parsed.totalPages != null && page >= parsed.totalPages) break;
  }
  if (artists.length === 0) {
    throw new LastfmContractError("Last.fm top tracks returned no artists");
  }
  schedulerConsole("lastfm_artist_pool_from_tracks", {
    artist_method: method,
    track_method: trackMethod,
    artist_count: artists.length,
    region_policy: regionPolicy,
  });
  const matched: Array<Record<string, unknown>> = [];
  for (const artist of artists) {
    if (matched.length >= limit) break;
    if (regionPolicy === "exclude_korean" && containsHangul(artist.name)) continue;
    let artistMbid = artist.mbid;
    let matchStatus = artistMbid ? "lastfm_mbid" : "unmatched";
    if (!artistMbid) {
      const search = await jsonSearchOrStripped(
        gateway,
        buildArtistSearchRequest(artist.name, 5),
        () => buildArtistSearchRequest(artist.name, 5, "stripped"),
      );
      const hit = selectArtistSearchMatch(parseArtistSearch(search.value), artist.name);
      if (hit) {
        artistMbid = hit.mbid;
        matchStatus = "mb_search";
      }
    }
    if (regionPolicy === "korean_only" && !containsHangul(artist.name)) {
      if (!artistMbid) continue;
      if (!(await artistIsKorean(gateway, artistMbid))) continue;
    }
    if (regionPolicy === "exclude_korean" && artistMbid && await artistIsKorean(gateway, artistMbid)) {
      continue;
    }
    matched.push({
      rank: matched.length + 1,
      name: artist.name,
      lastfm_mbid: artist.mbid,
      artist_mbid: artistMbid,
      match_status: matchStatus,
      playcount: artist.playcount,
      listeners: artist.listeners,
    });
  }
  const result = await rpc.call<Array<{ applied: boolean; result_code: string; linked_artists: number }>>(
    "music_rpc_apply_lastfm_artist_pool",
    {
      p_job_id: job.job_id,
      p_fence_token: job.fence_token,
      p_response_hash: rpcBytea(responseHash),
      p_artists: matched,
    },
  );
  if (!result[0]?.applied) {
    throw new Error(`artist pool apply failed: ${result[0]?.result_code ?? "unknown"}`);
  }
}

function catalogRecordingOnlyBundle(
  candidateId: string,
  recording: ReturnType<typeof parseRecording>,
  recordingAliases: Array<{ mbid: string; redirect_target_mbid: string }>,
) {
  return {
    candidate_id: candidateId,
    requested_mbid: recording.mbid,
    canonical_mbid: recording.mbid,
    recording_aliases: recordingAliases,
    recording: {
      mbid: recording.mbid,
      title: recording.title,
      disambiguation: recording.disambiguation,
      length_ms: recording.lengthMs,
      video: recording.video,
      first_release_date_text: recording.firstReleaseDate,
      artist_credit: recording.artistCredit,
      isrcs: recording.isrcs,
      tags: recording.tags,
      genres: recording.genres,
    },
  };
}

function catalogTrackBundle(
  candidateId: string,
  recording: ReturnType<typeof parseRecording>,
  recordingAliases: Array<{ mbid: string; redirect_target_mbid: string }>,
  group: ReturnType<typeof parseReleaseGroup>,
  groupAliases: Array<{ mbid: string; redirect_target_mbid: string }>,
  release: ReturnType<typeof parseRelease>,
  releaseAliases: Array<{ mbid: string; redirect_target_mbid: string }>,
) {
  for (const medium of release.media) {
    const track = medium.tracks.find((item) => item.recording.mbid === recording.mbid);
    if (!track) continue;
    return {
      candidate_id: candidateId,
      requested_mbid: recording.mbid,
      canonical_mbid: recording.mbid,
      recording_aliases: recordingAliases,
      album: {
        mbid: group.mbid,
        aliases: groupAliases,
        title: group.title,
        disambiguation: group.disambiguation,
        primary_type: group.primaryType,
        secondary_types: group.secondaryTypes,
        first_release_date_text: group.firstReleaseDate,
        artist_credit: group.artistCredit,
        tags: group.tags,
        genres: group.genres,
      },
      release: {
        mbid: release.mbid,
        title: release.title,
        status: release.status,
        quality: release.quality,
        packaging: release.packaging,
        country_code: release.country,
        release_date_text: coalescePartialDate(
          release.date,
          recording.firstReleaseDate,
          group.firstReleaseDate,
        ),
        barcode: release.barcode,
        text_language: release.textLanguage,
        text_script: release.textScript,
        artist_credit: release.artistCredit,
        tags: release.tags,
        genres: release.genres,
        media: [{
          position: medium.position,
          title: medium.title,
          format: medium.format,
          tracks: [{
            mbid: track.mbid,
            position: track.position,
            number: track.number,
            title: track.title,
            length_ms: track.lengthMs,
            artist_credit: track.artistCredit,
            recording: {
              mbid: recording.mbid,
              title: recording.title,
              disambiguation: recording.disambiguation,
              length_ms: recording.lengthMs,
              video: recording.video,
              first_release_date_text: coalescePartialDate(
                recording.firstReleaseDate,
                group.firstReleaseDate,
              ),
              artist_credit: recording.artistCredit,
              isrcs: recording.isrcs,
              tags: recording.tags,
              genres: recording.genres,
            },
          }],
        }],
      },
    };
  }
  throw new ContractError("catalog release does not contain the matched recording");
}

async function lastfmArtistTopTags(
  gateway: Gateway,
  env: WorkerEnvironment,
  artistName: string,
  artistMbid: string | null,
): Promise<LastfmTrackTag[]> {
  const cacheKey = (artistMbid ?? artistName).trim().toLowerCase();
  const cached = gateway.lastfmArtistTagCache.get(cacheKey);
  if (cached) return cached;
  if (!env.lastfmApiKey) throw new LastfmContractError("LASTFM_API_KEY is not configured");
  const url = buildLastfmArtistTopTagsUrl(env.lastfmApiKey, {
    mbid: artistMbid,
    artist: artistName,
  });
  try {
    const response = await gateway.lastfmJson(url);
    const parsed = parseLastfmTrackTopTags(response.value);
    gateway.lastfmArtistTagCache.set(cacheKey, parsed.tags);
    if (artistMbid) {
      gateway.lastfmArtistTagCache.set(artistName.trim().toLowerCase(), parsed.tags);
    }
    return parsed.tags;
  } catch (error) {
    if (error instanceof RequestBudgetExhausted) throw error;
    if (error instanceof HttpFailure && isTransient(error.status)) throw error;
    gateway.lastfmArtistTagCache.set(cacheKey, []);
    return [];
  }
}

async function keepLastfmCatalogTrack(
  gateway: Gateway,
  env: WorkerEnvironment,
  scheduleKey: string,
  method: LastfmTrackMethod,
  param: string | null,
  track: LastfmTopTrack,
): Promise<boolean> {
  const regionPolicy = catalogRegionPolicy(scheduleKey);
  const sourceIsHipHop = lastfmCatalogSourceIsHipHop(method, param);
  const requireHipHop = lastfmCatalogRequiresHipHop(scheduleKey) && !sourceIsHipHop;
  const cheap = lastfmCheapKoreanVerdict(track.artistName, track.title);
  let tags: LastfmTrackTag[] | null = null;
  let decision = decideLastfmCatalogTrack({ regionPolicy, requireHipHop, cheap, tags });
  if (decision === "need_tags") {
    tags = await lastfmArtistTopTags(gateway, env, track.artistName, track.artistMbid);
    decision = decideLastfmCatalogTrack({ regionPolicy, requireHipHop, cheap, tags });
  }
  return decision === "keep";
}

async function processLastfmTrackPool(
  gateway: Gateway,
  rpc: RpcClient,
  env: WorkerEnvironment,
  job: ClaimedWork,
): Promise<void> {
  const context = job.context;
  const method = asString(context.lastfm_method, "lastfm_method") as LastfmTrackMethod;
  if (
    method !== "geo.getTopTracks" &&
    method !== "chart.getTopTracks" &&
    method !== "tag.getTopTracks"
  ) {
    throw new LastfmContractError("unsupported Last.fm track method");
  }
  const param = typeof context.lastfm_param === "string" && context.lastfm_param !== ""
    ? context.lastfm_param
    : null;
  const page = Number(context.page ?? 1);
  const pageSize = Number(context.page_size ?? 50);
  const trackLimit = Number(context.track_limit ?? 0);
  if (!env.lastfmApiKey) throw new LastfmContractError("LASTFM_API_KEY is not configured");
  let tracks: Array<Record<string, unknown>> = [];
  let responseHash = "0".repeat(64);
  let isLastPage = trackLimit <= 0;
  if (trackLimit > 0) {
    const lastfmUrl = buildLastfmTopTracksUrl(env.lastfmApiKey, method, param, page, pageSize);
    const lastfmResponse = await gateway.lastfmJson(lastfmUrl);
    const parsed = parseLastfmTopTracks(lastfmResponse.value, method, param, page, pageSize);
    responseHash = lastfmResponse.hash;
    const scheduleKey = scheduleKeyOf(job);
    for (const track of parsed.tracks) {
      if (!(await keepLastfmCatalogTrack(gateway, env, scheduleKey, method, param, track))) {
        continue;
      }
      tracks.push({
        rank: track.rank,
        artist_name: track.artistName,
        track_title: track.title,
        identity_key: await sha256Hex(catalogIdentityKey(track.artistName, track.title)),
        lastfm_mbid: track.mbid,
        artist_mbid: track.artistMbid,
        playcount: track.playcount,
        listeners: track.listeners,
      });
    }
    const reachedCap = method === "chart.getTopTracks" && page * pageSize >= 1000;
    isLastPage = parsed.tracks.length === 0 ||
      reachedCap ||
      (parsed.totalPages != null && page >= parsed.totalPages);
  }
  const result = await rpc.call<Array<{
    applied: boolean;
    result_code: string;
    continue_page: boolean;
  }>>(
    "music_rpc_apply_lastfm_track_pool_page",
    {
      p_job_id: job.job_id,
      p_fence_token: job.fence_token,
      p_page: page,
      p_page_size: pageSize,
      p_response_hash: rpcBytea(responseHash),
      p_tracks: tracks,
      p_is_last_page: isLastPage,
    },
  );
  if (!result[0]?.applied) {
    throw new Error(`track pool apply failed: ${result[0]?.result_code ?? "unknown"}`);
  }
  if (result[0].continue_page) {
    await rpc.call("music_rpc_continue_lastfm_track_pool", {
      p_job_id: job.job_id,
      p_fence_token: job.fence_token,
    });
  }
}

async function processCatalogTrackResolve(
  gateway: Gateway,
  rpc: RpcClient,
  job: ClaimedWork,
): Promise<void> {
  const context = job.context;
  const candidateId = asString(context.candidate_id, "candidate_id");
  const artistName = asString(context.artist_name, "artist_name");
  const trackTitle = asString(context.track_title, "track_title");
  const lastfmMbid = typeof context.lastfm_mbid === "string" && context.lastfm_mbid !== ""
    ? context.lastfm_mbid
    : null;
  const scheduleKey = scheduleKeyOf(job);
  if ((await catalogKoreanDecision(gateway, scheduleKey, artistName, trackTitle, null)) === "reject") {
    await skipCatalogRegion(rpc, job, catalogSkipReason(scheduleKey));
    return;
  }
  let recording: FixedPoint<ReturnType<typeof parseRecording>> | null = null;
  if (lastfmMbid) {
    try {
      recording = await fixedPoint(gateway, "recording", lastfmMbid, parseRecording);
    } catch (error) {
      if (
        !(error instanceof HttpFailure && (error.status === 404 || error.status === 400)) &&
        !(error instanceof ContractError)
      ) {
        throw error;
      }
    }
  }
  if (!recording) {
    const hit = await searchCatalogRecordingMatch(gateway, artistName, trackTitle);
    if (!hit) throw new ContractError("catalog recording was not matched");
    recording = await fixedPoint(gateway, "recording", hit.mbid, parseRecording);
  }
  if (
    (await catalogKoreanDecision(gateway, scheduleKey, artistName, trackTitle, recording.value)) ===
      "reject"
  ) {
    await skipCatalogRegion(rpc, job, catalogSkipReason(scheduleKey));
    return;
  }
  let payload: Record<string, unknown> = catalogRecordingOnlyBundle(
    candidateId,
    recording.value,
    recording.aliases,
  );
  const selected = selectCatalogRelease(recording.value.releases);
  if (selected) {
    try {
      const representative = await fixedPoint(gateway, "release", selected.mbid, parseRelease);
      const group = await fixedPoint(
        gateway,
        "release-group",
        representative.value.releaseGroupMbid,
        parseReleaseGroup,
      );
      payload = catalogTrackBundle(
        candidateId,
        recording.value,
        recording.aliases,
        group.value,
        group.aliases,
        representative.value,
        representative.aliases,
      );
    } catch (error) {
      if (error instanceof RequestBudgetExhausted) throw error;
      if (error instanceof HttpFailure && error.status !== 404) throw error;
      if (!(error instanceof ContractError) && !(error instanceof HttpFailure)) throw error;
    }
  }
  const applied = await rpc.call<Array<{ applied: boolean; result_code: string }>>(
    "music_rpc_apply_catalog_recording_bundle",
    { p_job_id: job.job_id, p_fence_token: job.fence_token, p_payload: payload },
  );
  if (
    !applied[0]?.applied &&
    applied[0]?.result_code !== "QUOTA_SKIP" &&
    applied[0]?.result_code !== "YEAR_QUOTA_SKIP"
  ) {
    throw new Error(`catalog apply failed: ${applied[0]?.result_code ?? "unknown"}`);
  }
}

async function processLastfmTags(
  gateway: Gateway,
  rpc: RpcClient,
  env: WorkerEnvironment,
  job: ClaimedWork,
): Promise<void> {
  if (!env.lastfmApiKey) throw new LastfmContractError("LASTFM_API_KEY is not configured");
  const context = job.context;
  const recordingId = asString(context.recording_id ?? job.entity_id, "recording_id");
  const mbid = typeof context.canonical_mbid === "string" ? context.canonical_mbid : null;
  const artistName = typeof context.artist_name === "string" ? context.artist_name : null;
  const trackTitle = typeof context.track_title === "string" ? context.track_title : null;
  const url = buildLastfmTrackTopTagsUrl(env.lastfmApiKey, {
    mbid,
    artist: artistName,
    track: trackTitle,
  });
  const response = await gateway.lastfmJson(url);
  const parsed = parseLastfmTrackTopTags(response.value);
  const selected = selectLastfmVectorTags(parsed.tags);
  const sourceMaterial = selected
    .map((tag) => `${tag.normalizedName}\u0000${tag.weightedCount}`)
    .join("\n");
  const sourceHash = await sha256Hex(`NRM-LASTFM-SOURCE-v1\u0000v1\u0000v1\u0000${sourceMaterial}`);
  const result = await rpc.call<Array<{ applied: boolean; result_code: string }>>(
    "music_rpc_apply_lastfm_tags",
    {
      p_job_id: job.job_id,
      p_fence_token: job.fence_token,
      p_payload: {
        recording_id: recordingId,
        lookup_method: mbid ? "canonical_mbid" : "exact_name",
        source_mbid: mbid,
        request_artist_name: artistName,
        request_track_name: trackTitle,
        returned_mbid: parsed.returnedMbid,
        returned_track_name: parsed.returnedTrackName,
        returned_artist_name: parsed.returnedArtistName,
        received_tag_count: parsed.tags.length,
        source_hash: sourceHash,
        match_status: selected.length >= 3 ? "matched" : parsed.tags.length === 0 ? "no_data" : "matched",
        is_verified: Boolean(mbid && parsed.returnedMbid && mbid === parsed.returnedMbid),
        tags: selected.map((tag, index) => ({
          canonical_name: tag.canonicalName,
          source_tag_name: tag.sourceTagName,
          weighted_count: tag.weightedCount,
          normalized_weight: tag.normalizedWeight,
          vector_rank: index + 1,
          category: tag.category,
          embedding_enabled: tag.embeddingEnabled,
        })),
      },
    },
  );
  if (!result[0]?.applied) {
    throw new Error(`lastfm tags apply failed: ${result[0]?.result_code ?? "unknown"}`);
  }
}

async function processLastfmTagRefresh(rpc: RpcClient, job: ClaimedWork): Promise<void> {
  const result = await rpc.call<
    Array<{ applied?: boolean; result_code?: string; has_more?: boolean; queued?: number }>
  >("music_rpc_apply_lastfm_tag_refresh_page", {
    p_job_id: job.job_id,
    p_fence_token: job.fence_token,
    p_limit: 50,
  });
  if (!result[0]?.applied) {
    throw new Error(`lastfm tag refresh failed: ${result[0]?.result_code ?? "unknown"}`);
  }
}

async function processDiscovery(gateway: Gateway, rpc: RpcClient, job: ClaimedWork): Promise<void> {
  const context = job.context;
  const scanId = asString(context.discovery_scan_id, "discovery_scan_id");
  const offset = Number(context.next_offset);
  const pageSize = 100;
  const response = await gateway.json(buildDiscoveryRequest(
    asString(context.artist_mbid, "artist_mbid"),
    asString(context.date_from, "date_from"),
    asString(context.date_to, "date_to"),
    offset,
    pageSize,
  ));
  const page = parseReleaseSearchPage(response.value);
  if (page.offset !== offset) throw new ContractError("MusicBrainz search offset mismatch");
  const result = await rpc.call<Array<{ applied: boolean; result_code: string }>>(
    "music_rpc_apply_discovery_page",
    {
      p_scan_id: scanId,
      p_fence_token: job.fence_token,
      p_offset: offset,
      p_page_size: page.candidates.length,
      p_total_count: page.totalCount,
      p_response_hash: rpcBytea(response.hash),
      p_candidates: page.candidates,
      p_is_last_page: offset + page.candidates.length >= page.totalCount || page.candidates.length === 0,
    },
  );
  if (!result[0]?.applied) throw new Error(`discovery apply failed: ${result[0]?.result_code ?? "unknown"}`);
  if (offset + page.candidates.length < page.totalCount && page.candidates.length > 0) {
    await rpc.call("music_rpc_continue_discovery_job", {
      p_job_id: job.job_id,
      p_fence_token: job.fence_token,
    });
  } else {
    await rpc.call("music_rpc_finish_job", {
      p_job_id: job.job_id,
      p_fence_token: job.fence_token,
      p_outcome: "completed",
    });
  }
}

async function processRelease(gateway: Gateway, rpc: RpcClient, job: ClaimedWork): Promise<void> {
  const context = job.context;
  const applyTarget = typeof context.apply_target === "string" ? context.apply_target : "staging";
  const candidateMbid = asString(context.release_mbid, "release_mbid");
  const source = await fixedPoint(gateway, "release", candidateMbid, parseRelease);
  const artistMbid = asString(context.artist_mbid, "artist_mbid");
  const statuses = asStringArray(context.release_statuses);
  const statusList = statuses.length > 0 ? statuses : ["Official"];
  if (applyTarget === "ledger") {
    if (!statusList.some((status) => status.toLowerCase() === (source.value.status ?? "").toLowerCase())) {
      throw new ContractError("release status is not allowed");
    }
    if (!source.value.artistCredit.some((credit) => credit.artist_mbid === artistMbid.toLowerCase())) {
      throw new ContractError("release artist credit does not contain allowlisted artist");
    }
  } else {
    validateActualRelease(
      source.value,
      artistMbid,
      asString(context.date_from, "date_from"),
      asString(context.date_to, "date_to"),
      asStringArray(context.country_codes),
      statusList,
    );
  }

  const groupMbid = source.value.releaseGroupMbid;
  const group = await fixedPoint(gateway, "release-group", groupMbid, parseReleaseGroup);
  const primaryTypes = asStringArray(context.primary_types);
  const secondaryTypes = asStringArray(context.secondary_types);
  if (primaryTypes.length > 0 &&
    (group.value.primaryType == null ||
      !primaryTypes.some((value) => value.toLowerCase() === group.value.primaryType!.toLowerCase()))) {
    throw new ContractError("release group primary type is not allowed");
  }
  if (secondaryTypes.length > 0 &&
    !group.value.secondaryTypes.some((actual) =>
      secondaryTypes.some((allowed) => allowed.toLowerCase() === actual.toLowerCase())
    )) {
    throw new ContractError("release group secondary type is not allowed");
  }

  if (applyTarget === "staging") {
    const credit = source.value.artistCredit[0]?.credited_name ?? "";
    const staged = await rpc.call<Array<{ applied: boolean; result_code: string }>>(
      "music_rpc_stage_upcoming_release",
      {
        p_job_id: job.job_id,
        p_fence_token: job.fence_token,
        p_payload: {
          candidate_id: asString(context.candidate_id, "candidate_id"),
          release_mbid: source.finalMbid,
          release_group_mbid: group.finalMbid,
          title: source.value.title,
          artist_credit_name: credit,
          artist_mbid: artistMbid,
          release_date_text: source.value.date,
          release_status: source.value.status,
          country_code: source.value.country,
          primary_type: group.value.primaryType,
          secondary_types: group.value.secondaryTypes,
        },
      },
    );
    if (!staged[0]?.applied) {
      throw new Error(`upcoming stage failed: ${staged[0]?.result_code ?? "unknown"}`);
    }
    return;
  }

  const summaries = [];
  for (let offset = 0; offset < 1000;) {
    const response = await gateway.json(buildReleaseBrowseRequest(group.finalMbid, offset));
    const page = parseReleaseBrowse(response.value);
    if (page.offset !== offset) throw new ContractError("release browse offset mismatch");
    summaries.push(...page.releases);
    offset += page.releases.length;
    if (page.releases.length === 0 || offset >= page.count) break;
  }
  const selected = selectRepresentativeRelease(summaries);
  const representative = selected.mbid === source.finalMbid
    ? source
    : await fixedPoint(gateway, "release", selected.mbid, parseRelease);
  if (representative.value.releaseGroupMbid !== group.finalMbid) {
    throw new ContractError("representative release group mismatch");
  }
  const result = await rpc.call<Array<{ applied: boolean; result_code: string }>>(
    "music_rpc_apply_release_bundle_v2",
    {
      p_job_id: job.job_id,
      p_fence_token: job.fence_token,
      p_payload: releaseBundle(
        asString(context.candidate_id, "candidate_id"),
        source,
        group,
        representative,
      ),
    },
  );
  if (!result[0]?.applied) throw new Error(`release apply failed: ${result[0]?.result_code ?? "unknown"}`);
  // promote_from_upcoming → staged row is marked by DB trigger on candidate apply.
}

async function processUpcomingVerify(gateway: Gateway, rpc: RpcClient, job: ClaimedWork): Promise<void> {
  const context = job.context;
  const releaseMbid = asString(context.release_mbid ?? job.entity_id, "release_mbid");
  try {
    const source = await fixedPoint(gateway, "release", releaseMbid, parseRelease);
    let primaryType: string | null = null;
    let secondaryTypes: string[] = [];
    try {
      const group = await fixedPoint(gateway, "release-group", source.value.releaseGroupMbid, parseReleaseGroup);
      primaryType = group.value.primaryType;
      secondaryTypes = group.value.secondaryTypes;
    } catch {
      // Group lookup is optional for verify metadata refresh.
    }
    const credit = source.value.artistCredit[0]?.credited_name ?? "";
    const result = await rpc.call<Array<{ applied: boolean; result_code: string }>>(
      "music_rpc_apply_upcoming_verify_result",
      {
        p_job_id: job.job_id,
        p_fence_token: job.fence_token,
        p_payload: {
          release_mbid: source.finalMbid,
          title: source.value.title,
          artist_credit_name: credit,
          release_group_mbid: source.value.releaseGroupMbid,
          release_date_text: source.value.date,
          release_status: source.value.status,
          country_code: source.value.country,
          primary_type: primaryType,
          secondary_types: secondaryTypes,
          http_status: 200,
        },
      },
    );
    if (!result[0]?.applied) {
      throw new Error(`upcoming verify failed: ${result[0]?.result_code ?? "unknown"}`);
    }
  } catch (error) {
    if (error instanceof HttpFailure && error.status === 404) {
      const result = await rpc.call<Array<{ applied: boolean; result_code: string }>>(
        "music_rpc_apply_upcoming_verify_result",
        {
          p_job_id: job.job_id,
          p_fence_token: job.fence_token,
          p_payload: {
            release_mbid: releaseMbid,
            http_status: 404,
            outcome_hint: "not_found",
          },
        },
      );
      if (!result[0]?.applied) {
        throw new Error(`upcoming verify 404 apply failed: ${result[0]?.result_code ?? "unknown"}`);
      }
      return;
    }
    throw error;
  }
}

async function processRecording(gateway: Gateway, rpc: RpcClient, job: ClaimedWork): Promise<void> {
  const resolution = await fixedPoint(gateway, "recording", job.entity_id, parseRecording);
  const recording = resolution.value;
  const result = await rpc.call<Array<{ applied: boolean; result_code: string }>>(
    "music_rpc_apply_recording_bundle",
    {
      p_job_id: job.job_id,
      p_fence_token: job.fence_token,
      p_payload: {
        requested_mbid: resolution.requestedMbid,
        canonical_mbid: resolution.finalMbid,
        aliases: resolution.aliases,
        title: recording.title,
        disambiguation: recording.disambiguation,
        length_ms: recording.lengthMs,
        video: recording.video,
        first_release_date_text: recording.firstReleaseDate,
        artist_credit: recording.artistCredit,
        isrcs: recording.isrcs,
        tags: recording.tags,
        genres: recording.genres,
      },
    },
  );
  if (!result[0]?.applied) throw new Error(`recording apply failed: ${result[0]?.result_code ?? "unknown"}`);
}

async function finishFailure(
  rpc: RpcClient,
  job: ClaimedWork,
  error: unknown,
): Promise<"retried" | "quarantined"> {
  if (error instanceof RequestBudgetExhausted) {
    await rpc.call("music_rpc_finish_job", {
      p_job_id: job.job_id,
      p_fence_token: job.fence_token,
      p_outcome: "retry",
      p_error_message: "worker request/time budget exhausted",
      p_retry_at: new Date(Date.now() + 60_000).toISOString(),
    });
    return "retried";
  }
  if (error instanceof HttpFailure && error.status === 404) {
    const next = notFoundRetryAt(job.attempt_count);
    await rpc.call("music_rpc_finish_job", {
      p_job_id: job.job_id,
      p_fence_token: job.fence_token,
      p_outcome: next ? "retry" : "quarantined",
      p_http_status: 404,
      p_error_message: "MusicBrainz entity not found after verification schedule",
      p_retry_at: next,
    });
    return next ? "retried" : "quarantined";
  }
  if (error instanceof HttpFailure && isTransient(error.status)) {
    await rpc.call("music_rpc_finish_job", {
      p_job_id: job.job_id,
      p_fence_token: job.fence_token,
      p_outcome: "dead",
      p_http_status: error.status || null,
      p_error_message: sanitize(error),
    });
    if (error.source === "musicbrainz" && MB_TRANSIENT_RETRY_KINDS.has(job.job_kind)) {
      await rpc.call("music_rpc_enqueue_mb_transient_retry", {
        p_job_kind: job.job_kind,
        p_entity_id: job.entity_id,
        p_source_schedule_id: typeof job.context.schedule_id === "string" ? job.context.schedule_id : null,
        p_discovery_scan_id: typeof job.context.discovery_scan_id === "string"
          ? job.context.discovery_scan_id
          : null,
        p_candidate_id: typeof job.context.candidate_id === "string"
          ? job.context.candidate_id
          : job.job_kind === "mb_catalog_track_resolve"
          ? job.entity_id
          : null,
        p_http_status: error.status || null,
        p_error_message: sanitize(error),
      });
    }
    return "quarantined";
  }
  if (error instanceof LastfmContractError || error instanceof ContractError) {
    await rpc.call("music_rpc_finish_job", {
      p_job_id: job.job_id,
      p_fence_token: job.fence_token,
      p_outcome: "quarantined",
      p_error_message: sanitize(error),
    });
    return "quarantined";
  }
  await rpc.call("music_rpc_finish_job", {
    p_job_id: job.job_id,
    p_fence_token: job.fence_token,
    p_outcome: "quarantined",
    p_error_message: sanitize(error),
  });
  return "quarantined";
}

export async function runWorker(env: WorkerEnvironment, mode: "sync" | "retention" = "sync"): Promise<WorkerResult> {
  if (!env.userAgent.includes("/") || !env.userAgent.includes("(")) {
    throw new Error("MUSICBRAINZ_USER_AGENT must include app/version and contact");
  }
  const rpc = new RpcClient(env);
  const workerId = crypto.randomUUID();
  await rpc.log("worker_start", "info", {
    worker_id: workerId,
    mode,
    has_lastfm_key: Boolean(env.lastfmApiKey),
    has_user_agent: Boolean(env.userAgent),
  });
  if (mode === "retention") {
    await rpc.call("music_rpc_capture_capacity", { p_source: "musicbrainz-cron-retention" });
    await rpc.call("music_rpc_run_retention", { p_batch_size: 1000 });
    await rpc.log("worker_retention_done", "info", { worker_id: workerId });
    return { worker_id: workerId, claimed: 0, succeeded: 0, retried: 0, quarantined: 0, requests: 0, has_more: false };
  }

  let diagnostics: Record<string, unknown> = {};
  try {
    diagnostics = await rpc.call<Record<string, unknown>>("music_rpc_scheduler_diagnostics", {});
    await rpc.log("worker_diagnostics", "info", { worker_id: workerId, diagnostics });
  } catch (error) {
    await rpc.log("worker_diagnostics_failed", "warn", {
      worker_id: workerId,
      message: sanitize(error),
    });
  }

  let claimedSchedules: Array<{
    schedule_run_id?: string;
    schedule_id?: string;
    max_request_count: number;
  }> = [];
  try {
    const claimed = await rpc.call<Array<{
      schedule_run_id?: string;
      schedule_id?: string;
      max_request_count: number;
    }>>(
      "music_rpc_claim_due_schedules",
      { p_worker_id: workerId, p_batch_size: 1, p_lease_seconds: 180 },
    );
    claimedSchedules = Array.isArray(claimed) ? claimed : [];
    await rpc.log("worker_claim_due", "info", {
      worker_id: workerId,
      claimed_schedule_count: claimedSchedules.length,
      claimed_schedules: claimedSchedules,
    });
  } catch (error) {
    await rpc.log("worker_claim_due_failed", "error", {
      worker_id: workerId,
      message: sanitize(error),
    });
  }
  const verifyBatch = await rpc.call<Array<{ enqueued?: number }> | { enqueued?: number }>(
    "music_rpc_enqueue_upcoming_verify_batch",
    { p_limit: 10 },
  );
  await rpc.log("worker_verify_enqueued", "info", {
    worker_id: workerId,
    verify_batch: verifyBatch,
  });
  const requestLimit = Math.min(45, ...claimedSchedules.map((row) => row.max_request_count), 45);
  const gateway = new Gateway(env, rpc, workerId, requestLimit, 50_000);
  const result: WorkerResult = {
    worker_id: workerId,
    claimed: 0,
    succeeded: 0,
    retried: 0,
    quarantined: 0,
    requests: 0,
    has_more: false,
  };
  while (gateway.requests < requestLimit) {
    const rows = await rpc.call<ClaimedWork[]>("music_rpc_claim_mb_work", {
      p_worker_id: workerId,
      p_batch_size: 1,
      p_lease_seconds: 180,
    });
    const job = rows[0];
    if (!job) {
      await rpc.log("worker_no_job", "info", {
        worker_id: workerId,
        claimed: result.claimed,
        requests: gateway.requests,
        request_limit: requestLimit,
      });
      break;
    }
    result.claimed += 1;
    await rpc.log("worker_job_claimed", "info", {
      worker_id: workerId,
      job_kind: job.job_kind,
      attempt_count: job.attempt_count,
      context_keys: Object.keys(job.context ?? {}),
      lastfm_method: job.context?.lastfm_method ?? null,
    }, { job_id: job.job_id });
    try {
      const run = async () => {
        if (job.job_kind === "lastfm_artist_pool") await processLastfmArtistPool(gateway, rpc, env, job);
        else if (job.job_kind === "lastfm_track_pool") await processLastfmTrackPool(gateway, rpc, env, job);
        else if (job.job_kind === "mb_catalog_track_resolve") await processCatalogTrackResolve(gateway, rpc, job);
        else if (job.job_kind === "lastfm_tags") await processLastfmTags(gateway, rpc, env, job);
        else if (job.job_kind === "lastfm_tag_refresh") await processLastfmTagRefresh(rpc, job);
        else if (job.job_kind === "mb_discovery") await processDiscovery(gateway, rpc, job);
        else if (job.job_kind === "mb_release_hydrate") await processRelease(gateway, rpc, job);
        else if (job.job_kind === "mb_upcoming_verify") await processUpcomingVerify(gateway, rpc, job);
        else await processRecording(gateway, rpc, job);
      };
      await runJobWithTransientRetries(env, job, run);
      result.succeeded += 1;
      await rpc.log("worker_job_succeeded", "info", {
        worker_id: workerId,
        job_kind: job.job_kind,
      }, { job_id: job.job_id });
    } catch (error) {
      const outcome = await finishFailure(rpc, job, error);
      result[outcome] += 1;
      await rpc.log("worker_job_failed", "error", {
        worker_id: workerId,
        job_kind: job.job_kind,
        outcome,
        message: sanitize(error),
      }, { job_id: job.job_id });
      if (error instanceof RequestBudgetExhausted) {
        result.has_more = true;
        break;
      }
    }
  }
  const finalize = await rpc.call<Array<{ has_more: boolean }>>("music_rpc_finalize_mb_runs", {
    p_worker_id: workerId,
  });
  result.has_more ||= finalize[0]?.has_more ?? false;
  result.requests = gateway.requests;
  await rpc.log("worker_done", "info", {
    worker_id: workerId,
    claimed: result.claimed,
    succeeded: result.succeeded,
    retried: result.retried,
    quarantined: result.quarantined,
    requests: result.requests,
    has_more: result.has_more,
    request_limit: requestLimit,
  });
  return result;
}
