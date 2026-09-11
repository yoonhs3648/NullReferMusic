import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const migrationPath = path.join(
  root,
  "supabase/migrations/20260908100000_system_schedule_log_and_dispatch.sql",
);
const worker = fs.readFileSync(
  path.join(root, "supabase/functions/musicbrainz-sync/worker.ts"),
  "utf8",
);
const index = fs.readFileSync(
  path.join(root, "supabase/functions/musicbrainz-sync/index.ts"),
  "utf8",
);
const sql = fs.readFileSync(migrationPath, "utf8");
const grantSql = fs.readFileSync(
  path.join(root, "supabase/migrations/20260908114000_schedule_owner_grants_and_claim_fix.sql"),
  "utf8",
);
const overviewSql = fs.readFileSync(
  path.join(root, "supabase/migrations/20260908125000_admin_overview_all_job_kinds.sql"),
  "utf8",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const name of [
  "nrm_system_schedule_log",
  "nrm_system_schedule_run",
  "nrm_rpc_system_schedule_log_append",
  "nrm_rpc_system_schedule_log_page",
  "nrm_rpc_musicbrainz_dispatcher_cron",
  "music_rpc_scheduler_diagnostics",
  "music_rpc_recover_stale_collection",
]) {
  assert(sql.includes(name), `missing ${name}`);
}

assert(sql.includes("dispatcher_skipped"), "vault-missing cron must log dispatcher_skipped");
assert(sql.includes("mb_upcoming_verify") === false || sql.includes("lastfm_artist_pool"), "busy definition present");
assert(
  sql.includes("'lastfm_artist_pool', 'mb_discovery', 'mb_release_hydrate', 'mb_recording_hydrate'"),
  "busy must not stall on verify-only jobs",
);
assert(sql.includes("run_now_exception"), "run_now must persist SQL exceptions");
assert(sql.includes("raise log 'nrm-schedule"), "cron/rpc must RAISE LOG for postgres logs");
assert(!sql.includes("'recent_logs'"), "admin overview must not expose diagnostic logs");
assert(!sql.includes("'system_runs'"), "admin overview must not replace music_schedule_run");
assert(sql.includes("select public.nrm_rpc_musicbrainz_dispatcher_cron()"), "cron must call dispatcher wrapper");
assert(worker.includes("nrm_rpc_system_schedule_log_append"), "edge must persist scheduler logs");
assert(worker.includes("music_rpc_scheduler_diagnostics"), "edge must snapshot diagnostics");
assert(worker.includes("worker_claim_due_failed"), "edge must persist claim_due RPC failures");
assert(
  grantSql.includes("grant select, update on table public.nrm_system_schedule to nrm_music_rpc_owner"),
  "music rpc owner must be able to sync nrm_system_schedule next_run_at",
);
assert(grantSql.includes("claim_due_exception"), "claim_due must persist SQL exceptions");
assert(grantSql.includes("due_queue_cleared"), "stuck due queue must be released");
assert(overviewSql.includes("from public.nrm_system_schedule_run"), "overview must include retention runs");
assert(overviewSql.includes("ailab_chat_retention"), "overview must include chat retention");
assert(overviewSql.includes("track_history_retention"), "overview must include track history retention");
assert(!overviewSql.includes("alter function public.music_rpc_admin_overview"), "do not change overview owner");
const overviewNamesSql = fs.readFileSync(
  path.join(root, "supabase/migrations/20260908133000_admin_overview_run_display_names.sql"),
  "utf8",
);
assert(overviewNamesSql.includes("'display_name'"), "overview runs must include schedule display_name");
assert(overviewNamesSql.includes("v_run_limit := least(p_limit, 200)"), "overview run history limit must be 200");
assert(index.includes("http_unauthorized") && index.includes("has_lastfm_key"), "edge http logs missing");
assert(!sql.match(/Bearer\s+[A-Za-z0-9_-]{20,}/), "literal bearer secret found");

console.log("system schedule log/dispatch static checks passed");
