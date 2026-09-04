import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const migrationPath = path.join(
  root,
  "supabase/migrations/20260904151000_system_schedule_timing_only.sql",
);
const sql = fs.readFileSync(migrationPath, "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(sql.includes("interval_minutes between 1 and 1440"), "1..1440 interval constraint missing");
assert(
  sql.includes("'schedule_kind', 'daily_time_kst', 'interval_minutes'") &&
    sql.includes("'next_run_at', 'is_enabled'") &&
    !sql.includes("date_from_offset_days"),
  "music update payload must be timing/enabled only",
);
assert(
  sql.includes("retention_days") && sql.includes("ailab_chat_retention"),
  "chat retention edit path missing",
);

console.log("system schedule timing-only static checks passed");
