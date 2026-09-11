-- weekly tick/list/update + 태그 갱신 시드.

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
      and job_kind in ('ailab_chat_retention', 'track_history_retention')
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
      elsif v_sched.job_kind = 'track_history_retention' then
        v_run := public.nrm_rpc_track_history_retention_run(2000);
      else
        v_run := jsonb_build_object('ran', false, 'reason', 'unsupported_job_kind');
      end if;
      v_status := 'completed';
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
      case when v_status = 'completed' then 'retention_ran' else 'retention_failed' end,
      case when v_status = 'completed' then 'info' else 'error' end,
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
      when v_kind in ('daily', 'weekly') then coalesce(
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
    if v_kind = 'weekly' then
      v_daily := coalesce(
        nullif(p_payload->>'daily_time_kst', '')::time,
        v_sched.daily_time_kst,
        time '12:00'
      );
    end if;
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

  if v_sched.job_kind = 'musicbrainz_collection' then
    perform public.music_reject_unknown_keys(p_payload, array[
      'schedule_kind', 'daily_time_kst', 'interval_minutes', 'weekly_weekday',
      'next_run_at', 'is_enabled'
    ]);

    v_kind := coalesce(nullif(p_payload->>'schedule_kind', ''), v_sched.schedule_kind);
    v_daily := case
      when v_kind in ('daily', 'weekly') then coalesce(
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
    v_weekday := case
      when v_kind = 'weekly' then coalesce(
        (p_payload->>'weekly_weekday')::smallint,
        v_sched.weekly_weekday,
        0
      )
      else null
    end;
    if v_kind = 'weekly' then
      v_daily := coalesce(
        nullif(p_payload->>'daily_time_kst', '')::time,
        v_sched.daily_time_kst,
        time '12:00'
      );
    end if;
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
    if v_music_id is not null then
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


create or replace function public.music_rpc_admin_schedule_run_inserts(
  p_caller_serial text,
  p_schedule_run_id uuid,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.music_schedule_run%rowtype;
  v_end timestamptz;
  v_result jsonb;
begin
  if not public.nrm_is_admin_caller(p_caller_serial) then
    raise exception using errcode = '42501', message = 'admin required';
  end if;
  if p_schedule_run_id is null
     or p_limit not between 1 and 200
     or p_offset < 0 then
    raise exception using errcode = '22023', message = 'invalid schedule_run_id or pagination';
  end if;

  select * into v_run
  from public.music_schedule_run
  where schedule_run_id = p_schedule_run_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'schedule run not found';
  end if;
  v_end := coalesce(v_run.finished_at, now());

  with inserted as (
    select
      r.recording_id as item_id,
      r.artist_credit_name as artist,
      r.title,
      r.created_at
    from public.music_catalog_track_candidate c
    join public.music_recording r on r.recording_id = c.recording_id
    where c.schedule_run_id = p_schedule_run_id
      and c.candidate_status = 'applied'
      and c.recording_id is not null
    union
    select
      r.recording_id,
      r.artist_credit_name,
      r.title,
      r.created_at
    from public.music_release_candidate c
    join public.music_release_mbid rm
      on rm.mbid = coalesce(c.representative_release_mbid, c.release_mbid)
    join public.music_release rel
      on rel.release_id = rm.release_id
    join public.music_track t
      on t.release_id = rel.release_id
     and t.recording_id is not null
    join public.music_recording r
      on r.recording_id = t.recording_id
    where c.schedule_run_id = p_schedule_run_id
      and c.candidate_status = 'applied'
      and r.created_at >= v_run.started_at
      and r.created_at <= v_end
    union
    select
      u.upcoming_id,
      u.artist_credit_name,
      u.title,
      u.created_at
    from public.music_upcoming_release u
    where u.first_seen_schedule_run_id = p_schedule_run_id
    union
    select
      r.recording_id,
      r.artist_credit_name,
      r.title,
      coalesce(j.completed_at, j.created_at)
    from public.music_sync_job j
    join public.music_recording r on r.recording_id = j.entity_id
    join public.music_schedule_run sr on sr.schedule_run_id = j.schedule_run_id
    join public.music_collection_schedule s on s.schedule_id = sr.schedule_id
    where j.schedule_run_id = p_schedule_run_id
      and j.job_kind = 'lastfm_tags'
      and j.job_status = 'completed'
      and s.collection_mode = 'tag_refresh'
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc, x.recording_id)
      from (
        select i.item_id as recording_id, i.artist, i.title, i.created_at
        from inserted i
        order by i.created_at desc, i.item_id
        limit p_limit offset p_offset
      ) x
    ), '[]'::jsonb),
    'total', (select count(*)::integer from inserted)
  ) into v_result;
  return v_result;
end;
$$;


insert into public.music_collection_schedule(
  schedule_key, display_name, schedule_kind, daily_time_kst, interval_minutes,
  weekly_weekday, next_run_at, is_enabled, date_from_offset_days, date_to_offset_days,
  release_statuses, max_artist_count, max_request_count, max_new_recording_count,
  priority, lastfm_method, lastfm_param, lastfm_limit, collection_mode
)
select
  'musicbrainz-lastfm-tag-refresh',
  'Last.fm 태그 갱신',
  'weekly',
  time '12:00',
  null,
  0,
  public.nrm_system_schedule_next_weekly_run(0::smallint, time '12:00', now()),
  true, 0, 0, array['Official']::text[], 1, 45, 1,
  90, null, null, 100, 'tag_refresh'
where not exists (
  select 1 from public.music_collection_schedule s
  where s.schedule_key = 'musicbrainz-lastfm-tag-refresh'
);

insert into public.nrm_system_schedule(
  schedule_key, display_name, job_kind, is_enabled, schedule_kind,
  daily_time_kst, interval_minutes, weekly_weekday, next_run_at, config
)
select
  ms.schedule_key, ms.display_name, 'musicbrainz_collection',
  ms.is_enabled, ms.schedule_kind, ms.daily_time_kst, ms.interval_minutes,
  ms.weekly_weekday, ms.next_run_at,
  pg_catalog.jsonb_build_object('music_schedule_id', ms.schedule_id)
from public.music_collection_schedule ms
where ms.schedule_key = 'musicbrainz-lastfm-tag-refresh'
on conflict (schedule_key) do update set
  display_name = excluded.display_name,
  job_kind = excluded.job_kind,
  is_enabled = excluded.is_enabled,
  schedule_kind = excluded.schedule_kind,
  daily_time_kst = excluded.daily_time_kst,
  interval_minutes = excluded.interval_minutes,
  weekly_weekday = excluded.weekly_weekday,
  next_run_at = excluded.next_run_at,
  config = excluded.config,
  updated_at = now();

alter function public.nrm_system_schedule_next_weekly_run(smallint, time, timestamptz)
  owner to nrm_music_rpc_owner;
alter function public.nrm_system_schedule_compute_next_run(text, time, integer, smallint, timestamptz)
  owner to nrm_music_rpc_owner;
alter function public.music_rpc_apply_lastfm_tag_refresh_page(uuid, uuid, integer)
  owner to nrm_music_rpc_owner;
alter function public.music_collection_enqueue_pool_job(uuid, uuid, text, integer, text)
  owner to nrm_music_rpc_owner;
alter function public.music_rpc_claim_mb_work(uuid, integer, integer)
  owner to nrm_music_rpc_owner;
alter function public.music_rpc_finalize_mb_runs(uuid)
  owner to nrm_music_rpc_owner;
alter function public.music_rpc_claim_due_schedules(uuid, integer, integer)
  owner to nrm_music_rpc_owner;
alter function public.music_rpc_admin_schedule_run_now(text, uuid)
  owner to nrm_music_rpc_owner;
alter function public.music_rpc_apply_lastfm_tags(uuid, uuid, jsonb)
  owner to nrm_music_rpc_owner;
alter function public.nrm_rpc_system_schedule_tick()
  owner to postgres;
alter function public.nrm_rpc_system_schedule_list(text, integer, integer)
  owner to nrm_music_rpc_owner;
alter function public.nrm_rpc_system_schedule_update(text, uuid, jsonb)
  owner to nrm_music_rpc_owner;
alter function public.music_rpc_admin_schedule_run_inserts(text, uuid, integer, integer)
  owner to nrm_music_rpc_owner;

revoke all on function public.music_rpc_apply_lastfm_tag_refresh_page(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.music_rpc_apply_lastfm_tag_refresh_page(uuid, uuid, integer)
  to service_role;
grant execute on function public.nrm_system_schedule_next_weekly_run(smallint, time, timestamptz)
  to nrm_music_rpc_owner, service_role, postgres;
grant execute on function public.nrm_system_schedule_compute_next_run(text, time, integer, smallint, timestamptz)
  to nrm_music_rpc_owner, service_role, postgres, anon, authenticated;
grant execute on function public.nrm_rpc_system_schedule_tick()
  to postgres, service_role, nrm_music_rpc_owner;
grant execute on function public.nrm_rpc_system_schedule_list(text, integer, integer)
  to anon, authenticated, service_role;
grant execute on function public.nrm_rpc_system_schedule_update(text, uuid, jsonb)
  to anon, authenticated, service_role;
grant execute on function public.music_rpc_admin_schedule_run_inserts(text, uuid, integer, integer)
  to anon, authenticated, service_role;
grant execute on function public.music_rpc_claim_mb_work(uuid, integer, integer)
  to service_role;
grant execute on function public.music_rpc_finalize_mb_runs(uuid)
  to service_role;
grant execute on function public.music_rpc_claim_due_schedules(uuid, integer, integer)
  to service_role;
grant execute on function public.music_rpc_admin_schedule_run_now(text, uuid)
  to anon, authenticated, service_role;
grant execute on function public.music_rpc_apply_lastfm_tags(uuid, uuid, jsonb)
  to service_role;
grant execute on function public.music_collection_enqueue_pool_job(uuid, uuid, text, integer, text)
  to nrm_music_rpc_owner, service_role;

comment on function public.music_rpc_apply_lastfm_tag_refresh_page(uuid, uuid, integer) is
  '활성 Recording을 페이지로 lastfm_tags 큐잉. 선별 태그는 apply_lastfm_tags가 upsert';
comment on function public.nrm_system_schedule_next_weekly_run(smallint, time, timestamptz) is
  'KST 기준 다음 요일·시각. 0=일요일';
