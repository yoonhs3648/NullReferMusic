import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sql = [
  "supabase/migrations/20260909100000_admin_schedule_run_failures.sql",
  "supabase/migrations/20260910170000_admin_run_success_failure_ui.sql",
  "supabase/migrations/20260910181000_admin_failure_job_status.sql",
].map((rel) => fs.readFileSync(path.join(root, rel), "utf8")).join("\n");
const latest = fs.readFileSync(
  path.join(root, "supabase/migrations/20260910181000_admin_failure_job_status.sql"),
  "utf8",
);
const previous = fs.readFileSync(
  path.join(root, "supabase/migrations/20260910170000_admin_run_success_failure_ui.sql"),
  "utf8",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(sql.includes("music_rpc_admin_schedule_run_failures"), "failures RPC missing");
assert(sql.includes("music_admin_canonical_failure_message"), "canonical message helper missing");
assert(sql.includes("catalog recording was not matched"), "unmatched message missing");
assert(sql.includes("ck_music_release_representative_retired"), "representative constraint message missing");
assert(sql.includes("catalog recording has no release"), "no-release message missing");
assert(sql.includes("p_limit integer default 50"), "pagination missing");
assert(sql.includes("artist_name"), "catalog artist join missing");
assert(sql.includes("track_title"), "catalog title join missing");
assert(sql.includes("job_status in ('dead', 'quarantined', 'blocked')"), "terminal job filter missing");
assert(sql.includes("j.job_kind = 'mb_upcoming_verify'"), "upcoming join must be job_kind scoped");
assert(!sql.includes("or (u.upcoming_id = j.entity_id)"), "upcoming join must not match all upcoming_id");
assert(!sql.includes("create table"), "must not create a new table");
assert(sql.includes("grant execute on function public.music_rpc_admin_schedule_run_failures"), "anon grant missing");
assert(!latest.includes("j.context"), "failures RPC must not read music_sync_job.context");
assert(latest.includes("coalesce(j.candidate_id, j.entity_id)"), "failures must resolve catalog names without context");
assert(latest.includes("f.job_status"), "failures RPC must return job_status");
assert(previous.includes("collection_mode = 'mb_transient_retry'"), "503 retry close status missing");
assert(previous.includes("then 'failed'"), "503 retry with failures must close as failed");

console.log("admin schedule run failures static checks passed");
