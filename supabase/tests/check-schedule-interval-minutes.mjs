import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sql = fs.readFileSync(
  path.join(root, "supabase/migrations/20260910160000_schedule_interval_minutes.sql"),
  "utf8",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  sql.includes("check (schedule_kind in ('daily', 'weekly', 'monthly', 'once', 'interval'))"),
  "interval must be a valid schedule_kind",
);
assert(sql.includes("interval_minutes between 1 and 10080"), "interval 1..10080 missing");
assert(
  !sql.includes("interval is no longer supported"),
  "update RPC must accept interval again",
);
assert(sql.includes("v_interval"), "update must persist interval_minutes");
assert(
  sql.includes("'daily', 'weekly', 'monthly', 'once', 'interval'"),
  "kind allow-list must include interval",
);

console.log("interval schedule minutes static checks passed");
