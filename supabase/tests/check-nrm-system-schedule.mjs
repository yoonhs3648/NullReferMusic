import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const migrationPath = path.join(
  root,
  "supabase/migrations/20260904150000_nrm_system_schedule.sql",
);
const sql = fs.readFileSync(migrationPath, "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const key of [
  "musicbrainz-k-pop-daily",
  "musicbrainz-korean-hip-hop-daily",
  "musicbrainz-global-chart-daily",
  "ailab-chat-retention",
]) {
  assert(sql.includes(`'${key}'`), `missing system schedule seed ${key}`);
}

assert(
  sql.includes("create table public.nrm_system_schedule"),
  "nrm_system_schedule table missing",
);
assert(
  sql.includes("nrm_forbid_schedule_row_delete") &&
    sql.includes("trg_nrm_system_schedule_forbid_delete") &&
    sql.includes("trg_music_collection_schedule_forbid_delete"),
  "schedule delete forbid triggers missing",
);
assert(
  sql.includes("schedule create is forbidden") &&
    sql.includes("p_schedule_id is null"),
  "update-only schedule upsert guard missing",
);
assert(
  sql.includes("schedule_key is immutable"),
  "music schedule_key immutability guard missing",
);
assert(
  sql.includes("nrm_rpc_ailab_chat_retention_run") &&
    sql.includes('delete from public."ChatMessage"') &&
    sql.includes('delete from public."ChatSession"') &&
    sql.includes('"UpdateDate"'),
  "chat hard-delete retention RPC missing",
);
assert(
  sql.includes("jsonb_build_object('retention_days', 30)"),
  "default retention_days=30 missing",
);
assert(
  sql.includes("nrm_rpc_system_schedule_list") &&
    sql.includes("nrm_rpc_system_schedule_set_enabled") &&
    sql.includes("nrm_rpc_system_schedule_update") &&
    sql.includes("nrm_rpc_system_schedule_run_now") &&
    sql.includes("nrm_rpc_system_schedule_tick"),
  "system schedule admin/tick RPCs missing",
);
assert(
  sql.includes("nrm-system-schedule-tick") && sql.includes("* * * * *"),
  "system schedule cron missing",
);
assert(
  !sql.includes("nrm_rpc_system_schedule_delete") &&
    !sql.includes("admin_schedule_delete"),
  "schedule delete RPC must not exist",
);

console.log("system schedule static checks passed");
