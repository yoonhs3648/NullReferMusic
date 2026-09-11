-- tick/list/update/overview/run_now + 운영 데이터 정리 시드.

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
      v_sched.weekly_weekday, now()
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
    set next_run_at = v_next, updated_at = now()
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
  v_interval integer;
  v_enabled boolean;
  v_next timestamptz;
  v_weekday smallint;
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
      'schedule_kind', 'daily_time_kst', 'interval_minutes', 'weekly_weekday',
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
      when v_kind in ('daily', 'weekly', 'monthly') then coalesce(
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
    v_weekday := case
      when v_kind = 'weekly' then coalesce(
        (p_payload->>'weekly_weekday')::smallint,
        v_sched.weekly_weekday,
        0
      )
      else null
    end;
    v_next := coalesce(
      (p_payload->>'next_run_at')::timestamptz,
      public.nrm_system_schedule_compute_next_run(
        v_kind, v_daily, v_interval, v_weekday, now()
      )
    );

    update public.nrm_system_schedule set
      schedule_kind = v_kind,
      daily_time_kst = v_daily,
      interval_minutes = v_interval,
      weekly_weekday = v_weekday,
      is_enabled = v_enabled,
      next_run_at = v_next,
      config = jsonb_build_object('retention_days', v_days)
    where schedule_id = p_schedule_id;

    return p_schedule_id;
  end if;

  if v_sched.job_kind in ('musicbrainz_collection', 'ops_cleanup') then
    perform public.music_reject_unknown_keys(p_payload, array[
      'schedule_kind', 'daily_time_kst', 'interval_minutes', 'weekly_weekday',
      'next_run_at', 'is_enabled'
    ]);

    v_kind := coalesce(nullif(p_payload->>'schedule_kind', ''), v_sched.schedule_kind);
    v_daily := case
      when v_kind in ('daily', 'weekly', 'monthly') then coalesce(
        nullif(p_payload->>'daily_time_kst', '')::time,
        v_sched.daily_time_kst,
        time '00:00'
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
    v_weekday := case
      when v_kind = 'weekly' then coalesce(
        (p_payload->>'weekly_weekday')::smallint,
        v_sched.weekly_weekday,
        0
      )
      else null
    end;
    v_next := coalesce(
      (p_payload->>'next_run_at')::timestamptz,
      public.nrm_system_schedule_compute_next_run(
        v_kind, v_daily, v_interval, v_weekday, now()
      )
    );

    update public.nrm_system_schedule set
      schedule_kind = v_kind,
      daily_time_kst = v_daily,
      interval_minutes = v_interval,
      weekly_weekday = v_weekday,
      is_enabled = v_enabled,
      next_run_at = v_next
    where schedule_id = p_schedule_id;

    v_music_id := nullif(v_sched.config->>'music_schedule_id', '')::uuid;
    if v_sched.job_kind = 'musicbrainz_collection' and v_music_id is not null then
      update public.music_collection_schedule set
        schedule_kind = v_kind,
        daily_time_kst = v_daily,
        interval_minutes = v_interval,
        weekly_weekday = v_weekday,
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
  v_ok boolean;
begin
  if not public.nrm_is_admin_caller(p_caller_serial) then
    raise exception using errcode = '42501', message = 'admin required';
  end if;

  select * into v_sched
  from public.nrm_system_schedule
  where schedule_id = p_schedule_id
  for update;
  if not found then
    perform public.nrm_system_schedule_log_write(
      'rpc', 'system_run_now_missing', 'error',
      jsonb_build_object('schedule_id', p_schedule_id)
    );
    return false;
  end if;
  if not v_sched.is_enabled then
    perform public.nrm_system_schedule_log_write(
      'rpc', 'system_run_now_disabled', 'warn',
      '{}'::jsonb, v_sched.schedule_id, v_sched.schedule_key, null, null
    );
    return false;
  end if;

  if v_sched.job_kind = 'musicbrainz_collection' then
    v_music_id := nullif(v_sched.config->>'music_schedule_id', '')::uuid;
    if v_music_id is null then
      perform public.nrm_system_schedule_log_write(
        'rpc', 'system_run_now_missing_music_id', 'error',
        jsonb_build_object('config', v_sched.config),
        v_sched.schedule_id, v_sched.schedule_key, null, null
      );
      raise exception using
        errcode = '22023',
        message = 'music_schedule_id missing in config for ' || v_sched.schedule_key;
    end if;
    v_ok := public.music_rpc_admin_schedule_run_now(p_caller_serial, v_music_id);
    return v_ok;
  end if;

  if v_sched.job_kind in ('ailab_chat_retention', 'track_history_retention', 'ops_cleanup') then
    update public.nrm_system_schedule
    set next_run_at = now(), updated_at = now()
    where schedule_id = p_schedule_id;
    perform public.nrm_system_schedule_log_write(
      'rpc', 'system_run_now_retention', 'info',
      '{}'::jsonb, v_sched.schedule_id, v_sched.schedule_key, null, null
    );
    perform public.nrm_rpc_system_schedule_tick();
    return true;
  end if;

  perform public.nrm_system_schedule_log_write(
    'rpc', 'system_run_now_unsupported', 'error',
    jsonb_build_object('job_kind', v_sched.job_kind),
    v_sched.schedule_id, v_sched.schedule_key, null, null
  );
  return false;
exception
  when others then
    perform public.nrm_system_schedule_log_write(
      'rpc', 'system_run_now_exception', 'error',
      jsonb_build_object('schedule_id', p_schedule_id, 'sqlstate', sqlstate, 'message', sqlerrm)
    );
    raise;
end;
$$;
