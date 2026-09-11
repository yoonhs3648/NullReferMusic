-- Operator: turn every system/collection schedule off and wipe collected music data.
-- Keeps schedule definitions. Does not restore is_enabled.

grant usage, create on schema public to nrm_music_rpc_owner;

grant select, insert, update, delete on table
  public.music_dead_letter,
  public.music_sync_job,
  public.music_sync_run,
  public.music_lastfm_artist_pool_fetch,
  public.music_lastfm_track_pool_fetch,
  public.music_lastfm_tag_refresh_state,
  public.music_catalog_track_candidate,
  public.music_schedule_catalog_recording,
  public.music_upcoming_release,
  public.music_release_candidate,
  public.music_discovery_scan,
  public.music_schedule_run,
  public.music_schedule_artist,
  public.music_artist_allowlist,
  public.music_collection_schedule,
  public.music_api_limiter,
  public.music_mb_transient_retry,
  public.nrm_system_schedule,
  public.nrm_system_schedule_run,
  public.nrm_system_schedule_log,
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

create or replace function public.music_tmp_disable_schedulers_and_wipe_collected_data()
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

  update public.music_collection_schedule
  set is_enabled = false,
      claimed_until = null,
      claim_fence_token = null,
      claimed_by = null;

  update public.nrm_system_schedule
  set is_enabled = false,
      updated_at = now();

  update public.music_sync_job
  set job_status = 'dead',
      completed_at = coalesce(completed_at, now()),
      lease_until = null,
      worker_id = null,
      fence_token = null,
      last_error_message = 'operator wipe'
  where job_status in ('pending', 'processing', 'retry');

  update public.music_schedule_run
  set run_status = 'cancelled',
      finished_at = coalesce(finished_at, now()),
      lease_until = now()
  where run_status = 'running';

  update public.nrm_system_schedule_run
  set run_status = 'cancelled',
      finished_at = coalesce(finished_at, now()),
      error_message = coalesce(error_message, 'operator wipe')
  where run_status = 'running';

  update public.music_discovery_scan
  set scan_status = 'failed',
      completed_at = coalesce(completed_at, now()),
      lease_until = null,
      worker_id = null,
      fence_token = null
  where scan_status in ('pending', 'processing', 'retry');

  update public.music_api_limiter
  set permit_token = null,
      permit_worker_id = null,
      permit_expires_at = null,
      next_allowed_at = now();

  delete from public.music_dead_letter;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('music_dead_letter', v_n);

  delete from public.music_mb_transient_retry;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('music_mb_transient_retry', v_n);

  delete from public.music_lastfm_tag_refresh_state;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('music_lastfm_tag_refresh_state', v_n);

  delete from public.music_lastfm_track_pool_fetch;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('music_lastfm_track_pool_fetch', v_n);

  delete from public.music_lastfm_artist_pool_fetch;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('music_lastfm_artist_pool_fetch', v_n);

  delete from public.music_schedule_catalog_recording;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('music_schedule_catalog_recording', v_n);

  delete from public.music_catalog_track_candidate;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('music_catalog_track_candidate', v_n);

  delete from public.music_upcoming_release;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('music_upcoming_release', v_n);

  delete from public.music_sync_job;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('music_sync_job', v_n);

  delete from public.music_release_candidate;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('music_release_candidate', v_n);

  delete from public.music_discovery_scan;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('music_discovery_scan', v_n);

  update public.nrm_system_schedule_run
  set music_schedule_run_id = null
  where music_schedule_run_id is not null;

  delete from public.nrm_system_schedule_run
  where job_kind = 'musicbrainz_collection';
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('nrm_system_schedule_run_music', v_n);

  delete from public.nrm_system_schedule_log;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('nrm_system_schedule_log', v_n);

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

  delete from public.lastfm_recording_tag;
  delete from public.lastfm_tag_fetch_attempt;
  delete from public.lastfm_tag_fetch;
  delete from public.lastfm_recording_profile;

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
  delete from public.music_recording_purge_tombstone;
  delete from public.music_purge_entity_tombstone;
  delete from public.music_purge_batch;

  update public.music_collection_schedule
  set next_run_at = public.nrm_system_schedule_compute_next_run(
        schedule_kind, daily_time_kst, interval_minutes, weekly_weekday, now(),
        monthly_day, once_on_date
      ),
      claimed_until = null,
      claim_fence_token = null,
      claimed_by = null,
      is_enabled = false;

  update public.nrm_system_schedule s
  set is_enabled = false,
      next_run_at = coalesce(m.next_run_at, public.nrm_system_schedule_compute_next_run(
        s.schedule_kind, s.daily_time_kst, s.interval_minutes, s.weekly_weekday, now(),
        s.monthly_day, s.once_on_date
      )),
      updated_at = now()
  from public.music_collection_schedule m
  where s.job_kind = 'musicbrainz_collection'
    and nullif(s.config->>'music_schedule_id', '')::uuid = m.schedule_id;

  update public.nrm_system_schedule
  set is_enabled = false,
      next_run_at = public.nrm_system_schedule_compute_next_run(
        schedule_kind, daily_time_kst, interval_minutes, weekly_weekday, now(),
        monthly_day, once_on_date
      ),
      updated_at = now()
  where job_kind <> 'musicbrainz_collection';

  select count(*) into v_n from public.music_collection_schedule where is_enabled;
  v_counts := v_counts || jsonb_build_object('music_schedules_still_enabled', v_n);
  select count(*) into v_n from public.nrm_system_schedule where is_enabled;
  v_counts := v_counts || jsonb_build_object('system_schedules_still_enabled', v_n);

  return v_counts;
end;
$$;

revoke all on function public.music_tmp_disable_schedulers_and_wipe_collected_data()
  from public, anon, authenticated;
grant execute on function public.music_tmp_disable_schedulers_and_wipe_collected_data()
  to postgres, service_role;

alter function public.music_tmp_disable_schedulers_and_wipe_collected_data()
  owner to nrm_music_rpc_owner;

select public.music_tmp_disable_schedulers_and_wipe_collected_data() as wipe_counts;

drop function public.music_tmp_disable_schedulers_and_wipe_collected_data();

revoke create on schema public from nrm_music_rpc_owner;
