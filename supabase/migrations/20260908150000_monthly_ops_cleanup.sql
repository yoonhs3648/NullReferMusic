-- 매월 1일 00:00 KST 운영 데이터 정리: 로그 1개월, Storage 1개월, 스케줄 이력 3개월.

-- ---------------------------------------------------------------------------
-- 1) monthly 주기
-- ---------------------------------------------------------------------------
alter table public.nrm_system_schedule
  drop constraint if exists ck_nrm_system_schedule_kind;
alter table public.nrm_system_schedule
  add constraint ck_nrm_system_schedule_kind
  check (schedule_kind in ('daily', 'interval', 'weekly', 'monthly'));

alter table public.music_collection_schedule
  drop constraint if exists ck_music_collection_schedule_kind;
alter table public.music_collection_schedule
  add constraint ck_music_collection_schedule_kind
  check (schedule_kind in ('daily', 'interval', 'weekly', 'monthly'));

alter table public.nrm_system_schedule
  drop constraint if exists ck_nrm_system_schedule_timing;
alter table public.nrm_system_schedule
  add constraint ck_nrm_system_schedule_timing check (
    (schedule_kind = 'daily' and daily_time_kst is not null
      and interval_minutes is null and weekly_weekday is null)
    or (schedule_kind = 'interval' and daily_time_kst is null
      and interval_minutes between 1 and 1440 and weekly_weekday is null)
    or (schedule_kind = 'weekly' and daily_time_kst is not null
      and interval_minutes is null and weekly_weekday between 0 and 6)
    or (schedule_kind = 'monthly' and daily_time_kst is not null
      and interval_minutes is null and weekly_weekday is null)
  );

alter table public.music_collection_schedule
  drop constraint if exists ck_music_collection_schedule_timing;
alter table public.music_collection_schedule
  add constraint ck_music_collection_schedule_timing check (
    (schedule_kind = 'daily' and daily_time_kst is not null
      and interval_minutes is null and weekly_weekday is null)
    or (schedule_kind = 'interval' and daily_time_kst is null
      and interval_minutes between 1 and 1440 and weekly_weekday is null)
    or (schedule_kind = 'weekly' and daily_time_kst is not null
      and interval_minutes is null and weekly_weekday between 0 and 6)
    or (schedule_kind = 'monthly' and daily_time_kst is not null
      and interval_minutes is null and weekly_weekday is null)
  );

create or replace function public.nrm_system_schedule_next_monthly_run(
  p_time_kst time,
  p_from timestamptz default now()
)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_local timestamp;
  v_month_start date;
  v_slot timestamp;
begin
  if p_time_kst is null then
    raise exception using errcode = '22023', message = 'invalid monthly time';
  end if;
  v_local := p_from at time zone 'Asia/Seoul';
  v_month_start := date_trunc('month', v_local)::date;
  v_slot := v_month_start + p_time_kst;
  if v_local >= v_slot then
    v_slot := (date_trunc('month', v_local) + interval '1 month')::date + p_time_kst;
  end if;
  return v_slot at time zone 'Asia/Seoul';
end;
$$;

create or replace function public.nrm_system_schedule_compute_next_run(
  p_kind text,
  p_daily_time time,
  p_interval_minutes integer,
  p_weekly_weekday smallint,
  p_from timestamptz default now()
)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_kind = 'interval' then
    return p_from + pg_catalog.make_interval(mins => coalesce(p_interval_minutes, 60));
  end if;
  if p_kind = 'weekly' then
    return public.nrm_system_schedule_next_weekly_run(p_weekly_weekday, p_daily_time, p_from);
  end if;
  if p_kind = 'monthly' then
    return public.nrm_system_schedule_next_monthly_run(p_daily_time, p_from);
  end if;
  return public.nrm_system_schedule_next_daily_run(p_daily_time, p_from);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) job_kind
-- ---------------------------------------------------------------------------
alter table public.nrm_system_schedule
  drop constraint if exists ck_nrm_system_schedule_job_kind;
alter table public.nrm_system_schedule
  add constraint ck_nrm_system_schedule_job_kind check (
    job_kind in (
      'musicbrainz_collection',
      'ailab_chat_retention',
      'track_history_retention',
      'ops_cleanup'
    )
  );

alter table public.nrm_system_schedule_run
  drop constraint if exists ck_nrm_system_schedule_run_kind;
alter table public.nrm_system_schedule_run
  add constraint ck_nrm_system_schedule_run_kind check (
    job_kind in (
      'musicbrainz_collection',
      'ailab_chat_retention',
      'track_history_retention',
      'ops_cleanup'
    )
  );

comment on column public.nrm_system_schedule.job_kind is
  'musicbrainz_collection | ailab_chat_retention | track_history_retention | ops_cleanup';

-- ---------------------------------------------------------------------------
-- 3) 정리 RPC
-- ---------------------------------------------------------------------------
create or replace function public.nrm_rpc_ops_cleanup_run()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_log_cutoff timestamptz := now() - interval '1 month';
  v_data_cutoff timestamptz := now() - interval '3 months';
  v_batch integer := 500;
  v_loops integer;
  v_n integer;
  v_deleted_logs integer := 0;
  v_deleted_cron_logs integer := 0;
  v_deleted_pg_net_logs integer := 0;
  v_deleted_storage integer := 0;
  v_deleted_jobs integer := 0;
  v_deleted_music_runs integer := 0;
  v_deleted_system_runs integer := 0;
  v_deleted_dead_letters integer := 0;
  v_deleted_sync_runs integer := 0;
  v_deleted_capacity_events integer := 0;
  v_deleted_capacity_snapshots integer := 0;
  v_truncated boolean := false;
  v_errors jsonb := '[]'::jsonb;
  v_ids uuid[];
begin
  -- Edge/Cron/RPC 진단 로그 1개월.
  begin
    delete from public.nrm_system_schedule_log
    where created_at < v_log_cutoff;
    get diagnostics v_deleted_logs = row_count;
  exception
    when others then
      v_errors := v_errors || jsonb_build_array(
        jsonb_build_object('step', 'schedule_log', 'sqlstate', sqlstate, 'message', sqlerrm)
      );
  end;

  -- pg_cron 실행 로그 1개월.
  begin
    if to_regclass('cron.job_run_details') is not null then
      execute format(
        'delete from cron.job_run_details where coalesce(end_time, start_time) < %L::timestamptz',
        v_log_cutoff
      );
      get diagnostics v_deleted_cron_logs = row_count;
    end if;
  exception
    when others then
      v_errors := v_errors || jsonb_build_array(
        jsonb_build_object('step', 'cron_logs', 'sqlstate', sqlstate, 'message', sqlerrm)
      );
  end;

  -- pg_net HTTP 응답 로그 1개월.
  begin
    if to_regclass('net._http_response') is not null then
      execute format(
        'delete from net._http_response where created < %L::timestamptz',
        v_log_cutoff
      );
      get diagnostics v_deleted_pg_net_logs = row_count;
    end if;
  exception
    when others then
      v_errors := v_errors || jsonb_build_array(
        jsonb_build_object('step', 'pg_net_logs', 'sqlstate', sqlstate, 'message', sqlerrm)
      );
  end;

  -- Storage: 1개월보다 오래된 객체. 아직 TrackHistory가 가리키는 album-covers는 유지.
  begin
    v_loops := 0;
    loop
      v_loops := v_loops + 1;
      with doomed as (
        select o.id
        from storage.objects o
        where o.created_at < v_log_cutoff
          and not (
            o.bucket_id = 'album-covers'
            and exists (
              select 1
              from public."TrackHistory" th
              where th."AlbumCoverPath" is not null
                and th."AlbumCoverPath" = o.name
            )
          )
        limit v_batch
      )
      delete from storage.objects o
      using doomed d
      where o.id = d.id;
      get diagnostics v_n = row_count;
      v_deleted_storage := v_deleted_storage + v_n;
      exit when v_n = 0;
      if v_loops >= 40 then
        v_truncated := true;
        exit;
      end if;
    end loop;
  exception
    when others then
      v_errors := v_errors || jsonb_build_array(
        jsonb_build_object('step', 'storage', 'sqlstate', sqlstate, 'message', sqlerrm)
      );
  end;

  -- 스케줄 실행 이력 3개월. 원장·스케줄 정의·tombstone은 유지.
  begin
    v_loops := 0;
    loop
      v_loops := v_loops + 1;
      select coalesce(array_agg(x.schedule_run_id), '{}'::uuid[])
      into v_ids
      from (
        select r.schedule_run_id
        from public.music_schedule_run r
        where r.run_status <> 'running'
          and coalesce(r.finished_at, r.started_at) < v_data_cutoff
        order by coalesce(r.finished_at, r.started_at)
        limit v_batch
      ) x;
      exit when cardinality(v_ids) = 0;

      update public.music_schedule_catalog_recording c
      set last_seen_run_id = null, updated_at = now()
      where last_seen_run_id = any(v_ids);

      update public.music_upcoming_release u
      set first_seen_schedule_run_id = null
      where first_seen_schedule_run_id = any(v_ids);
      update public.music_upcoming_release u
      set last_schedule_run_id = null
      where last_schedule_run_id = any(v_ids);

      delete from public.music_lastfm_tag_refresh_state
      where schedule_run_id = any(v_ids);

      if to_regclass('public.music_lastfm_track_pool_fetch') is not null then
        delete from public.music_lastfm_track_pool_fetch
        where schedule_run_id = any(v_ids);
      end if;
      if to_regclass('public.music_lastfm_artist_pool_fetch') is not null then
        delete from public.music_lastfm_artist_pool_fetch
        where schedule_run_id = any(v_ids);
      end if;
      if to_regclass('public.music_catalog_track_candidate') is not null then
        delete from public.music_catalog_track_candidate
        where schedule_run_id = any(v_ids);
      end if;

      delete from public.music_sync_job
      where schedule_run_id = any(v_ids);
      get diagnostics v_n = row_count;
      v_deleted_jobs := v_deleted_jobs + v_n;

      delete from public.music_release_candidate
      where schedule_run_id = any(v_ids);

      delete from public.music_discovery_scan
      where schedule_run_id = any(v_ids);

      delete from public.music_sync_run
      where schedule_run_id = any(v_ids);
      get diagnostics v_n = row_count;
      v_deleted_sync_runs := v_deleted_sync_runs + v_n;

      update public.nrm_system_schedule_run
      set music_schedule_run_id = null, updated_at = now()
      where music_schedule_run_id = any(v_ids);

      delete from public.music_schedule_run
      where schedule_run_id = any(v_ids);
      get diagnostics v_n = row_count;
      v_deleted_music_runs := v_deleted_music_runs + v_n;

      if v_loops >= 40 then
        v_truncated := true;
        exit;
      end if;
    end loop;
  exception
    when others then
      v_errors := v_errors || jsonb_build_array(
        jsonb_build_object('step', 'music_schedule_runs', 'sqlstate', sqlstate, 'message', sqlerrm)
      );
  end;

  begin
    delete from public.music_sync_job
    where schedule_run_id is null
      and job_status in ('completed', 'dead', 'blocked', 'quarantined')
      and coalesce(completed_at, created_at) < v_data_cutoff;
    get diagnostics v_n = row_count;
    v_deleted_jobs := v_deleted_jobs + v_n;
  exception
    when others then
      v_errors := v_errors || jsonb_build_array(
        jsonb_build_object('step', 'orphan_jobs', 'sqlstate', sqlstate, 'message', sqlerrm)
      );
  end;

  begin
    delete from public.music_sync_run
    where schedule_run_id is null
      and run_status <> 'running'
      and coalesce(finished_at, started_at) < v_data_cutoff;
    get diagnostics v_n = row_count;
    v_deleted_sync_runs := v_deleted_sync_runs + v_n;
  exception
    when others then
      v_errors := v_errors || jsonb_build_array(
        jsonb_build_object('step', 'orphan_sync_runs', 'sqlstate', sqlstate, 'message', sqlerrm)
      );
  end;

  begin
    delete from public.music_dead_letter
    where resolved_at is not null
      and resolved_at < v_data_cutoff;
    get diagnostics v_deleted_dead_letters = row_count;
  exception
    when others then
      v_errors := v_errors || jsonb_build_array(
        jsonb_build_object('step', 'dead_letters', 'sqlstate', sqlstate, 'message', sqlerrm)
      );
  end;

  begin
    delete from public.music_capacity_event
    where created_at < v_data_cutoff;
    get diagnostics v_deleted_capacity_events = row_count;
  exception
    when others then
      v_errors := v_errors || jsonb_build_array(
        jsonb_build_object('step', 'capacity_events', 'sqlstate', sqlstate, 'message', sqlerrm)
      );
  end;

  begin
    delete from public.music_capacity_snapshot s
    where s.captured_at < v_data_cutoff
      and s.snapshot_id <> (
        select x.snapshot_id
        from public.music_capacity_snapshot x
        order by x.captured_at desc
        limit 1
      );
    get diagnostics v_deleted_capacity_snapshots = row_count;
  exception
    when others then
      v_errors := v_errors || jsonb_build_array(
        jsonb_build_object('step', 'capacity_snapshots', 'sqlstate', sqlstate, 'message', sqlerrm)
      );
  end;

  begin
    delete from public.nrm_system_schedule_run
    where run_status <> 'running'
      and coalesce(finished_at, started_at) < v_data_cutoff;
    get diagnostics v_deleted_system_runs = row_count;
  exception
    when others then
      v_errors := v_errors || jsonb_build_array(
        jsonb_build_object('step', 'system_runs', 'sqlstate', sqlstate, 'message', sqlerrm)
      );
  end;

  return jsonb_build_object(
    'ran', true,
    'log_cutoff', v_log_cutoff,
    'data_cutoff', v_data_cutoff,
    'deleted_logs', v_deleted_logs,
    'deleted_cron_logs', v_deleted_cron_logs,
    'deleted_pg_net_logs', v_deleted_pg_net_logs,
    'deleted_storage_objects', v_deleted_storage,
    'deleted_sync_jobs', v_deleted_jobs,
    'deleted_music_runs', v_deleted_music_runs,
    'deleted_system_runs', v_deleted_system_runs,
    'deleted_sync_runs', v_deleted_sync_runs,
    'deleted_dead_letters', v_deleted_dead_letters,
    'deleted_capacity_events', v_deleted_capacity_events,
    'deleted_capacity_snapshots', v_deleted_capacity_snapshots,
    'truncated', v_truncated,
    'errors', v_errors
  );
end;
$$;

comment on function public.nrm_rpc_ops_cleanup_run() is
  '로그·pg_cron·pg_net 1개월, Storage 1개월(참조 중인 album-covers 제외), 스케줄 실행 이력 3개월 물리 삭제. 원장·스케줄 정의는 유지.';

grant usage on schema storage to postgres, nrm_music_rpc_owner;
grant select, delete on table storage.objects to postgres, nrm_music_rpc_owner;

alter function public.nrm_system_schedule_next_monthly_run(time, timestamptz)
  owner to nrm_music_rpc_owner;
alter function public.nrm_system_schedule_compute_next_run(text, time, integer, smallint, timestamptz)
  owner to nrm_music_rpc_owner;
alter function public.nrm_rpc_ops_cleanup_run()
  owner to postgres;

revoke all on function public.nrm_rpc_ops_cleanup_run()
  from public, anon, authenticated;
grant execute on function public.nrm_rpc_ops_cleanup_run()
  to postgres, service_role, nrm_music_rpc_owner;
grant execute on function public.nrm_system_schedule_next_monthly_run(time, timestamptz)
  to nrm_music_rpc_owner, service_role, postgres;
grant execute on function public.nrm_system_schedule_compute_next_run(text, time, integer, smallint, timestamptz)
  to nrm_music_rpc_owner, service_role, postgres, anon, authenticated;
