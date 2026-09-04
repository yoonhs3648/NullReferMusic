-- TrackHistory retention: delete rows older than retention_days (default 180).
-- Runs via existing pg_cron nrm-system-schedule-tick (no new Cron job).

alter table public.nrm_system_schedule
  drop constraint if exists ck_nrm_system_schedule_job_kind;

alter table public.nrm_system_schedule
  add constraint ck_nrm_system_schedule_job_kind check (
    job_kind in (
      'musicbrainz_collection',
      'ailab_chat_retention',
      'track_history_retention'
    )
  );

comment on column public.nrm_system_schedule.job_kind is
  'musicbrainz_collection | ailab_chat_retention | track_history_retention';

insert into public.nrm_system_schedule (
  schedule_key, display_name, job_kind, is_enabled, schedule_kind,
  daily_time_kst, interval_minutes, next_run_at, config
)
values (
  'track-history-retention',
  'Track History 자동 삭제',
  'track_history_retention',
  true,
  'daily',
  time '08:00',
  null,
  public.nrm_system_schedule_next_daily_run(time '08:00', now()),
  jsonb_build_object('retention_days', 180)
)
on conflict (schedule_key) do update set
  display_name = excluded.display_name,
  job_kind = excluded.job_kind,
  schedule_kind = excluded.schedule_kind,
  daily_time_kst = coalesce(nrm_system_schedule.daily_time_kst, excluded.daily_time_kst),
  interval_minutes = null,
  is_enabled = coalesce(nrm_system_schedule.is_enabled, true),
  config = case
    when coalesce((nrm_system_schedule.config->>'retention_days')::integer, 0) between 1 and 3650
      then nrm_system_schedule.config
    else excluded.config
  end;

create or replace function public.nrm_rpc_track_history_retention_run(
  p_batch_size integer default 2000
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sched public.nrm_system_schedule%rowtype;
  v_days integer;
  v_cutoff timestamptz;
  v_batch integer := greatest(1, least(coalesce(p_batch_size, 2000), 10000));
  v_deleted integer := 0;
begin
  select * into v_sched
  from public.nrm_system_schedule
  where schedule_key = 'track-history-retention'
  for update;

  if not found then
    return jsonb_build_object(
      'ran', false,
      'reason', 'missing_schedule',
      'deleted_rows', 0
    );
  end if;

  if not v_sched.is_enabled then
    return jsonb_build_object(
      'ran', false,
      'reason', 'disabled',
      'deleted_rows', 0
    );
  end if;

  v_days := coalesce((v_sched.config->>'retention_days')::integer, 0);
  if v_days < 1 or v_days > 3650 then
    raise exception using
      errcode = '22023',
      message = 'track-history-retention retention_days must be between 1 and 3650';
  end if;

  v_cutoff := now() - make_interval(days => v_days);

  with doomed as (
    select th."ID", th."SerialNo"
    from public."TrackHistory" th
    where th."DownloadDate" < v_cutoff
    order by th."DownloadDate" asc, th."ID" asc
    limit v_batch
  )
  delete from public."TrackHistory" th
  using doomed d
  where th."ID" = d."ID"
    and th."SerialNo" = d."SerialNo";
  get diagnostics v_deleted = row_count;

  return jsonb_build_object(
    'ran', true,
    'reason', case when v_deleted = 0 then 'nothing_to_delete' else 'ok' end,
    'retention_days', v_days,
    'cutoff', v_cutoff,
    'deleted_rows', v_deleted,
    'batch_size', v_batch
  );
end;
$$;

comment on function public.nrm_rpc_track_history_retention_run(integer) is
  'TrackHistory: DownloadDate가 retention_days보다 오래된 행 물리 삭제. album-covers Storage는 공유 객체라 건드리지 않음.';

create or replace function public.nrm_rpc_system_schedule_tick()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sched public.nrm_system_schedule%rowtype;
  v_result jsonb := '[]'::jsonb;
  v_run jsonb;
  v_next timestamptz;
begin
  for v_sched in
    select *
    from public.nrm_system_schedule
    where is_enabled
      and job_kind in ('ailab_chat_retention', 'track_history_retention')
      and next_run_at <= now()
    order by next_run_at, schedule_key
    for update skip locked
  loop
    if v_sched.schedule_kind = 'daily' then
      v_next := public.nrm_system_schedule_next_daily_run(v_sched.daily_time_kst, now());
    else
      v_next := now() + make_interval(mins => v_sched.interval_minutes);
    end if;

    update public.nrm_system_schedule
    set next_run_at = v_next
    where schedule_id = v_sched.schedule_id;

    if v_sched.job_kind = 'ailab_chat_retention' then
      v_run := public.nrm_rpc_ailab_chat_retention_run(500);
    elsif v_sched.job_kind = 'track_history_retention' then
      v_run := public.nrm_rpc_track_history_retention_run(2000);
    else
      v_run := jsonb_build_object('ran', false, 'reason', 'unsupported_job_kind');
    end if;

    v_result := v_result || jsonb_build_array(
      jsonb_build_object(
        'schedule_key', v_sched.schedule_key,
        'job_kind', v_sched.job_kind,
        'next_run_at', v_next,
        'result', v_run
      )
    );
  end loop;

  return jsonb_build_object('processed', v_result);
end;
$$;

comment on function public.nrm_rpc_system_schedule_tick() is
  'due된 ailab_chat_retention·track_history_retention 시스템 스케줄을 실행하고 next_run_at을 갱신. pg_cron에서 호출.';

create or replace function public.nrm_rpc_system_schedule_list(
  p_caller_serial text,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if not public.nrm_is_admin_caller(p_caller_serial) then
    raise exception using errcode = '42501', message = 'admin required';
  end if;

  return coalesce((
    select jsonb_agg(row_payload order by sort_priority, schedule_key)
    from (
      select
        s.schedule_key,
        case s.job_kind
          when 'musicbrainz_collection' then coalesce(m.priority, 1000)
          when 'track_history_retention' then 8000
          when 'ailab_chat_retention' then 8500
          else 9000
        end as sort_priority,
        jsonb_build_object(
          'schedule_id', s.schedule_id,
          'schedule_key', s.schedule_key,
          'display_name', s.display_name,
          'job_kind', s.job_kind,
          'is_enabled', s.is_enabled,
          'schedule_kind', s.schedule_kind,
          'daily_time_kst', s.daily_time_kst,
          'interval_minutes', s.interval_minutes,
          'next_run_at', s.next_run_at,
          'config', s.config,
          'created_at', s.created_at,
          'updated_at', s.updated_at,
          'music_schedule', case
            when m.schedule_id is null then null
            else to_jsonb(m)
          end,
          'retention_days', case
            when s.job_kind in ('ailab_chat_retention', 'track_history_retention')
              then coalesce((s.config->>'retention_days')::integer, 30)
            else null
          end
        ) as row_payload
      from public.nrm_system_schedule s
      left join public.music_collection_schedule m
        on s.job_kind = 'musicbrainz_collection'
       and m.schedule_id = nullif(s.config->>'music_schedule_id', '')::uuid
      order by
        case s.job_kind
          when 'musicbrainz_collection' then coalesce(m.priority, 1000)
          when 'track_history_retention' then 8000
          when 'ailab_chat_retention' then 8500
          else 9000
        end,
        s.schedule_key
      limit v_limit offset v_offset
    ) q
  ), '[]'::jsonb);
end;
$$;

create or replace function public.nrm_rpc_system_schedule_update(
  p_caller_serial text,
  p_schedule_id uuid,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sched public.nrm_system_schedule%rowtype;
  v_music_id uuid;
  v_days integer;
  v_kind text;
  v_daily time;
  v_interval integer;
  v_enabled boolean;
  v_next timestamptz;
begin
  if not public.nrm_is_admin_caller(p_caller_serial) then
    raise exception using errcode = '42501', message = 'admin required';
  end if;
  if p_schedule_id is null then
    raise exception using
      errcode = '22023',
      message = 'schedule create is forbidden; update existing schedule_id only';
  end if;

  select * into v_sched
  from public.nrm_system_schedule
  where schedule_id = p_schedule_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'system schedule not found';
  end if;

  if v_sched.job_kind in ('ailab_chat_retention', 'track_history_retention') then
    perform public.music_reject_unknown_keys(p_payload, array[
      'schedule_kind', 'daily_time_kst', 'interval_minutes',
      'next_run_at', 'is_enabled', 'retention_days'
    ]);

    v_days := coalesce(
      (p_payload->>'retention_days')::integer,
      (v_sched.config->>'retention_days')::integer,
      case v_sched.job_kind
        when 'track_history_retention' then 180
        else 30
      end
    );
    if v_days < 1 or v_days > 3650 then
      raise exception using errcode = '22023', message = 'retention_days must be between 1 and 3650';
    end if;

    v_kind := coalesce(nullif(p_payload->>'schedule_kind', ''), v_sched.schedule_kind);
    v_daily := case
      when v_kind = 'daily' then coalesce(
        nullif(p_payload->>'daily_time_kst', '')::time,
        v_sched.daily_time_kst,
        case v_sched.job_kind
          when 'track_history_retention' then time '08:00'
          else time '03:00'
        end
      )
      else null
    end;
    v_interval := case
      when v_kind = 'interval' then coalesce(
        (p_payload->>'interval_minutes')::integer,
        v_sched.interval_minutes,
        60
      )
      else null
    end;
    if v_kind = 'interval' and (v_interval < 1 or v_interval > 1440) then
      raise exception using errcode = '22023', message = 'interval_minutes must be between 1 and 1440';
    end if;
    v_enabled := coalesce((p_payload->>'is_enabled')::boolean, v_sched.is_enabled);
    v_next := coalesce(
      (p_payload->>'next_run_at')::timestamptz,
      case
        when v_kind = 'daily' then public.nrm_system_schedule_next_daily_run(v_daily, now())
        else now() + make_interval(mins => v_interval)
      end
    );

    update public.nrm_system_schedule set
      schedule_kind = v_kind,
      daily_time_kst = v_daily,
      interval_minutes = v_interval,
      is_enabled = v_enabled,
      next_run_at = v_next,
      config = jsonb_build_object('retention_days', v_days)
    where schedule_id = p_schedule_id;

    return p_schedule_id;
  end if;

  if v_sched.job_kind = 'musicbrainz_collection' then
    perform public.music_reject_unknown_keys(p_payload, array[
      'schedule_kind', 'daily_time_kst', 'interval_minutes',
      'next_run_at', 'is_enabled'
    ]);

    v_kind := coalesce(nullif(p_payload->>'schedule_kind', ''), v_sched.schedule_kind);
    v_daily := case
      when v_kind = 'daily' then coalesce(
        nullif(p_payload->>'daily_time_kst', '')::time,
        v_sched.daily_time_kst
      )
      else null
    end;
    v_interval := case
      when v_kind = 'interval' then coalesce(
        (p_payload->>'interval_minutes')::integer,
        v_sched.interval_minutes
      )
      else null
    end;
    if v_kind = 'interval' and (v_interval < 1 or v_interval > 1440) then
      raise exception using errcode = '22023', message = 'interval_minutes must be between 1 and 1440';
    end if;
    v_enabled := coalesce((p_payload->>'is_enabled')::boolean, v_sched.is_enabled);
    v_next := coalesce(
      (p_payload->>'next_run_at')::timestamptz,
      case
        when v_kind = 'daily' then public.nrm_system_schedule_next_daily_run(v_daily, now())
        else now() + make_interval(mins => v_interval)
      end
    );

    update public.nrm_system_schedule set
      schedule_kind = v_kind,
      daily_time_kst = v_daily,
      interval_minutes = v_interval,
      is_enabled = v_enabled,
      next_run_at = v_next
    where schedule_id = p_schedule_id;

    v_music_id := nullif(v_sched.config->>'music_schedule_id', '')::uuid;
    if v_music_id is not null then
      update public.music_collection_schedule set
        schedule_kind = v_kind,
        daily_time_kst = v_daily,
        interval_minutes = v_interval,
        is_enabled = v_enabled,
        next_run_at = v_next
      where schedule_id = v_music_id;
    end if;

    return p_schedule_id;
  end if;

  raise exception using errcode = '22023', message = 'unsupported system schedule job_kind';
end;
$$;

create or replace function public.nrm_rpc_system_schedule_run_now(
  p_caller_serial text,
  p_schedule_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sched public.nrm_system_schedule%rowtype;
  v_music_id uuid;
begin
  if not public.nrm_is_admin_caller(p_caller_serial) then
    raise exception using errcode = '42501', message = 'admin required';
  end if;

  select * into v_sched
  from public.nrm_system_schedule
  where schedule_id = p_schedule_id
  for update;
  if not found or not v_sched.is_enabled then
    return false;
  end if;

  if v_sched.job_kind = 'musicbrainz_collection' then
    v_music_id := nullif(v_sched.config->>'music_schedule_id', '')::uuid;
    if v_music_id is null then
      return false;
    end if;
    return public.music_rpc_admin_schedule_run_now(p_caller_serial, v_music_id);
  end if;

  if v_sched.job_kind in ('ailab_chat_retention', 'track_history_retention') then
    update public.nrm_system_schedule
    set next_run_at = now()
    where schedule_id = p_schedule_id;
    perform public.nrm_rpc_system_schedule_tick();
    return true;
  end if;

  return false;
end;
$$;

-- Capacity stop should pause MusicBrainz collection only; retention frees space.
create or replace function public.music_rpc_disable_schedulers_for_capacity(
  p_database_bytes bigint
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_music_count integer := 0;
  v_system_count integer := 0;
  v_disabled boolean := false;
begin
  update public.music_collection_schedule
  set is_enabled = false,
      last_disabled_reason = 'capacity_threshold',
      claimed_until = null,
      claim_fence_token = null,
      claimed_by = null
  where is_enabled;
  get diagnostics v_music_count = row_count;
  if v_music_count > 0 then
    v_disabled := true;
  end if;

  if to_regclass('public.nrm_system_schedule') is not null then
    update public.nrm_system_schedule
    set is_enabled = false
    where is_enabled
      and job_kind = 'musicbrainz_collection';
    get diagnostics v_system_count = row_count;
    if v_system_count > 0 then
      v_disabled := true;
    end if;
  end if;

  if v_disabled then
    insert into public.music_capacity_event(event_kind, detail)
    values (
      'schedules_disabled',
      jsonb_build_object(
        'threshold', 'disable_discovery_bytes',
        'database_bytes', p_database_bytes,
        'music_collection_disabled', v_music_count,
        'system_music_disabled', v_system_count
      )
    );
  end if;
  return v_disabled;
end;
$$;

alter function public.music_rpc_disable_schedulers_for_capacity(bigint)
  owner to nrm_music_rpc_owner;
revoke all on function public.music_rpc_disable_schedulers_for_capacity(bigint)
  from public, anon, authenticated;

grant execute on function public.nrm_rpc_track_history_retention_run(integer)
  to postgres, service_role;
revoke all on function public.nrm_rpc_track_history_retention_run(integer)
  from public, anon, authenticated;

comment on function public.nrm_rpc_system_schedule_list(text, integer, integer) is
  '관리자 시스템 스케줄 목록. MusicBrainz 상세·retention_days 포함.';
comment on function public.nrm_rpc_system_schedule_update(text, uuid, jsonb) is
  '관리자 시스템 스케줄 수정(주기·on/off; retention job은 retention_days). 생성 거부.';
comment on function public.nrm_rpc_system_schedule_run_now(text, uuid) is
  '활성 시스템 스케줄 즉시 실행 예약.';
