import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const project1Sql = read(
  "supabase/migrations/20260904152000_capacity_450mb_scheduler_off.sql",
);
const project2Sql = read(
  "supabase-vector/migrations/20260904152000_vector_capacity_450mb.sql",
);
const edge = read("supabase/functions/music-admin-capacity/index.ts");
const client = read("app/lib/nrmSupabaseCapacityAdminClient.ts");

for (const [name, sql, rpc] of [
  ["project1", project1Sql, "music_rpc_capacity_status"],
  ["project2", project2Sql, "vector_rpc_capacity_status"],
]) {
  assert(sql.includes(`function public.${rpc}()`), `${name}: RPC missing`);
  assert(/security definer/i.test(sql), `${name}: SECURITY DEFINER missing`);
  assert(/set search_path = ''/i.test(sql), `${name}: empty search_path missing`);
  assert(
    new RegExp(`revoke all on function public\\.${rpc}\\(\\) from public, anon, authenticated`, "i").test(sql),
    `${name}: app-role revoke missing`,
  );
  assert(
    new RegExp(`grant execute on function public\\.${rpc}\\(\\) to service_role`, "i").test(sql),
    `${name}: service-role grant missing`,
  );
  assert(sql.includes("450::bigint * 1024 * 1024") || sql.includes("disable_discovery_bytes = 450"), `${name}: 450 MiB threshold missing`);
  assert(!/limit\s+20\b/i.test(sql), `${name}: must list all public tables without limit 20`);
}

assert(
  project1Sql.includes("music_rpc_disable_schedulers_for_capacity") &&
    project1Sql.includes("nrm_system_schedule") &&
    project1Sql.includes("music_capacity_blocks_collection_writes"),
  "project1 must disable all schedulers and neutralize write-stop gates",
);

assert(
  edge.includes("MUSIC_VECTOR_SUPABASE_URL") &&
    edge.includes("MUSIC_VECTOR_SUPABASE_SECRET_KEY"),
  "Edge Function must read project 2 credentials from Secrets",
);
assert(edge.includes("nrm_is_admin_caller"), "Edge Function must verify the admin caller");
assert(
  edge.includes("music_rpc_capacity_status") &&
    edge.includes("vector_rpc_capacity_status"),
  "Edge Function must aggregate both capacity RPCs",
);

for (const forbidden of [
  "MUSIC_VECTOR_SUPABASE_URL",
  "MUSIC_VECTOR_SUPABASE_SECRET_KEY",
  "eyzutsvsqxsxhjgydgoz.supabase.co",
  "service_role",
]) {
  assert(!client.includes(forbidden), `app client leaks server boundary token: ${forbidden}`);
}

console.log("capacity view contract: ok");
