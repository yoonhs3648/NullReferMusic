import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const worker = read("supabase/functions/musicbrainz-sync/worker.ts");
const parser = read("supabase/functions/musicbrainz-sync/musicbrainz.ts");
const index = read("supabase/functions/musicbrainz-sync/index.ts");
const rpc = read("supabase/migrations/20260904140000_musicbrainz_durable_worker.sql");
const cron = read("supabase/migrations/20260904141000_musicbrainz_cron.sql");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function structuralScan(source, label) {
  let mode = "normal";
  let dollarTag = "";
  let depth = 0;
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];
    const n = source[i + 1];
    if (mode === "line-comment") {
      if (c === "\n") mode = "normal";
      continue;
    }
    if (mode === "block-comment") {
      if (c === "*" && n === "/") {
        mode = "normal";
        i += 1;
      }
      continue;
    }
    if (mode === "single") {
      if (c === "'" && n === "'") i += 1;
      else if (c === "'") mode = "normal";
      continue;
    }
    if (mode === "dollar") {
      if (source.startsWith(dollarTag, i)) {
        i += dollarTag.length - 1;
        mode = "normal";
      }
      continue;
    }
    if (c === "-" && n === "-") {
      mode = "line-comment";
      i += 1;
    } else if (c === "/" && n === "*") {
      mode = "block-comment";
      i += 1;
    } else if (c === "'") {
      mode = "single";
    } else if (c === "$") {
      const match = source.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (match) {
        dollarTag = match[0];
        mode = "dollar";
        i += dollarTag.length - 1;
      }
    } else if (c === "(") depth += 1;
    else if (c === ")") {
      depth -= 1;
      assert(depth >= 0, `${label}: unmatched closing parenthesis`);
    }
  }
  assert(mode === "normal" || mode === "line-comment", `${label}: unterminated ${mode}`);
  assert(depth === 0, `${label}: unbalanced SQL parentheses`);
}

structuralScan(rpc, "worker migration");
structuralScan(cron, "cron migration");

for (const name of [
  "music_rpc_claim_mb_work",
  "music_rpc_continue_discovery_job",
  "music_rpc_apply_release_bundle_v2",
  "music_rpc_apply_recording_bundle",
  "music_rpc_finalize_mb_runs",
]) {
  assert(rpc.includes(`create function public.${name}(`), `missing worker RPC: ${name}`);
  assert(rpc.includes(`alter function public.${name}(`), `missing worker RPC owner: ${name}`);
}

assert(worker.includes("Math.min(45,"), "45-request hard limit is missing");
assert(worker.includes("50_000"), "50-second worker budget is missing");
assert(worker.includes("music_rpc_acquire_mb_permit"), "global permit RPC is not used");
assert(worker.includes("[1, 7, 30]"), "404 verification schedule is missing");
assert(worker.includes("Retry-After") || worker.includes("retryAfter"), "Retry-After handling is missing");
assert(worker.includes("fixedPoint") && worker.includes("MB_MAX_REDIRECTS"), "fixed-point redirects are missing");
assert(rpc.includes("attempt_count = j.attempt_count + 1"),
  "claim RPC must qualify attempt_count against the job table");
assert(parser.includes("release-events") && parser.includes("validateActualRelease"),
  "actual release-event validation is missing");
assert(parser.includes("earliestPartialDate") && worker.includes("coalescePartialDate"),
  "empty MusicBrainz dates must fall back without extra lookups");
assert(parser.includes("Date.UTC") && parser.includes("dateOverlaps"), "partial date calendar validation is missing");
assert(parser.includes("selectRepresentativeRelease"), "representative release selection is missing");
assert(!rpc.match(/\b(raw_response|response_json|raw_json)\b/i), "raw response persistence found in migration");
assert(index.includes("MUSICBRAINZ_CRON_TOKEN"), "dedicated Cron token validation is missing");
assert(cron.includes("vault.decrypted_secrets"), "Vault lookup is missing");
assert(cron.includes("nrm-musicbrainz-dispatcher") && cron.includes("nrm-musicbrainz-retention"),
  "required Cron jobs are missing");
assert(!cron.match(/Bearer\s+[A-Za-z0-9_-]{20,}/), "literal bearer secret found");
assert(!rpc.match(/music_artist_allowlist[\s\S]{0,100}\bvalues\s*\(/i),
  "worker migration must not seed allowlist");

assert(worker.includes("lastfm_artist_pool"), "Last.fm artist pool job handling is missing");
assert(worker.includes("lastfm_tag_refresh"), "Last.fm tag refresh job handling is missing");
assert(worker.includes("music_rpc_apply_lastfm_tag_refresh_page"), "tag refresh apply RPC is missing");
assert(worker.includes("runJobWithTransientRetries"), "5xx must retry the current job inside the worker tick");
assert(!worker.includes("http5xxRetryAt"), "5xx must not requeue other songs as retry jobs");
assert(worker.includes("[3_000, 3_000, 3_000]"), "5xx retries must wait 3 seconds each");
assert(worker.includes("HTTP_5XX_MAX_RETRIES = 3"), "HTTP 5xx retries must stop at 3");
assert(!worker.includes("lastfmJob ? 16 : 8"), "16/8 unbounded 5xx retries must not remain");
assert(worker.includes("lastfm_http_retry"), "Last.fm HTTP 5xx must retry inside the worker tick");
assert(worker.includes("artistMethodToTrackMethod"), "artist pool must use the working Top Tracks endpoints");
assert(worker.includes("NullReferMusic/lastfm-sync"), "Last.fm must not reuse the MusicBrainz User-Agent");
assert(worker.includes("lastfm_http_error"), "Last.fm HTTP errors must log a sanitized body");
assert(worker.includes("music_rpc_apply_lastfm_artist_pool"), "Last.fm pool apply RPC is missing");
assert(worker.includes("music_rpc_apply_catalog_recording_bundle"), "catalog apply RPC is missing");
assert(worker.includes("catalogRecordingOnlyBundle"), "catalog must persist recording without release");
assert(!worker.includes("catalog recording has no release"), "empty releases must not quarantine catalog jobs");
assert(worker.includes("classifyKoreanWork"), "korea-catalog must filter non-korean recordings");
assert(worker.includes("catalogRegionPolicy"), "global/hiphop must exclude korean works");
assert(worker.includes("music_rpc_skip_catalog_recording"), "korea-catalog skip RPC wiring missing");
assert(parser.includes("classifyKoreanWork") && parser.includes("catalogRegionPolicy"),
  "korean work classifier is missing");
assert(index.includes("LASTFM_API_KEY"), "LASTFM_API_KEY wiring is missing");
assert(parser.includes("buildArtistSearchRequest"), "MusicBrainz artist search builder is missing");
assert(parser.includes("quoteLucene") && parser.includes("LUCENE_ESCAPE_CHARS"),
  "MusicBrainz Lucene reserved-char escaping is missing");
assert(worker.includes("jsonSearchOrStripped") && worker.includes('"stripped"'),
  "HTTP 400 search must retry with stripped Lucene terms");
assert(worker.includes("searchCatalogRecordingMatch") && worker.includes("buildArtistSearchRequest"),
  "catalog name search must fall back to artist MBID then arid+title");
assert(parser.includes("catalogCoreTitle") && parser.includes("catalogMatchKey") && parser.includes("artistname:"),
  "catalog search must normalize feat titles and query artist aliases");
assert(worker.includes("music_rpc_enqueue_mb_transient_retry"),
  "MusicBrainz 503 dead jobs must be queued for the interval retry schedule");
assert(worker.includes("nrm_rpc_system_schedule_log_append"), "worker must persist scheduler logs");
assert(index.includes("http_authorized"), "edge must log authorized ticks");

console.log("musicbrainz worker static checks passed");
