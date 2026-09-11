import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sql = fs.readFileSync(
  path.join(root, "supabase/migrations/20260910161000_mb_transient_retry.sql"),
  "utf8",
);
const worker = fs.readFileSync(
  path.join(root, "supabase/functions/musicbrainz-sync/worker.ts"),
  "utf8",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(sql.includes("create table if not exists public.music_mb_transient_retry"), "retry table missing");
assert(sql.includes("mb_transient_retry"), "collection_mode missing");
assert(sql.includes("musicbrainz-mb-503-retry"), "503 retry schedule seed missing");
assert(sql.includes("'interval'"), "503 retry seed must use interval");
assert(sql.includes("music_rpc_enqueue_mb_transient_retry"), "enqueue RPC missing");
assert(
  sql.includes("delete from public.music_mb_transient_retry"),
  "success must delete the temp retry row",
);
assert(
  worker.includes("music_rpc_enqueue_mb_transient_retry") &&
    worker.includes('source: "musicbrainz" | "lastfm"'),
  "worker must enqueue MusicBrainz transient failures only",
);
assert(worker.includes("MB_TRANSIENT_RETRY_KINDS"), "retry job kinds missing");

console.log("MusicBrainz 503 retry static checks passed");
