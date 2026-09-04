import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const migrationPath = path.join(
  root,
  "supabase/migrations/20260904160000_lastfm_artist_pool_schedules.sql",
);
const sql = fs.readFileSync(migrationPath, "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const key of [
  "musicbrainz-lastfm-korea-top",
  "musicbrainz-lastfm-global-top",
  "musicbrainz-lastfm-hiphop-top",
  "musicbrainz-lastfm-korean-hiphop-top",
]) {
  assert(sql.includes(`'${key}'`), `missing schedule ${key}`);
}

assert(sql.includes("'geo.getTopArtists'"), "missing geo.getTopArtists");
assert(sql.includes("'chart.getTopArtists'"), "missing chart.getTopArtists");
assert(sql.includes("'tag.getTopArtists'"), "missing tag.getTopArtists");
assert(sql.includes("'Korea, Republic of'"), "missing Korea, Republic of geo param");
assert(sql.includes("'hip-hop'"), "missing hip-hop tag");
assert(sql.includes("'korean hip hop'"), "missing korean hip hop tag");
assert(sql.includes("max_new_recording_count = 1000"), "missing 1000 recording cap");
assert(sql.includes("max_artist_count = 100"), "missing 100 artist cap");
assert(
  sql.includes("ux_music_schedule_artist_exclusive_enabled"),
  "missing exclusive artist index",
);
assert(
  sql.includes("music_rpc_apply_lastfm_artist_pool"),
  "missing apply lastfm artist pool RPC",
);
assert(sql.includes("'lastfm_artist_pool'"), "missing lastfm_artist_pool job kind");
assert(sql.includes("new_recording_count"), "missing new_recording_count column");
assert(sql.includes("QUOTA_REACHED"), "missing quota gate");
assert(sql.includes("then 'duplicate'"), "missing cross-schedule duplicate gate");
assert(
  sql.includes("as v(old_key, new_key, display_name, lastfm_method, lastfm_param, priority, daily_time_kst)"),
  "schedule migrate must join VALUES so schedule_key SET does not poison CASE",
);

console.log("lastfm artist pool schedule contract checks passed");
