import {
  assertAllowedFinalUrl,
  buildArtistSearchRequest,
  buildDiscoveryRequest,
  buildLookupRequest,
  buildReleaseBrowseRequest,
  ContractError,
  MB_MAX_REDIRECTS,
  parseArtistSearch,
  parseRecording,
  parseRelease,
  parseReleaseBrowse,
  parseReleaseGroup,
  parseReleaseSearchPage,
  selectArtistSearchMatch,
  selectRepresentativeRelease,
  validateActualRelease,
} from "./musicbrainz.ts";
import {
  assertAllowedLastfmUrl,
  buildLastfmTopArtistsUrl,
  LastfmContractError,
  type LastfmMethod,
  parseLastfmTopArtists,
} from "./lastfm.ts";

export interface WorkerEnvironment {
  supabaseUrl: string;
  serviceRoleKey: string;
  userAgent: string;
  lastfmApiKey?: string;
  fetcher?: typeof fetch;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
}

interface ClaimedWork {
  job_id: string;
  job_kind:
    | "lastfm_artist_pool"
    | "mb_discovery"
    | "mb_release_hydrate"
    | "mb_recording_hydrate";
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
  ) {
    super(message);
  }
}

class RpcClient {
  constructor(private readonly env: WorkerEnvironment) {}

  async call<T>(name: string, body: Record<string, unknown>): Promise<T> {
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
    return await response.json() as T;
  }
}

class Gateway {
  requests = 0;
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
    return await this.fetchJson(url, assertAllowedFinalUrl);
  }

  async lastfmJson(url: URL): Promise<{ value: unknown; finalUrl: string; hash: string }> {
    if (!this.remaining()) throw new RequestBudgetExhausted("request budget exhausted");
    this.requests += 1;
    return await this.fetchJson(url, assertAllowedLastfmUrl);
  }

  private async fetchJson(
    url: URL,
    assertUrl: (finalUrl: string) => void,
  ): Promise<{ value: unknown; finalUrl: string; hash: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let response: Response;
    try {
      response = await (this.env.fetcher ?? fetch)(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": this.env.userAgent,
        },
      });
    } catch (error) {
      throw new HttpFailure(0, null, error instanceof Error ? error.message : "network failure");
    } finally {
      clearTimeout(timeout);
    }
    assertUrl(response.url || url.href);
    if (!response.ok) {
      throw new HttpFailure(response.status, response.headers.get("retry-after"), `HTTP ${response.status}`);
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

function asString(value: unknown, label: string): string {
  if (typeof value !== "string" || value === "") throw new ContractError(`${label} is missing`);
  return value;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) return [];
  return value as string[];
}

function retryAt(attempt: number, retryAfter: string | null, random: () => number): string {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    const parsed = Number.isFinite(seconds) ? Date.now() + seconds * 1000 : Date.parse(retryAfter);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  const cap = Math.min(30_000 * 2 ** Math.max(0, attempt - 1), 6 * 60 * 60 * 1000);
  return new Date(Date.now() + Math.max(1000, Math.floor(random() * cap))).toISOString();
}

function notFoundRetryAt(attempt: number): string | null {
  const days = [1, 7, 30][attempt - 1];
  return days == null ? null : new Date(Date.now() + days * 86_400_000).toISOString();
}

function sanitize(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/Bearer\s+\S+/gi, "Bearer [redacted]").replace(/[?&](?:token|key)=[^&\s]+/gi, "").slice(0, 900);
}

function isTransient(status: number): boolean {
  return status === 0 || [408, 429, 500, 502, 503, 504].includes(status);
}

async function fixedPoint<T>(
  gateway: Gateway,
  entity: "release" | "release-group" | "recording",
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
  const method = asString(context.lastfm_method, "lastfm_method") as LastfmMethod;
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
  const lastfmUrl = buildLastfmTopArtistsUrl(env.lastfmApiKey, method, param, limit);
  const lastfmResponse = await gateway.lastfmJson(lastfmUrl);
  const page = parseLastfmTopArtists(lastfmResponse.value, method, param, limit);
  const matched: Array<Record<string, unknown>> = [];
  for (const artist of page.artists) {
    let artistMbid = artist.mbid;
    let matchStatus = artistMbid ? "lastfm_mbid" : "unmatched";
    if (!artistMbid) {
      const search = await gateway.json(buildArtistSearchRequest(artist.name, 5));
      const hit = selectArtistSearchMatch(parseArtistSearch(search.value), artist.name);
      if (hit) {
        artistMbid = hit.mbid;
        matchStatus = "mb_search";
      }
    }
    matched.push({
      rank: artist.rank,
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
      p_response_hash: rpcBytea(lastfmResponse.hash),
      p_artists: matched,
    },
  );
  if (!result[0]?.applied) {
    throw new Error(`artist pool apply failed: ${result[0]?.result_code ?? "unknown"}`);
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
  const candidateMbid = asString(context.release_mbid, "release_mbid");
  const source = await fixedPoint(gateway, "release", candidateMbid, parseRelease);
  validateActualRelease(
    source.value,
    asString(context.artist_mbid, "artist_mbid"),
    asString(context.date_from, "date_from"),
    asString(context.date_to, "date_to"),
    asStringArray(context.country_codes),
    asStringArray(context.release_statuses),
  );

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
  random: () => number,
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
    const exhausted = job.attempt_count >= 8;
    await rpc.call("music_rpc_finish_job", {
      p_job_id: job.job_id,
      p_fence_token: job.fence_token,
      p_outcome: exhausted ? "dead" : "retry",
      p_http_status: error.status || null,
      p_error_message: sanitize(error),
      p_retry_at: exhausted ? null : retryAt(job.attempt_count, error.retryAfter, random),
    });
    return exhausted ? "quarantined" : "retried";
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
  if (mode === "retention") {
    await rpc.call("music_rpc_capture_capacity", { p_source: "musicbrainz-cron-retention" });
    await rpc.call("music_rpc_run_retention", { p_batch_size: 1000 });
    return { worker_id: workerId, claimed: 0, succeeded: 0, retried: 0, quarantined: 0, requests: 0, has_more: false };
  }

  const claimedSchedules = await rpc.call<Array<{ max_request_count: number }>>(
    "music_rpc_claim_due_schedules",
    { p_worker_id: workerId, p_batch_size: 3, p_lease_seconds: 180 },
  );
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
  const random = env.random ?? Math.random;

  while (gateway.requests < requestLimit) {
    const rows = await rpc.call<ClaimedWork[]>("music_rpc_claim_mb_work", {
      p_worker_id: workerId,
      p_batch_size: 1,
      p_lease_seconds: 180,
    });
    const job = rows[0];
    if (!job) break;
    result.claimed += 1;
    try {
      if (job.job_kind === "lastfm_artist_pool") await processLastfmArtistPool(gateway, rpc, env, job);
      else if (job.job_kind === "mb_discovery") await processDiscovery(gateway, rpc, job);
      else if (job.job_kind === "mb_release_hydrate") await processRelease(gateway, rpc, job);
      else await processRecording(gateway, rpc, job);
      result.succeeded += 1;
    } catch (error) {
      const outcome = await finishFailure(rpc, job, error, random);
      result[outcome] += 1;
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
  return result;
}
