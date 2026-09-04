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
assert(worker.includes("music_rpc_apply_lastfm_artist_pool"), "Last.fm pool apply RPC is missing");
assert(index.includes("LASTFM_API_KEY"), "LASTFM_API_KEY wiring is missing");
assert(parser.includes("buildArtistSearchRequest"), "MusicBrainz artist search builder is missing");

console.log("musicbrainz worker static checks passed");
