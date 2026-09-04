-- Narrow admin-editable schedule intervals to 1..1440 minutes.
-- App UI only edits timing + on/off (and chat retention_days).

alter table public.nrm_system_schedule
  drop constraint if exists ck_nrm_system_schedule_timing;

alter table public.nrm_system_schedule
  add constraint ck_nrm_system_schedule_timing check (
    (schedule_kind = 'daily' and daily_time_kst is not null and interval_minutes is null)
    or (schedule_kind = 'interval' and daily_time_kst is null and interval_minutes between 1 and 1440)
  );

alter table public.music_collection_schedule
  drop constraint if exists ck_music_collection_schedule_timing;

alter table public.music_collection_schedule
  add constraint ck_music_collection_schedule_timing check (
    (schedule_kind = 'daily' and daily_time_kst is not null and interval_minutes is null)
    or (schedule_kind = 'interval' and daily_time_kst is null and interval_minutes between 1 and 1440)
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

  if v_sched.job_kind = 'ailab_chat_retention' then
    perform public.music_reject_unknown_keys(p_payload, array[
      'schedule_kind', 'daily_time_kst', 'interval_minutes',
      'next_run_at', 'is_enabled', 'retention_days'
    ]);

    v_days := coalesce(
      (p_payload->>'retention_days')::integer,
      (v_sched.config->>'retention_days')::integer,
      30
    );
    if v_days < 1 or v_days > 3650 then
      raise exception using errcode = '22023', message = 'retention_days must be between 1 and 3650';
    end if;

    v_kind := coalesce(nullif(p_payload->>'schedule_kind', ''), v_sched.schedule_kind);
    v_daily := case
      when v_kind = 'daily' then coalesce(
        nullif(p_payload->>'daily_time_kst', '')::time,
        v_sched.daily_time_kst,
        time '03:00'
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
    -- Admin UI may only change timing + enabled. Other music filters stay seed-owned.
    perform public.music_reject_unknown_keys(p_payload, array[
      'schedule_kind', 'daily_time_kst', 'interval_minutes',
      'next_run_at', 'is_enabled'
    ]);

    v_music_id := nullif(v_sched.config->>'music_schedule_id', '')::uuid;
    if v_music_id is null then
      raise exception using errcode = 'P0002', message = 'linked music schedule missing';
    end if;

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
    if v_kind = 'interval' and (v_interval is null or v_interval < 1 or v_interval > 1440) then
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

    update public.music_collection_schedule set
      schedule_kind = v_kind,
      daily_time_kst = v_daily,
      interval_minutes = v_interval,
      next_run_at = v_next,
      is_enabled = v_enabled,
      last_disabled_reason = case when v_enabled then null else coalesce(last_disabled_reason, 'admin') end
    where schedule_id = v_music_id;

    update public.nrm_system_schedule set
      schedule_kind = v_kind,
      daily_time_kst = v_daily,
      interval_minutes = v_interval,
      next_run_at = v_next,
      is_enabled = v_enabled
    where schedule_id = p_schedule_id;

    return p_schedule_id;
  end if;

  raise exception using errcode = '22023', message = 'unsupported job_kind';
end;
$$;

comment on function public.nrm_rpc_system_schedule_update(text, uuid, jsonb) is
  '관리자: 기존 시스템 스케줄의 실행 주기·on/off(및 chat retention_days)만 편집. 신규 생성·삭제는 불가.';
