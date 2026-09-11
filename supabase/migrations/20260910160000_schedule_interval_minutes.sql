-- 실행 주기 interval(매 N분)을 다시 허용한다. 1~10080분.

alter table public.nrm_system_schedule
  drop constraint if exists ck_nrm_system_schedule_kind;
alter table public.nrm_system_schedule
  add constraint ck_nrm_system_schedule_kind
  check (schedule_kind in ('daily', 'weekly', 'monthly', 'once', 'interval'));

alter table public.music_collection_schedule
  drop constraint if exists ck_music_collection_schedule_kind;
alter table public.music_collection_schedule
  add constraint ck_music_collection_schedule_kind
  check (schedule_kind in ('daily', 'weekly', 'monthly', 'once', 'interval'));

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
    or (schedule_kind = 'interval' and interval_minutes between 1 and 10080
      and weekly_weekday is null and monthly_day is null and once_on_date is null)
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
    or (schedule_kind = 'interval' and interval_minutes between 1 and 10080
      and weekly_weekday is null and monthly_day is null and once_on_date is null)
  );

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
  v_interval integer;
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
  if v_kind not in ('daily', 'weekly', 'monthly', 'once', 'interval') then
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

  v_interval := case
    when v_kind = 'interval' then coalesce(
      (p_payload->>'interval_minutes')::integer,
      v_sched.interval_minutes,
      60
    )
    else null
  end;
  if v_kind = 'interval' and (v_interval is null or v_interval < 1 or v_interval > 10080) then
    raise exception using errcode = '22023', message = 'interval_minutes must be 1..10080';
  end if;
  if v_kind = 'interval' then
    v_daily := null;
  end if;

  v_enabled := coalesce((p_payload->>'is_enabled')::boolean, v_sched.is_enabled);
  v_next := coalesce(
    (p_payload->>'next_run_at')::timestamptz,
    public.nrm_system_schedule_compute_next_run(
      v_kind, v_daily, v_interval, v_weekday, now(), v_monthly_day, v_once
    )
  );

  update public.nrm_system_schedule set
    schedule_kind = v_kind,
    daily_time_kst = v_daily,
    interval_minutes = v_interval,
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
      interval_minutes = v_interval,
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
  v_interval integer;
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
  if v_kind not in ('daily', 'weekly', 'monthly', 'once', 'interval') then
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

  v_interval := case
    when v_kind = 'interval' then coalesce(
      (p_payload->>'interval_minutes')::integer,
      v_existing.interval_minutes,
      60
    )
    else null
  end;
  if v_kind = 'interval' and (v_interval is null or v_interval < 1 or v_interval > 10080) then
    raise exception using errcode = '22023', message = 'interval_minutes must be 1..10080';
  end if;
  if v_kind = 'interval' then
    v_daily := null;
  end if;

  update public.music_collection_schedule set
    display_name = coalesce(nullif(btrim(p_payload->>'display_name'), ''), display_name),
    schedule_kind = v_kind,
    daily_time_kst = v_daily,
    interval_minutes = v_interval,
    weekly_weekday = v_weekday,
    monthly_day = v_monthly_day,
    once_on_date = v_once,
    next_run_at = coalesce(
      (p_payload->>'next_run_at')::timestamptz,
      public.nrm_system_schedule_compute_next_run(
        v_kind, v_daily, v_interval, v_weekday, now(), v_monthly_day, v_once
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

comment on column public.nrm_system_schedule.schedule_kind is
  'daily | weekly | monthly | once | interval. job과 무관한 호출 주기';
comment on column public.nrm_system_schedule.interval_minutes is
  'interval일 때 실행 간격(분). 1~10080. 예: 60이면 1시간마다.';
comment on column public.music_collection_schedule.interval_minutes is
  'interval일 때 실행 간격(분). 1~10080.';
