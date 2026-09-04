import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sql = fs.readFileSync(
  path.join(root, "supabase/migrations/20260904161000_track_history_retention.sql"),
  "utf8",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(sql.includes("'track-history-retention'"), "missing schedule seed key");
assert(sql.includes("'track_history_retention'"), "missing job_kind");
assert(sql.includes("time '08:00'"), "missing daily 08:00 KST");
assert(sql.includes("'retention_days', 180"), "missing default 180 days");
assert(
  sql.includes("nrm_rpc_track_history_retention_run") &&
    sql.includes('delete from public."TrackHistory"') &&
    sql.includes('"DownloadDate"'),
  "TrackHistory retention delete RPC missing",
);
assert(
  sql.includes("job_kind in ('ailab_chat_retention', 'track_history_retention')"),
  "tick must process both retention kinds",
);
assert(
  sql.includes("and job_kind = 'musicbrainz_collection'"),
  "capacity disable must leave retention schedules enabled",
);

console.log("track history retention contract checks passed");
