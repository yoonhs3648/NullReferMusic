import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sql = fs.readFileSync(
  path.join(root, "supabase/migrations/20260911100000_disable_all_schedulers_and_wipe_collected_data.sql"),
  "utf8",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(sql.includes("is_enabled = false"), "must disable schedules");
assert(
  sql.includes("update public.nrm_system_schedule") &&
    sql.includes("where job_kind <> 'musicbrainz_collection'"),
  "must disable retention/ops schedules too",
);
assert(sql.includes("delete from public.music_mb_transient_retry"), "must wipe 503 retry queue");
assert(sql.includes("delete from public.music_recording"), "must wipe recording ledger");
assert(sql.includes("delete from public.music_upcoming_release"), "must wipe upcoming staging");
assert(!/set is_enabled = true/.test(sql), "must not restore enabled schedules");
assert(
  !/is_enabled = schedule_id = any/.test(sql) && !/is_enabled = s\.schedule_id = any/.test(sql),
  "must not restore previously enabled schedules",
);

console.log("disable-all-schedulers wipe static checks passed");
