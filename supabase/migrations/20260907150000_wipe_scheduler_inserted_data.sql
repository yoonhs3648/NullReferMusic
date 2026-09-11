-- One-shot wipe of MusicBrainz/Last.fm scheduler-inserted data.
-- Keeps schedule definitions (music_collection_schedule / nrm_system_schedule).

grant usage, create on schema public to nrm_music_rpc_owner;

grant select, insert, update, delete on table
  public.music_dead_letter,
  public.music_sync_job,
  public.music_sync_run,
  public.music_lastfm_artist_pool_fetch,
  public.music_release_candidate,
  public.music_discovery_scan,
  public.music_schedule_run,
  public.music_schedule_artist,
  public.music_artist_allowlist,
  public.music_collection_schedule,
  public.lastfm_recording_tag,
  public.lastfm_tag_fetch_attempt,
  public.lastfm_tag_fetch,
  public.lastfm_recording_profile,
  public.music_album_artist_credit,
  public.music_release_artist_credit,
  public.music_recording_artist_credit,
  public.music_track_artist_credit,
  public.music_artist_genre,
  public.music_album_genre,
  public.music_release_genre,
  public.music_recording_genre,
  public.music_artist_mb_tag,
  public.music_album_mb_tag,
  public.music_release_mb_tag,
  public.music_recording_mb_tag,
  public.music_recording_isrc,
  public.music_tag_alias,
  public.music_tag,
  public.music_genre,
  public.music_track_mbid,
  public.music_track,
  public.music_recording_duplicate_candidate,
  public.music_recording_redirect,
  public.music_recording_mbid,
  public.music_recording,
  public.music_release_mbid,
  public.music_release,
  public.music_album_mbid,
  public.music_album,
  public.music_artist_mbid,
  public.music_artist,
  public.music_entity_merge_audit,
  public.music_mbid_resolution_observation,
  public.music_recording_purge_tombstone,
  public.music_purge_entity_tombstone,
  public.music_purge_batch
to nrm_music_rpc_owner;

create or replace function public.music_tmp_wipe_scheduler_inserted_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_counts jsonb := '{}'::jsonb;
  v_n bigint;
begin
  perform pg_catalog.set_config('nrm.music_capacity_purge', 'on', true);

  -- Stop in-flight collection work.
  update public.music_sync_job
  set job_status = 'dead',
      completed_at = coalesce(completed_at, now()),
      lease_until = null,
      worker_id = null,
      fence_token = null
  where job_kind in (
      'lastfm_artist_pool', 'mb_discovery', 'mb_release_hydrate', 'mb_recording_hydrate'
    )
    and job_status in ('pending', 'processing', 'retry');

  update public.music_schedule_run
  set run_status = 'cancelled',
      finished_at = coalesce(finished_at, now())
  where run_status = 'running';

  update public.music_collection_schedule
  set claimed_until = null,
      claim_fence_token = null,
      claimed_by = null;

  -- Pipeline / ops tables (no hard-delete trigger).
  delete from public.music_dead_letter;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('music_dead_letter', v_n);

  if to_regclass('public.music_lastfm_artist_pool_fetch') is not null then
    delete from public.music_lastfm_artist_pool_fetch;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('music_lastfm_artist_pool_fetch', v_n);
  end if;

  delete from public.music_sync_job
  where job_kind in (
    'lastfm_artist_pool', 'mb_discovery', 'mb_release_hydrate', 'mb_recording_hydrate',
    'mb_lookup', 'mb_redirect'
  )
  or schedule_run_id is not null
  or schedule_id is not null;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('music_sync_job', v_n);

  delete from public.music_release_candidate;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('music_release_candidate', v_n);

  delete from public.music_discovery_scan;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('music_discovery_scan', v_n);

  delete from public.music_schedule_run;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('music_schedule_run', v_n);

  delete from public.music_schedule_artist;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('music_schedule_artist', v_n);

  delete from public.music_artist_allowlist;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('music_artist_allowlist', v_n);

  delete from public.music_sync_run;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('music_sync_run', v_n);

  -- Last.fm projection tied to recordings.
  if to_regclass('public.lastfm_recording_tag') is not null then
    delete from public.lastfm_recording_tag;
  end if;
  if to_regclass('public.lastfm_tag_fetch_attempt') is not null then
    delete from public.lastfm_tag_fetch_attempt;
  end if;
  if to_regclass('public.lastfm_tag_fetch') is not null then
    delete from public.lastfm_tag_fetch;
  end if;
  if to_regclass('public.lastfm_recording_profile') is not null then
    delete from public.lastfm_recording_profile;
  end if;

  -- Credits / tags / genres / ISRC (no prevent-delete trigger).
  delete from public.music_album_artist_credit;
  delete from public.music_release_artist_credit;
  delete from public.music_recording_artist_credit;
  delete from public.music_track_artist_credit;
  delete from public.music_artist_genre;
  delete from public.music_album_genre;
  delete from public.music_release_genre;
  delete from public.music_recording_genre;
  delete from public.music_artist_mb_tag;
  delete from public.music_album_mb_tag;
  delete from public.music_release_mb_tag;
  delete from public.music_recording_mb_tag;
  delete from public.music_recording_isrc;
  delete from public.music_tag_alias;
  delete from public.music_tag;
  delete from public.music_genre;

  -- Authoritative ledger (requires purge flag + nrm_music_rpc_owner).
  delete from public.music_track_mbid;
  delete from public.music_track;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('music_track', v_n);

  delete from public.music_recording_duplicate_candidate;
  delete from public.music_recording_redirect;
  delete from public.music_recording_mbid;
  delete from public.music_recording;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('music_recording', v_n);

  delete from public.music_release_mbid;
  delete from public.music_release;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('music_release', v_n);

  delete from public.music_album_mbid;
  delete from public.music_album;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('music_album', v_n);

  delete from public.music_artist_mbid;
  delete from public.music_artist;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('music_artist', v_n);

  delete from public.music_entity_merge_audit;
  delete from public.music_mbid_resolution_observation;

  -- Optional purge audit leftovers from earlier capacity purges.
  delete from public.music_recording_purge_tombstone;
  delete from public.music_purge_entity_tombstone;
  delete from public.music_purge_batch;

  return v_counts;
end;
$$;

alter function public.music_tmp_wipe_scheduler_inserted_data()
  owner to nrm_music_rpc_owner;
revoke all on function public.music_tmp_wipe_scheduler_inserted_data()
  from public, anon, authenticated;
grant execute on function public.music_tmp_wipe_scheduler_inserted_data()
  to postgres, service_role;

select public.music_tmp_wipe_scheduler_inserted_data() as wipe_counts;

drop function public.music_tmp_wipe_scheduler_inserted_data();

revoke create on schema public from nrm_music_rpc_owner;
