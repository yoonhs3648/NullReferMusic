import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const migrationPath = path.join(
  root,
  "supabase/migrations/20260904132000_music_collection_schema_contract.sql",
);
const sql = fs.readFileSync(migrationPath, "utf8");
const adminSql = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260904143000_music_admin_allowlist_dead_letter.sql",
  ),
  "utf8",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function structuralScan(source) {
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
      assert(depth >= 0, `unmatched closing parenthesis at byte ${i}`);
    }
  }
  assert(mode === "normal" || mode === "line-comment", `unterminated SQL lexical state: ${mode}`);
  assert(depth === 0, `unbalanced SQL parentheses: ${depth}`);
}

structuralScan(sql);
structuralScan(adminSql);

const requiredTables = [
  "music_collection_schedule",
  "music_artist_allowlist",
  "music_schedule_artist",
  "music_schedule_run",
  "music_discovery_scan",
  "music_release_candidate",
  "music_api_limiter",
  "music_capacity_policy",
  "music_capacity_snapshot",
  "music_capacity_event",
  "music_retention_policy",
  "music_purge_batch",
  "music_purge_entity_tombstone",
  "music_recording_purge_tombstone",
];
for (const table of requiredTables) {
  assert(
    sql.includes(`create table public.${table} (`),
    `missing table declaration: ${table}`,
  );
  assert(
    sql.includes(`'${table}'`) && sql.includes("enable row level security"),
    `missing RLS registration: ${table}`,
  );
}

const requiredFunctions = [
  "music_rpc_claim_due_schedules",
  "music_rpc_finish_schedule_run",
  "music_rpc_acquire_mb_permit",
  "music_rpc_claim_jobs",
  "music_rpc_finish_job",
  "music_rpc_apply_discovery_page",
  "music_rpc_apply_release_bundle",
  "music_rpc_capture_capacity",
  "music_rpc_run_retention",
  "music_rpc_capacity_purge",
  "music_rpc_admin_schedule_upsert",
  "music_rpc_admin_schedule_set_enabled",
  "music_rpc_admin_schedule_run_now",
  "music_rpc_admin_allowlist_upsert",
  "music_rpc_admin_allowlist_set_enabled",
  "music_rpc_admin_overview",
];
for (const fn of requiredFunctions) {
  assert(sql.includes(`create function public.${fn}(`), `missing function: ${fn}`);
  assert(
    sql.includes(`alter function public.${fn}(`) &&
      sql.includes("owner to nrm_music_rpc_owner"),
    `missing NOLOGIN owner assignment: ${fn}`,
  );
}

assert(
  sql.includes("current_user = 'nrm_music_rpc_owner'") &&
    sql.includes("current_setting('nrm.music_capacity_purge', true) = 'on'"),
  "controlled purge trigger requires both owner and local-context guards",
);
assert(
  sql.includes("revoke delete on table") &&
    sql.includes("public.music_recording_mbid") &&
    sql.includes("from service_role"),
  "service_role authority DELETE revocation is missing",
);
assert(
  sql.includes("not (t.track_id = any") &&
    sql.includes("music_recording_purge_tombstone"),
  "shared Recording protection or Recording tombstone is missing",
);
assert(!/\b(create|insert)\b[\s\S]*music_artist_allowlist[\s\S]*values\s*\(\s*'[0-9a-f-]{36}'/i.test(sql),
  "initial allowlist seed must not be included in this migration");

for (const fn of [
  "music_rpc_admin_allowlist_page",
  "music_rpc_admin_dead_letter_page",
  "music_rpc_admin_dead_letter_resolve",
  "music_rpc_admin_dead_letter_retry",
]) {
  assert(adminSql.includes(`create function public.${fn}(`), `missing admin function: ${fn}`);
  assert(
    adminSql.includes(`alter function public.${fn}(`) &&
      adminSql.includes("owner to nrm_music_rpc_owner"),
    `missing admin function owner: ${fn}`,
  );
}
assert(
  adminSql.includes("job_status = 'pending'") &&
    adminSql.includes("attempt_count = 0") &&
    adminSql.includes("resolved_at = now()"),
  "dead-letter retry must atomically requeue and resolve",
);

console.log("music collection schema contract static checks passed");
