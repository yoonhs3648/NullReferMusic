-- 관리 UI 실행 주기: daily | weekly | monthly | once.
-- job(호출 기능)은 그대로 두고 날짜·시각만 유연하게 설정한다.
-- interval 행은 daily로 변환한다. monthly는 일자(1~31, 없는 날은 말일)를 지정한다.

-- ---------------------------------------------------------------------------
-- 1) 컬럼
-- ---------------------------------------------------------------------------
alter table public.nrm_system_schedule
  add column if not exists monthly_day smallint;
alter table public.nrm_system_schedule
  add column if not exists once_on_date date;

alter table public.music_collection_schedule
  add column if not exists monthly_day smallint;
alter table public.music_collection_schedule
  add column if not exists once_on_date date;

comment on column public.nrm_system_schedule.monthly_day is
  'monthly일 때 일자 1~31. 해당 월에 없는 날짜는 말일로 실행.';
comment on column public.nrm_system_schedule.once_on_date is
  'once일 때 KST 날짜. daily_time_kst와 함께 단 1회 슬롯.';
comment on column public.music_collection_schedule.monthly_day is
  'monthly일 때 일자 1~31. 해당 월에 없는 날짜는 말일로 실행.';
comment on column public.music_collection_schedule.once_on_date is
  'once일 때 KST 날짜. daily_time_kst와 함께 단 1회 슬롯.';

-- interval → daily (시각은 다음 실행의 KST 시각, 없으면 09:00)
update public.nrm_system_schedule
set schedule_kind = 'daily',
    daily_time_kst = coalesce(
      daily_time_kst,
      (next_run_at at time zone 'Asia/Seoul')::time,
      time '09:00'
    ),
    interval_minutes = null,
    weekly_weekday = null,
    monthly_day = null,
    once_on_date = null
where schedule_kind = 'interval';

update public.music_collection_schedule
set schedule_kind = 'daily',
    daily_time_kst = coalesce(
      daily_time_kst,
      (next_run_at at time zone 'Asia/Seoul')::time,
      time '09:00'
    ),
    interval_minutes = null,
    weekly_weekday = null,
    monthly_day = null,
    once_on_date = null
where schedule_kind = 'interval';

update public.nrm_system_schedule
set monthly_day = 1,
    once_on_date = null
where schedule_kind = 'monthly';

update public.music_collection_schedule
set monthly_day = 1,
    once_on_date = null
where schedule_kind = 'monthly';

update public.nrm_system_schedule
set monthly_day = null,
    once_on_date = null
where schedule_kind in ('daily', 'weekly');

update public.music_collection_schedule
set monthly_day = null,
    once_on_date = null
where schedule_kind in ('daily', 'weekly');

alter table public.nrm_system_schedule
  drop constraint if exists ck_nrm_system_schedule_kind;
alter table public.nrm_system_schedule
  add constraint ck_nrm_system_schedule_kind
  check (schedule_kind in ('daily', 'weekly', 'monthly', 'once'));

alter table public.music_collection_schedule
  drop constraint if exists ck_music_collection_schedule_kind;
alter table public.music_collection_schedule
  add constraint ck_music_collection_schedule_kind
  check (schedule_kind in ('daily', 'weekly', 'monthly', 'once'));

alter table public.nrm_system_schedule
  drop constraint if exists ck_nrm_system_schedule_timing;
alter table public.nrm_system_schedule
  add constraint ck_nrm_system_schedule_timing check (
    (schedule_kind = 'daily' and daily_time_kst is not null
      and interval_minutes is null and weekly_weekday is null
      and monthly_day is null and once_on_date is null)
    or (schedule_kind = 'weekly' and daily_time_kst is not null
      and interval_minutes is null and weekly_weekday between 0 and 6
      and monthly_day is null and once_on_date is null)
    or (schedule_kind = 'monthly' and daily_time_kst is not null
      and interval_minutes is null and weekly_weekday is null
      and monthly_day between 1 and 31 and once_on_date is null)
    or (schedule_kind = 'once' and daily_time_kst is not null
      and interval_minutes is null and weekly_weekday is null
      and monthly_day is null and once_on_date is not null)
  );

alter table public.music_collection_schedule
  drop constraint if exists ck_music_collection_schedule_timing;
alter table public.music_collection_schedule
  add constraint ck_music_collection_schedule_timing check (
    (schedule_kind = 'daily' and daily_time_kst is not null
      and interval_minutes is null and weekly_weekday is null
      and monthly_day is null and once_on_date is null)
    or (schedule_kind = 'weekly' and daily_time_kst is not null
      and interval_minutes is null and weekly_weekday between 0 and 6
      and monthly_day is null and once_on_date is null)
    or (schedule_kind = 'monthly' and daily_time_kst is not null
      and interval_minutes is null and weekly_weekday is null
      and monthly_day between 1 and 31 and once_on_date is null)
    or (schedule_kind = 'once' and daily_time_kst is not null
      and interval_minutes is null and weekly_weekday is null
      and monthly_day is null and once_on_date is not null)
  );

-- ---------------------------------------------------------------------------
-- 2) next-run 계산 (job_kind와 무관. 앞으로 추가되는 스케줄도 같은 계약)
-- ---------------------------------------------------------------------------
create or replace function public.nrm_system_schedule_next_monthly_run(
  p_time_kst time,
  p_from timestamptz default now(),
  p_monthly_day smallint default 1
)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_local timestamp;
  v_day integer;
  v_month_start date;
  v_last integer;
  v_slot timestamp;
begin
  if p_time_kst is null then
    raise exception using errcode = '22023', message = 'invalid monthly time';
  end if;
  v_day := greatest(1, least(31, coalesce(p_monthly_day, 1)::integer));
  v_local := p_from at time zone 'Asia/Seoul';
  v_month_start := date_trunc('month', v_local)::date;
  v_last := extract(day from (date_trunc('month', v_local) + interval '1 month' - interval '1 day'))::integer;
  v_slot := (v_month_start + least(v_day, v_last) - 1) + p_time_kst;
  if v_local >= v_slot then
    v_month_start := (date_trunc('month', v_local) + interval '1 month')::date;
    v_last := extract(day from (date_trunc('month', v_month_start) + interval '1 month' - interval '1 day'))::integer;
    v_slot := (v_month_start + least(v_day, v_last) - 1) + p_time_kst;
  end if;
  return v_slot at time zone 'Asia/Seoul';
end;
$$;

create or replace function public.nrm_system_schedule_next_once_run(
  p_once_on_date date,
  p_time_kst time
)
returns timestamptz
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_once_on_date is null or p_time_kst is null then
    raise exception using errcode = '22023', message = 'invalid once date/time';
  end if;
  return (p_once_on_date + p_time_kst) at time zone 'Asia/Seoul';
end;
$$;

create or replace function public.nrm_system_schedule_compute_next_run(
  p_kind text,
  p_daily_time time,
  p_interval_minutes integer,
  p_weekly_weekday smallint,
  p_from timestamptz default now(),
  p_monthly_day smallint default 1,
  p_once_on_date date default null
)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_kind = 'weekly' then
    return public.nrm_system_schedule_next_weekly_run(p_weekly_weekday, p_daily_time, p_from);
  end if;
  if p_kind = 'monthly' then
    return public.nrm_system_schedule_next_monthly_run(p_daily_time, p_from, p_monthly_day);
  end if;
  if p_kind = 'once' then
    return public.nrm_system_schedule_next_once_run(p_once_on_date, p_daily_time);
  end if;
  if p_kind = 'interval' then
    return p_from + pg_catalog.make_interval(mins => coalesce(p_interval_minutes, 60));
  end if;
  return public.nrm_system_schedule_next_daily_run(p_daily_time, p_from);
end;
$$;

drop function if exists public.nrm_system_schedule_next_monthly_run(time, timestamptz);
drop function if exists public.nrm_system_schedule_compute_next_run(text, time, integer, smallint, timestamptz);

create or replace function public.music_rpc_sync_system_schedule_next_run(
  p_music_schedule_id uuid,
  p_next_run_at timestamptz,
  p_is_enabled boolean default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_music_schedule_id is null or p_next_run_at is null then
    return;
  end if;
  update public.nrm_system_schedule
  set next_run_at = p_next_run_at,
      is_enabled = coalesce(p_is_enabled, is_enabled),
      updated_at = now()
  where job_kind = 'musicbrainz_collection'
    and nullif(config->>'music_schedule_id', '')::uuid = p_music_schedule_id;
exception
  when others then
    perform public.nrm_system_schedule_log_write(
      'rpc', 'ledger_next_run_sync_failed', 'error',
      jsonb_build_object(
        'music_schedule_id', p_music_schedule_id,
        'sqlstate', sqlstate,
        'message', sqlerrm
      )
    );
end;
$$;

drop function if exists public.music_rpc_sync_system_schedule_next_run(uuid, timestamptz);

-- ---------------------------------------------------------------------------
-- 3) tick / list / update (모든 job_kind가 같은 timing 키를 쓴다)
-- ---------------------------------------------------------------------------
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
  v_system_run_id uuid;
  v_status text;
  v_error text;
begin
  perform public.nrm_system_schedule_log_write(
    'cron', 'system_tick_start', 'info', '{}'::jsonb
  );

  for v_sched in
    select *
    from public.nrm_system_schedule
    where is_enabled
      and job_kind in ('ailab_chat_retention', 'track_history_retention', 'ops_cleanup')
      and next_run_at <= now()
    order by next_run_at, schedule_key
    for update skip locked
  loop
    v_error := null;
    v_run := null;
    v_next := public.nrm_system_schedule_compute_next_run(
      v_sched.schedule_kind, v_sched.daily_time_kst, v_sched.interval_minutes,
      v_sched.weekly_weekday, now(), v_sched.monthly_day, v_sched.once_on_date
    );

    insert into public.nrm_system_schedule_run(
      schedule_id, job_kind, run_status, started_at
    ) values (
      v_sched.schedule_id, v_sched.job_kind, 'running', now()
    )
    returning system_run_id into v_system_run_id;

    begin
      if v_sched.job_kind = 'ailab_chat_retention' then
        v_run := public.nrm_rpc_ailab_chat_retention_run(500);
        v_status := 'completed';
      elsif v_sched.job_kind = 'track_history_retention' then
        v_run := public.nrm_rpc_track_history_retention_run(2000);
        v_status := 'completed';
      elsif v_sched.job_kind = 'ops_cleanup' then
        v_run := public.nrm_rpc_ops_cleanup_run();
        if coalesce((v_run->>'truncated')::boolean, false)
           or (
             jsonb_typeof(v_run->'errors') = 'array'
             and jsonb_array_length(v_run->'errors') > 0
           ) then
          v_status := 'partial';
          if jsonb_typeof(v_run->'errors') = 'array'
             and jsonb_array_length(v_run->'errors') > 0 then
            v_error := v_run->'errors'->0->>'message';
          end if;
        else
          v_status := 'completed';
        end if;
      else
        v_run := jsonb_build_object('ran', false, 'reason', 'unsupported_job_kind');
        v_status := 'failed';
      end if;
    exception
      when others then
        v_status := 'failed';
        v_error := sqlerrm;
        v_run := jsonb_build_object('ran', false, 'sqlstate', sqlstate, 'message', sqlerrm);
    end;

    update public.nrm_system_schedule
    set next_run_at = v_next,
        is_enabled = case when v_sched.schedule_kind = 'once' then false else is_enabled end,
        updated_at = now()
    where schedule_id = v_sched.schedule_id;

    update public.nrm_system_schedule_run
    set run_status = v_status,
        finished_at = now(),
        error_message = v_error,
        result = coalesce(v_run, '{}'::jsonb),
        updated_at = now()
    where system_run_id = v_system_run_id;

    perform public.nrm_system_schedule_log_write(
      'cron',
      case when v_status = 'failed' then 'retention_failed' else 'retention_ran' end,
      case when v_status = 'failed' then 'error' else 'info' end,
      jsonb_build_object('result', v_run, 'next_run_at', v_next),
      v_sched.schedule_id, v_sched.schedule_key, null, null
    );

    v_result := v_result || jsonb_build_array(
      jsonb_build_object(
        'schedule_key', v_sched.schedule_key,
        'job_kind', v_sched.job_kind,
        'next_run_at', v_next,
        'system_run_id', v_system_run_id,
        'run_status', v_status,
        'result', v_run
      )
    );
  end loop;

  perform public.nrm_system_schedule_log_write(
    'cron', 'system_tick_done', 'info',
    jsonb_build_object('processed', v_result)
  );
  return jsonb_build_object('processed', v_result);
end;
$$;


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
          when 'ops_cleanup' then 7500
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
          'weekly_weekday', s.weekly_weekday,
          'monthly_day', s.monthly_day,
          'once_on_date', s.once_on_date,
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
          when 'ops_cleanup' then 7500
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
  v_enabled boolean;
  v_next timestamptz;
  v_weekday smallint;
  v_monthly_day smallint;
  v_once date;
  v_default_time time;
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

  if v_sched.job_kind not in (
    'ailab_chat_retention', 'track_history_retention',
    'musicbrainz_collection', 'ops_cleanup'
  ) then
    raise exception using errcode = '22023', message = 'unsupported system schedule job_kind';
  end if;

  if v_sched.job_kind in ('ailab_chat_retention', 'track_history_retention') then
    perform public.music_reject_unknown_keys(p_payload, array[
      'schedule_kind', 'daily_time_kst', 'interval_minutes', 'weekly_weekday',
      'monthly_day', 'once_on_date', 'next_run_at', 'is_enabled', 'retention_days'
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
    v_default_time := case v_sched.job_kind
      when 'track_history_retention' then time '08:00'
      else time '03:00'
    end;
  else
    perform public.music_reject_unknown_keys(p_payload, array[
      'schedule_kind', 'daily_time_kst', 'interval_minutes', 'weekly_weekday',
      'monthly_day', 'once_on_date', 'next_run_at', 'is_enabled'
    ]);
    v_days := null;
    v_default_time := time '00:00';
  end if;

  v_kind := coalesce(nullif(p_payload->>'schedule_kind', ''), v_sched.schedule_kind);
  if v_kind = 'interval' then
    raise exception using
      errcode = '22023',
      message = 'interval is no longer supported; use daily, weekly, monthly, or once';
  end if;
  if v_kind not in ('daily', 'weekly', 'monthly', 'once') then
    raise exception using errcode = '22023', message = 'invalid schedule_kind';
  end if;

  v_daily := coalesce(
    nullif(p_payload->>'daily_time_kst', '')::time,
    v_sched.daily_time_kst,
    v_default_time
  );
  v_weekday := case
    when v_kind = 'weekly' then coalesce(
      (p_payload->>'weekly_weekday')::smallint,
      v_sched.weekly_weekday,
      0
    )
    else null
  end;
  if v_kind = 'weekly' and (v_weekday < 0 or v_weekday > 6) then
    raise exception using errcode = '22023', message = 'weekly_weekday must be 0..6';
  end if;

  v_monthly_day := case
    when v_kind = 'monthly' then coalesce(
      (p_payload->>'monthly_day')::smallint,
      v_sched.monthly_day,
      1
    )
    else null
  end;
  if v_kind = 'monthly' and (v_monthly_day < 1 or v_monthly_day > 31) then
    raise exception using errcode = '22023', message = 'monthly_day must be 1..31';
  end if;

  v_once := case
    when v_kind = 'once' then coalesce(
      nullif(p_payload->>'once_on_date', '')::date,
      v_sched.once_on_date,
      (now() at time zone 'Asia/Seoul')::date
    )
    else null
  end;

  v_enabled := coalesce((p_payload->>'is_enabled')::boolean, v_sched.is_enabled);
  v_next := coalesce(
    (p_payload->>'next_run_at')::timestamptz,
    public.nrm_system_schedule_compute_next_run(
      v_kind, v_daily, null, v_weekday, now(), v_monthly_day, v_once
    )
  );

  update public.nrm_system_schedule set
    schedule_kind = v_kind,
    daily_time_kst = v_daily,
    interval_minutes = null,
    weekly_weekday = v_weekday,
    monthly_day = v_monthly_day,
    once_on_date = v_once,
    is_enabled = v_enabled,
    next_run_at = v_next,
    config = case
      when v_sched.job_kind in ('ailab_chat_retention', 'track_history_retention')
        then jsonb_build_object('retention_days', v_days)
      else config
    end
  where schedule_id = p_schedule_id;

  v_music_id := nullif(v_sched.config->>'music_schedule_id', '')::uuid;
  if v_sched.job_kind = 'musicbrainz_collection' and v_music_id is not null then
    update public.music_collection_schedule set
      schedule_kind = v_kind,
      daily_time_kst = v_daily,
      interval_minutes = null,
      weekly_weekday = v_weekday,
      monthly_day = v_monthly_day,
      once_on_date = v_once,
      is_enabled = v_enabled,
      next_run_at = v_next
    where schedule_id = v_music_id;
  end if;

  return p_schedule_id;
end;
$$;


create or replace function public.music_rpc_admin_schedule_upsert(
  p_caller_serial text, p_schedule_id uuid, p_payload jsonb
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := p_schedule_id;
  v_existing public.music_collection_schedule%rowtype;
  v_kind text;
  v_daily time;
  v_weekday smallint;
  v_monthly_day smallint;
  v_once date;
begin
  if not public.nrm_is_admin_caller(p_caller_serial) then
    raise exception using errcode = '42501', message = 'admin required';
  end if;
  if p_schedule_id is null then
    raise exception using
      errcode = '22023',
      message = 'schedule create is forbidden; update existing schedule_id only';
  end if;

  select * into v_existing
  from public.music_collection_schedule
  where schedule_id = p_schedule_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'music schedule not found';
  end if;

  perform public.music_reject_unknown_keys(p_payload, array[
    'schedule_key','display_name','schedule_kind','daily_time_kst','interval_minutes',
    'weekly_weekday','monthly_day','once_on_date',
    'next_run_at','is_enabled','date_from_offset_days','date_to_offset_days',
    'country_codes','primary_types','secondary_types','release_statuses',
    'max_artist_count','max_request_count','max_new_recording_count','priority'
  ]);

  if p_payload ? 'schedule_key'
     and nullif(btrim(p_payload->>'schedule_key'), '') is distinct from v_existing.schedule_key then
    raise exception using
      errcode = '22023',
      message = 'schedule_key is immutable';
  end if;

  v_kind := coalesce(nullif(p_payload->>'schedule_kind', ''), v_existing.schedule_kind);
  if v_kind = 'interval' then
    raise exception using
      errcode = '22023',
      message = 'interval is no longer supported; use daily, weekly, monthly, or once';
  end if;
  if v_kind not in ('daily', 'weekly', 'monthly', 'once') then
    raise exception using errcode = '22023', message = 'invalid schedule_kind';
  end if;

  v_daily := coalesce(
    nullif(p_payload->>'daily_time_kst', '')::time,
    v_existing.daily_time_kst,
    time '00:00'
  );
  v_weekday := case
    when v_kind = 'weekly' then coalesce(
      (p_payload->>'weekly_weekday')::smallint,
      v_existing.weekly_weekday,
      0
    )
    else null
  end;
  v_monthly_day := case
    when v_kind = 'monthly' then coalesce(
      (p_payload->>'monthly_day')::smallint,
      v_existing.monthly_day,
      1
    )
    else null
  end;
  v_once := case
    when v_kind = 'once' then coalesce(
      nullif(p_payload->>'once_on_date', '')::date,
      v_existing.once_on_date,
      (now() at time zone 'Asia/Seoul')::date
    )
    else null
  end;

  update public.music_collection_schedule set
    display_name = coalesce(nullif(btrim(p_payload->>'display_name'), ''), display_name),
    schedule_kind = v_kind,
    daily_time_kst = v_daily,
    interval_minutes = null,
    weekly_weekday = v_weekday,
    monthly_day = v_monthly_day,
    once_on_date = v_once,
    next_run_at = coalesce(
      (p_payload->>'next_run_at')::timestamptz,
      public.nrm_system_schedule_compute_next_run(
        v_kind, v_daily, null, v_weekday, now(), v_monthly_day, v_once
      )
    ),
    is_enabled = coalesce((p_payload->>'is_enabled')::boolean, is_enabled),
    date_from_offset_days = coalesce((p_payload->>'date_from_offset_days')::integer, date_from_offset_days),
    date_to_offset_days = coalesce((p_payload->>'date_to_offset_days')::integer, date_to_offset_days),
    country_codes = case
      when p_payload ? 'country_codes'
        then coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'country_codes','[]'::jsonb))), '{}')
      else country_codes
    end,
    primary_types = case
      when p_payload ? 'primary_types'
        then coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'primary_types','[]'::jsonb))), '{}')
      else primary_types
    end,
    secondary_types = case
      when p_payload ? 'secondary_types'
        then coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'secondary_types','[]'::jsonb))), '{}')
      else secondary_types
    end,
    release_statuses = case
      when p_payload ? 'release_statuses'
        then coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'release_statuses','[]'::jsonb))), '{}')
      else release_statuses
    end,
    max_artist_count = coalesce((p_payload->>'max_artist_count')::integer, max_artist_count),
    max_request_count = coalesce((p_payload->>'max_request_count')::integer, max_request_count),
    max_new_recording_count = coalesce((p_payload->>'max_new_recording_count')::integer, max_new_recording_count),
    priority = coalesce((p_payload->>'priority')::integer, priority),
    last_disabled_reason = case
      when coalesce((p_payload->>'is_enabled')::boolean, is_enabled) then null
      else coalesce(last_disabled_reason, 'admin')
    end
  where schedule_id = v_id;

  update public.nrm_system_schedule s set
    display_name = m.display_name,
    is_enabled = m.is_enabled,
    schedule_kind = m.schedule_kind,
    daily_time_kst = m.daily_time_kst,
    interval_minutes = m.interval_minutes,
    weekly_weekday = m.weekly_weekday,
    monthly_day = m.monthly_day,
    once_on_date = m.once_on_date,
    next_run_at = m.next_run_at
  from public.music_collection_schedule m
  where m.schedule_id = v_id
    and s.job_kind = 'musicbrainz_collection'
    and (s.config->>'music_schedule_id')::uuid = v_id;

  return v_id;
end;
$$;

create or replace function public.music_rpc_claim_due_schedules(
  p_worker_id uuid,
  p_batch_size integer,
  p_lease_seconds integer
)
returns table(
  schedule_run_id uuid,
  schedule_id uuid,
  fence_token uuid,
  date_from date,
  date_to date,
  max_request_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bytes bigint;
  v_policy public.music_capacity_policy%rowtype;
  v_schedule public.music_collection_schedule%rowtype;
  v_run_id uuid;
  v_fence uuid;
  v_from date;
  v_to date;
  v_request_key text;
  v_inserted integer;
  v_diag jsonb;
begin
  if p_worker_id is null
     or p_batch_size not between 1 and 20
     or p_lease_seconds not between 15 and 300 then
    raise exception using errcode = '22023', message = 'invalid schedule claim parameters';
  end if;

  perform pg_catalog.set_config('lock_timeout', '5s', true);
  perform public.music_rpc_recover_stale_collection();

  begin
    perform public.music_rpc_catalog_commit_pending();
  exception
    when others then
      perform public.nrm_system_schedule_log_write(
        'rpc', 'claim_due_commit_pending_failed', 'error',
        jsonb_build_object('sqlstate', sqlstate, 'message', sqlerrm, 'worker_id', p_worker_id)
      );
  end;

  if public.music_collection_is_busy() then
    v_diag := public.music_rpc_scheduler_diagnostics();
    perform public.nrm_system_schedule_log_write(
      'rpc', 'claim_due_skipped_busy', 'info',
      jsonb_build_object(
        'worker_id', p_worker_id,
        'running_runs', v_diag->'running_runs',
        'open_jobs', v_diag->'open_jobs',
        'due_count', jsonb_array_length(coalesce(v_diag->'due_schedules', '[]'::jsonb))
      )
    );
    return;
  end if;

  v_bytes := pg_catalog.pg_database_size(pg_catalog.current_database());
  select * into v_policy
  from public.music_capacity_policy
  where policy_key = 'project1'
  for update skip locked;
  if not found then
    if exists (
      select 1 from public.music_capacity_policy p where p.policy_key = 'project1'
    ) then
      perform public.nrm_system_schedule_log_write(
        'rpc', 'claim_due_skipped_lock', 'info',
        jsonb_build_object('worker_id', p_worker_id)
      );
      return;
    end if;
  elsif v_policy.is_enabled and v_bytes >= v_policy.disable_discovery_bytes then
    perform public.music_rpc_disable_schedulers_for_capacity(v_bytes);
    perform public.nrm_system_schedule_log_write(
      'rpc', 'claim_due_skipped_capacity', 'warn',
      jsonb_build_object('database_bytes', v_bytes, 'limit', v_policy.disable_discovery_bytes)
    );
    return;
  end if;

  select s.*
  into v_schedule
  from public.music_collection_schedule s
  where s.is_enabled
    and (s.lastfm_method is not null or s.collection_mode = 'tag_refresh')
    and s.next_run_at <= now()
    and (s.claimed_until is null or s.claimed_until < now())
  order by s.priority, s.next_run_at
  for update skip locked
  limit 1;
  if not found then
    return;
  end if;

  v_run_id := extensions.gen_random_uuid();
  v_fence := extensions.gen_random_uuid();
  v_from := (now() at time zone 'Asia/Seoul')::date + v_schedule.date_from_offset_days;
  v_to := (now() at time zone 'Asia/Seoul')::date + v_schedule.date_to_offset_days;
  if v_from > v_to then
    perform public.nrm_system_schedule_log_write(
      'rpc', 'claim_due_invalid_window', 'error',
      jsonb_build_object(
        'schedule_key', v_schedule.schedule_key,
        'date_from', v_from,
        'date_to', v_to
      ),
      null, v_schedule.schedule_key, null, null
    );
    return;
  end if;
  v_request_key := pg_catalog.encode(extensions.digest(
    v_schedule.schedule_id::text || ':' || v_schedule.next_run_at::text || ':' || v_run_id::text,
    'sha256'
  ), 'hex');

  insert into public.music_schedule_run(
    schedule_run_id, schedule_id, request_key, fence_token, worker_id, lease_until,
    date_from, date_to, capacity_before_bytes
  ) values (
    v_run_id, v_schedule.schedule_id, v_request_key, v_fence, p_worker_id,
    now() + pg_catalog.make_interval(secs => p_lease_seconds), v_from, v_to, v_bytes
  );
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return;
  end if;

  update public.music_collection_schedule
  set claimed_until = now() + pg_catalog.make_interval(secs => p_lease_seconds),
      claim_fence_token = v_fence,
      claimed_by = p_worker_id,
      next_run_at = public.nrm_system_schedule_compute_next_run(
        schedule_kind, daily_time_kst, interval_minutes, weekly_weekday, now(),
        monthly_day, once_on_date
      ),
      is_enabled = case when schedule_kind = 'once' then false else is_enabled end
  where music_collection_schedule.schedule_id = v_schedule.schedule_id
  returning * into v_schedule;

  perform public.music_rpc_sync_system_schedule_next_run(
    v_schedule.schedule_id, v_schedule.next_run_at, v_schedule.is_enabled
  );

  perform public.music_collection_enqueue_pool_job(
    v_schedule.schedule_id, v_run_id, v_request_key, v_schedule.priority,
    coalesce(v_schedule.collection_mode, 'upcoming')
  );

  perform public.nrm_system_schedule_log_write(
    'rpc', 'claim_due_started', 'info',
    jsonb_build_object(
      'music_schedule_id', v_schedule.schedule_id,
      'schedule_key', v_schedule.schedule_key,
      'date_from', v_from,
      'date_to', v_to,
      'max_request_count', v_schedule.max_request_count
    ),
    null, v_schedule.schedule_key, v_run_id, null
  );

  return query
    select v_run_id, v_schedule.schedule_id, v_fence, v_from, v_to,
           v_schedule.max_request_count;
exception
  when others then
    perform public.nrm_system_schedule_log_write(
      'rpc', 'claim_due_exception', 'error',
      jsonb_build_object(
        'worker_id', p_worker_id,
        'sqlstate', sqlstate,
        'message', sqlerrm
      )
    );
    raise;
end;
$$;

create or replace function public.music_rpc_admin_schedule_run_now(
  p_caller_serial text,
  p_schedule_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_schedule public.music_collection_schedule%rowtype;
  v_bytes bigint;
  v_policy public.music_capacity_policy%rowtype;
  v_run_id uuid;
  v_fence uuid;
  v_from date;
  v_to date;
  v_request_key text;
  v_busy boolean;
  v_kick jsonb;
  v_next timestamptz;
begin
  if not public.nrm_is_admin_caller(p_caller_serial) then
    raise exception using errcode = '42501', message = 'admin required';
  end if;

  perform pg_catalog.set_config('lock_timeout', '5s', true);
  perform public.music_rpc_recover_stale_collection();

  select * into v_schedule
  from public.music_collection_schedule
  where schedule_id = p_schedule_id
  for update;
  if not found then
    perform public.nrm_system_schedule_log_write(
      'rpc', 'run_now_missing_music', 'error',
      jsonb_build_object('music_schedule_id', p_schedule_id)
    );
    return false;
  end if;
  if not v_schedule.is_enabled then
    perform public.nrm_system_schedule_log_write(
      'rpc', 'run_now_disabled', 'warn',
      jsonb_build_object('music_schedule_id', p_schedule_id, 'schedule_key', v_schedule.schedule_key),
      null, v_schedule.schedule_key, null, null
    );
    return false;
  end if;
  if v_schedule.collection_mode <> 'tag_refresh' and v_schedule.lastfm_method is null then
    perform public.nrm_system_schedule_log_write(
      'rpc', 'run_now_no_lastfm_method', 'error',
      jsonb_build_object('music_schedule_id', p_schedule_id, 'schedule_key', v_schedule.schedule_key),
      null, v_schedule.schedule_key, null, null
    );
    raise exception using
      errcode = '22023',
      message = 'lastfm_method is not configured for ' || v_schedule.schedule_key;
  end if;

  v_busy := public.music_collection_is_busy();
  if v_busy then
    update public.music_collection_schedule
    set next_run_at = now()
    where schedule_id = p_schedule_id
    returning next_run_at into v_next;
    perform public.music_rpc_sync_system_schedule_next_run(p_schedule_id, v_next);
    perform public.nrm_system_schedule_log_write(
      'rpc', 'run_now_queued_busy', 'info',
      jsonb_build_object(
        'music_schedule_id', p_schedule_id,
        'schedule_key', v_schedule.schedule_key,
        'diagnostics', public.music_rpc_scheduler_diagnostics()
      ),
      null, v_schedule.schedule_key, null, null
    );
    begin
      v_kick := public.nrm_rpc_musicbrainz_dispatcher_cron();
    exception
      when others then
        v_kick := jsonb_build_object('ok', false, 'sqlstate', sqlstate, 'message', sqlerrm);
    end;
    perform public.nrm_system_schedule_log_write(
      'rpc', 'run_now_worker_kick', 'info',
      jsonb_build_object('kick', v_kick, 'queued', true),
      null, v_schedule.schedule_key, null, null
    );
    return true;
  end if;

  v_bytes := pg_catalog.pg_database_size(pg_catalog.current_database());
  select * into v_policy
  from public.music_capacity_policy
  where policy_key = 'project1'
  for update skip locked;
  if not found then
    if exists (
      select 1 from public.music_capacity_policy p where p.policy_key = 'project1'
    ) then
      update public.music_collection_schedule
      set next_run_at = now()
      where schedule_id = p_schedule_id
      returning next_run_at into v_next;
      perform public.music_rpc_sync_system_schedule_next_run(p_schedule_id, v_next);
      begin
        v_kick := public.nrm_rpc_musicbrainz_dispatcher_cron();
      exception
        when others then
          v_kick := jsonb_build_object('ok', false, 'sqlstate', sqlstate, 'message', sqlerrm);
      end;
      perform public.nrm_system_schedule_log_write(
        'rpc', 'run_now_queued_lock', 'info',
        jsonb_build_object('kick', v_kick, 'schedule_key', v_schedule.schedule_key),
        null, v_schedule.schedule_key, null, null
      );
      return true;
    end if;
  elsif v_policy.is_enabled and v_bytes >= v_policy.disable_discovery_bytes then
    perform public.music_rpc_disable_schedulers_for_capacity(v_bytes);
    perform public.nrm_system_schedule_log_write(
      'rpc', 'run_now_capacity_disabled', 'warn',
      jsonb_build_object('database_bytes', v_bytes, 'limit', v_policy.disable_discovery_bytes),
      null, v_schedule.schedule_key, null, null
    );
    return true;
  end if;

  v_run_id := extensions.gen_random_uuid();
  v_fence := extensions.gen_random_uuid();
  v_from := (now() at time zone 'Asia/Seoul')::date + v_schedule.date_from_offset_days;
  v_to := (now() at time zone 'Asia/Seoul')::date + v_schedule.date_to_offset_days;
  if v_from > v_to then
    raise exception using
      errcode = '22023',
      message = 'invalid date window: ' || v_from::text || ' > ' || v_to::text;
  end if;
  v_request_key := pg_catalog.encode(extensions.digest(
    'run-now:' || v_schedule.schedule_id::text || ':' || v_run_id::text, 'sha256'
  ), 'hex');

  insert into public.music_schedule_run(
    schedule_run_id, schedule_id, request_key, fence_token, worker_id, lease_until,
    date_from, date_to, capacity_before_bytes
  ) values (
    v_run_id, v_schedule.schedule_id, v_request_key, v_fence,
    '00000000-0000-0000-0000-0000000000a1',
    now() + interval '3 minutes',
    v_from, v_to, v_bytes
  );

  perform public.music_collection_enqueue_pool_job(
    v_schedule.schedule_id, v_run_id, v_request_key, v_schedule.priority,
    coalesce(v_schedule.collection_mode, 'upcoming')
  );

  update public.music_collection_schedule
  set claimed_until = now() + interval '3 minutes',
      claim_fence_token = v_fence,
      claimed_by = '00000000-0000-0000-0000-0000000000a1',
      next_run_at = public.nrm_system_schedule_compute_next_run(
        schedule_kind, daily_time_kst, interval_minutes, weekly_weekday, now(),
        monthly_day, once_on_date
      ),
      is_enabled = case when schedule_kind = 'once' then false else is_enabled end
  where schedule_id = p_schedule_id
  returning * into v_schedule;

  perform public.music_rpc_sync_system_schedule_next_run(
    p_schedule_id, v_schedule.next_run_at, v_schedule.is_enabled
  );

  perform public.nrm_system_schedule_log_write(
    'rpc', 'run_now_started', 'info',
    jsonb_build_object(
      'music_schedule_id', p_schedule_id,
      'schedule_key', v_schedule.schedule_key,
      'date_from', v_from,
      'date_to', v_to
    ),
    null, v_schedule.schedule_key, v_run_id, null
  );

  begin
    v_kick := public.nrm_rpc_musicbrainz_dispatcher_cron();
  exception
    when others then
      v_kick := jsonb_build_object('ok', false, 'sqlstate', sqlstate, 'message', sqlerrm);
  end;
  perform public.nrm_system_schedule_log_write(
    'rpc', 'run_now_worker_kick', 'info',
    jsonb_build_object('kick', v_kick, 'queued', false),
    null, v_schedule.schedule_key, v_run_id, null
  );
  return true;
exception
  when others then
    perform public.nrm_system_schedule_log_write(
      'rpc', 'run_now_exception', 'error',
      jsonb_build_object(
        'music_schedule_id', p_schedule_id,
        'sqlstate', sqlstate,
        'message', sqlerrm
      )
    );
    raise exception using
      errcode = 'P0001',
      message = '즉시 실행 실패(' || coalesce(sqlstate, '?') || '): ' || sqlerrm;
end;
$$;

grant execute on function public.nrm_system_schedule_next_monthly_run(time, timestamptz, smallint)
  to nrm_music_rpc_owner, service_role, postgres;
grant execute on function public.nrm_system_schedule_next_once_run(date, time)
  to nrm_music_rpc_owner, service_role, postgres;
grant execute on function public.nrm_system_schedule_compute_next_run(text, time, integer, smallint, timestamptz, smallint, date)
  to nrm_music_rpc_owner, service_role, postgres, anon, authenticated;
grant execute on function public.music_rpc_sync_system_schedule_next_run(uuid, timestamptz, boolean)
  to nrm_music_rpc_owner, service_role, postgres;
grant execute on function public.nrm_rpc_system_schedule_tick()
  to postgres, service_role, nrm_music_rpc_owner;
grant execute on function public.nrm_rpc_system_schedule_list(text, integer, integer)
  to anon, authenticated, service_role;
grant execute on function public.nrm_rpc_system_schedule_update(text, uuid, jsonb)
  to anon, authenticated, service_role;

comment on function public.nrm_system_schedule_next_once_run(date, time) is
  'KST 날짜+시각 단 1회 슬롯';
comment on function public.nrm_system_schedule_next_monthly_run(time, timestamptz, smallint) is
  'KST 기준 다음 월 일자·시각. 없는 날짜는 말일';
comment on column public.nrm_system_schedule.schedule_kind is
  'daily | weekly | monthly | once. job과 무관한 호출 주기';

