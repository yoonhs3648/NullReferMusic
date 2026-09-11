import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sql = fs.readFileSync(
  path.join(root, "supabase/migrations/20260910140000_schedule_flexible_timing.sql"),
  "utf8",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  sql.includes("check (schedule_kind in ('daily', 'weekly', 'monthly', 'once'))"),
  "schedule_kind must be daily/weekly/monthly/once",
);
assert(
  !sql.includes("check (schedule_kind in ('daily', 'interval', 'weekly', 'monthly'))"),
  "new CHECK must not include interval",
);
assert(sql.includes("monthly_day between 1 and 31"), "monthly_day 1..31 missing");
assert(sql.includes("once_on_date is not null"), "once_on_date required for once");
assert(
  sql.includes("nrm_system_schedule_next_once_run") &&
    sql.includes("p_monthly_day") &&
    sql.includes("p_once_on_date"),
  "once/monthly next-run helpers missing",
);
assert(
  sql.includes("'monthly_day', 'once_on_date'") ||
    sql.includes("'monthly_day', 'once_on_date', 'next_run_at'"),
  "update payload must accept monthly_day/once_on_date",
);
assert(
  sql.includes("is_enabled = case when schedule_kind = 'once' then false else is_enabled end"),
  "once must disable after claim/run",
);
assert(
  sql.includes("is_enabled = case when v_sched.schedule_kind = 'once' then false else is_enabled end"),
  "once must disable after tick",
);
assert(
  sql.includes("interval is no longer supported"),
  "update RPC must reject leftover interval kind",
);

console.log("flexible schedule timing static checks passed");
