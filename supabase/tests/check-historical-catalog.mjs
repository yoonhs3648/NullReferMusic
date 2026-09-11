import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sql = fs.readFileSync(
  path.join(root, "supabase/migrations/20260908113000_historical_catalog_schedules.sql"),
  "utf8",
);
const worker = fs.readFileSync(
  path.join(root, "supabase/functions/musicbrainz-sync/worker.ts"),
  "utf8",
);
const lastfm = fs.readFileSync(
  path.join(root, "supabase/functions/musicbrainz-sync/lastfm.ts"),
  "utf8",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const key of [
  "musicbrainz-lastfm-korea-catalog",
  "musicbrainz-lastfm-global-catalog",
  "musicbrainz-lastfm-korean-hiphop-catalog",
  "musicbrainz-lastfm-hiphop-catalog",
]) {
  assert(sql.includes(`'${key}'`), `missing catalog schedule ${key}`);
}

assert(sql.includes("'geo.getTopTracks'"), "korea catalog method missing");
assert(sql.includes("'chart.getTopTracks'"), "global catalog method missing");
assert(sql.includes("'tag.getTopTracks'"), "tag catalog method missing");
assert(sql.includes("collection_mode"), "catalog collection_mode missing");
assert(sql.includes("time '00:00'"), "00:00 KST missing");
assert(sql.includes("time '01:00'"), "01:00 KST missing");
assert(sql.includes("time '02:00'"), "02:00 KST missing");
assert(sql.includes("time '03:00'"), "03:00 KST missing");
assert(sql.includes("music_schedule_catalog_recording"), "exclusive membership table missing");
assert(sql.includes("ux_music_schedule_catalog_recording_exclusive"), "exclusive unique missing");
assert(sql.includes("music_rpc_catalog_capacity_budget"), "capacity budget RPC missing");
assert(sql.includes("music_rpc_apply_lastfm_track_pool_page"), "track pool apply missing");
const trackPoolFix = fs.readFileSync(
  path.join(root, "supabase/migrations/20260908134000_fix_track_pool_next_page_ambiguous.sql"),
  "utf8",
);
assert(trackPoolFix.includes("f.next_page"), "track pool next_page must be table-qualified");
assert(!trackPoolFix.includes("then next_page else"), "unqualified next_page assignment must not return");
const applyFix = fs.readFileSync(
  path.join(root, "supabase/migrations/20260908140000_fix_apply_rpc_column_ambiguity.sql"),
  "utf8",
);
assert(applyFix.includes("music_discovery_scan as s"), "discovery next_offset must be table-qualified");
assert(applyFix.includes("applied_recording_id"), "catalog OUT must not collide with recording_id");
const rankFix = fs.readFileSync(
  path.join(root, "supabase/migrations/20260908141000_fix_catalog_track_rank_zero.sql"),
  "utf8",
);
assert(rankFix.includes("greatest(1, least(5000"), "catalog rank must clamp 0 to 1..5000");
const representativeFix = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260909110000_fix_catalog_release_representative_retired.sql",
  ),
  "utf8",
);
assert(
  representativeFix.includes("v_retired_at := case when v_is_representative then null else now() end"),
  "catalog extra editions must set retired_at",
);
assert(
  representativeFix.includes("1, 1, v_is_representative, v_retired_at, 0"),
  "catalog release insert must pass retired_at with is_representative",
);
assert(
  !representativeFix.includes("1, 1, not exists ("),
  "catalog must not insert non-representative without retired_at",
);
const recordingOnly = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260909120000_catalog_recording_without_release.sql",
  ),
  "utf8",
);
assert(
  recordingOnly.includes("'album','release','recording'"),
  "catalog payload must allow recording-only apply",
);
assert(
  recordingOnly.includes("v_recording := p_payload->'recording'"),
  "catalog recording-only payload path missing",
);
const serialPhases = fs.readFileSync(
  path.join(root, "supabase/migrations/20260909130000_catalog_serial_phases.sql"),
  "utf8",
);
assert(
  serialPhases.includes("snapshot_complete = v_last"),
  "track pool must still mark snapshot complete",
);
assert(
  serialPhases.includes("and c.candidate_status = 'queued'") &&
    serialPhases.includes("if v_last then"),
  "MusicBrainz catalog jobs must wait until Last.fm snapshot is complete",
);
assert(
  serialPhases.includes("when 'lastfm_track_pool' then 1") &&
    serialPhases.includes("when 'mb_catalog_track_resolve' then 2") &&
    serialPhases.includes("when 'lastfm_tags' then 3"),
  "catalog claim must be Last.fm list then MusicBrainz then tags",
);
assert(
  serialPhases.includes("p.job_kind = 'lastfm_track_pool'") &&
    serialPhases.includes("p.job_kind = 'mb_catalog_track_resolve'"),
  "claim must not start MusicBrainz or tags before the previous catalog phase finishes",
);
assert(sql.includes("music_rpc_apply_catalog_recording_bundle"), "catalog apply missing");
assert(sql.includes("music_rpc_apply_lastfm_tags"), "lastfm tags apply missing");
assert(sql.includes("lastfm_track_pool"), "track pool job kind missing");
assert(sql.includes("mb_catalog_track_resolve"), "catalog resolve job kind missing");
assert(!sql.includes("max_new_recording_count, 200"), "fixed 200 cap must not be used");
assert(sql.includes("5000, 'catalog'"), "dynamic catalog cap seed missing");

assert(worker.includes("lastfm_track_pool"), "worker track pool missing");
assert(worker.includes("mb_catalog_track_resolve"), "worker catalog resolve missing");
assert(worker.includes("music_rpc_apply_lastfm_tags"), "worker lastfm tags missing");
assert(lastfm.includes("geo.getTopTracks"), "Last.fm top tracks builder missing");
assert(lastfm.includes("track.getTopTags"), "Last.fm top tags builder missing");
assert(lastfm.includes("selectLastfmVectorTags"), "tag filter missing");

const koreanOnly = fs.readFileSync(
  path.join(root, "supabase/migrations/20260909140000_korea_catalog_korean_only.sql"),
  "utf8",
);
assert(koreanOnly.includes("skipped_not_korean"), "korea skip match_status missing");
assert(koreanOnly.includes("skipped_korean"), "global skip match_status missing");
assert(koreanOnly.includes("music_rpc_skip_catalog_recording"), "korea skip RPC missing");
assert(
  koreanOnly.includes("'schedule_key', s.schedule_key") &&
    koreanOnly.includes("mb_catalog_track_resolve"),
  "catalog claim must expose schedule_key",
);
assert(worker.includes("classifyKoreanWork"), "worker must classify korean works");
assert(worker.includes("catalogRegionPolicy"), "worker must apply region policy per schedule");
assert(worker.includes("music_rpc_skip_catalog_recording"), "worker must skip region-filtered catalog");
assert(worker.includes("not_korean_work") && worker.includes("korean_work"), "worker skip reasons missing");

const yearQuota = fs.readFileSync(
  path.join(root, "supabase/migrations/20260910180000_catalog_lastfm_filter_year_quota.sql"),
  "utf8",
);
assert(yearQuota.includes("music_catalog_era_quota"), "year quota helper missing");
assert(yearQuota.includes("YEAR_QUOTA_SKIP"), "year quota skip missing");
assert(yearQuota.includes("tag.getTopTracks"), "korea catalog k-pop source missing");
assert(yearQuota.includes("lastfm_param = 'k-pop'"), "korea catalog must use k-pop tag");
assert(yearQuota.includes("ck_music_collection_schedule_limits"), "new recording cap must rise with year quotas");
assert(!yearQuota.includes("/ 4)"), "capacity budget must not split remaining by 4");
assert(yearQuota.includes("jsonb_array_length(p_tracks) > 50"), "track page cap remains");
assert(!yearQuota.includes("jsonb_array_length(p_tracks) = 0 then"), "empty filtered page must not close snapshot");
assert(lastfm.includes("decideLastfmCatalogTrack"), "Last.fm list region decision missing");
assert(lastfm.includes("artist.getTopTags"), "artist.getTopTags builder missing");
assert(worker.includes("keepLastfmCatalogTrack"), "worker must filter Last.fm list before MusicBrainz");
assert(worker.includes("YEAR_QUOTA_SKIP"), "worker must accept year quota skip");

console.log("historical catalog static checks passed");
