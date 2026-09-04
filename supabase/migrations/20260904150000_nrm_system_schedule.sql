-- Common system schedule ledger: MusicBrainz collection + AI Lab chat retention.
-- Admin UI may only toggle/edit; DELETE of schedule rows is forbidden.
-- New schedules are registered only by migrations (seed), not by app create RPCs.

create table public.nrm_system_schedule (
  schedule_id uuid not null default extensions.gen_random_uuid(),
  schedule_key text not null,
  display_name text not null,
  job_kind text not null,
  is_enabled boolean not null default false,
  schedule_kind text not null,
  daily_time_kst time,
  interval_minutes integer,
  next_run_at timestamptz not null default now(),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pk_nrm_system_schedule primary key (schedule_id),
  constraint ux_nrm_system_schedule_key unique (schedule_key),
  constraint ck_nrm_system_schedule_names check (
    btrim(schedule_key) <> '' and btrim(display_name) <> ''
  ),
  constraint ck_nrm_system_schedule_job_kind check (
    job_kind in ('musicbrainz_collection', 'ailab_chat_retention')
  ),
  constraint ck_nrm_system_schedule_kind check (schedule_kind in ('daily', 'interval')),
  constraint ck_nrm_system_schedule_timing check (
    (schedule_kind = 'daily' and daily_time_kst is not null and interval_minutes is null)
    or (schedule_kind = 'interval' and daily_time_kst is null and interval_minutes between 5 and 10080)
  ),
  constraint ck_nrm_system_schedule_config check (jsonb_typeof(config) = 'object')
);

comment on table public.nrm_system_schedule is
  '공통 시스템 스케줄 원장. 관리 UI는 on/off·편집만 지원하며 행 삭제는 금지. 신규 등록은 마이그레이션 seed만.';

comment on column public.nrm_system_schedule.schedule_key is '고유 스케줄 키 (예: musicbrainz-k-pop-daily, ailab-chat-retention)';
comment on column public.nrm_system_schedule.job_kind is 'musicbrainz_collection | ailab_chat_retention';
comment on column public.nrm_system_schedule.config is
  'job_kind별 설정. musicbrainz: {music_schedule_id}. chat: {retention_days}';

create index ix_nrm_system_schedule_due
  on public.nrm_system_schedule (next_run_at)
  where is_enabled;

create trigger trg_nrm_system_schedule_updated_at
  before update on public.nrm_system_schedule
  for each row execute function public.music_set_updated_at();

-- Forbid DELETE on system and music collection schedules (admin may only disable/edit).
create or replace function public.nrm_forbid_schedule_row_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = '42501',
    message = format(
      'schedule row delete is forbidden for %I.%I; disable or edit instead',
      tg_table_schema,
      tg_table_name
    );
end;
$$;

create trigger trg_nrm_system_schedule_forbid_delete
  before delete on public.nrm_system_schedule
  for each row execute function public.nrm_forbid_schedule_row_delete();

create trigger trg_music_collection_schedule_forbid_delete
  before delete on public.music_collection_schedule
  for each row execute function public.nrm_forbid_schedule_row_delete();

alter table public.nrm_system_schedule enable row level security;

create policy nrm_system_schedule_select_admin_tables
  on public.nrm_system_schedule
  for select
  to anon, authenticated
  using (true);

revoke insert, update, delete on table public.nrm_system_schedule from anon, authenticated;
grant select on table public.nrm_system_schedule to anon, authenticated;

-- Seed from existing MusicBrainz collection schedules + AI Lab chat retention.
insert into public.nrm_system_schedule (
  schedule_key, display_name, job_kind, is_enabled, schedule_kind,
  daily_time_kst, interval_minutes, next_run_at, config
)
select
  m.schedule_key,
  m.display_name,
  'musicbrainz_collection',
  m.is_enabled,
  m.schedule_kind,
  m.daily_time_kst,
  m.interval_minutes,
  m.next_run_at,
  jsonb_build_object('music_schedule_id', m.schedule_id)
from public.music_collection_schedule m
where m.schedule_key in (
  'musicbrainz-k-pop-daily',
  'musicbrainz-korean-hip-hop-daily',
  'musicbrainz-global-chart-daily'
)
on conflict (schedule_key) do update set
  display_name = excluded.display_name,
  is_enabled = excluded.is_enabled,
  schedule_kind = excluded.schedule_kind,
  daily_time_kst = excluded.daily_time_kst,
  interval_minutes = excluded.interval_minutes,
  next_run_at = excluded.next_run_at,
  config = excluded.config;

insert into public.nrm_system_schedule (
  schedule_key, display_name, job_kind, is_enabled, schedule_kind,
  daily_time_kst, interval_minutes, next_run_at, config
)
values (
  'ailab-chat-retention',
  'AI Lab 채팅 자동 삭제',
  'ailab_chat_retention',
  true,
  'daily',
  time '03:00',
  null,
  case
    when (now() at time zone 'Asia/Seoul')::time < time '03:00'
      then (((now() at time zone 'Asia/Seoul')::date + time '03:00') at time zone 'Asia/Seoul')
    else ((((now() at time zone 'Asia/Seoul')::date + 1) + time '03:00') at time zone 'Asia/Seoul')
  end,
  jsonb_build_object('retention_days', 30)
)
on conflict (schedule_key) do update set
  display_name = excluded.display_name,
  job_kind = excluded.job_kind,
  schedule_kind = excluded.schedule_kind,
  daily_time_kst = coalesce(nrm_system_schedule.daily_time_kst, excluded.daily_time_kst),
  config = case
    when coalesce((nrm_system_schedule.config->>'retention_days')::integer, 0) between 1 and 3650
      then nrm_system_schedule.config
    else excluded.config
  end;

create or replace function public.nrm_system_schedule_next_daily_run(
  p_time_kst time,
  p_from timestamptz default now()
)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case
    when (p_from at time zone 'Asia/Seoul')::time < p_time_kst
      then (((p_from at time zone 'Asia/Seoul')::date + p_time_kst) at time zone 'Asia/Seoul')
    else ((((p_from at time zone 'Asia/Seoul')::date + 1) + p_time_kst) at time zone 'Asia/Seoul')
  end;
$$;

create or replace function public.nrm_rpc_ailab_chat_retention_run(
  p_batch_size integer default 500
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
  v_batch integer := greatest(1, least(coalesce(p_batch_size, 500), 2000));
  v_session_ids bigint[];
  v_msg_count integer := 0;
  v_sess_count integer := 0;
begin
  select * into v_sched
  from public.nrm_system_schedule
  where schedule_key = 'ailab-chat-retention'
  for update;

  if not found then
    return jsonb_build_object(
      'ran', false,
      'reason', 'missing_schedule',
      'deleted_sessions', 0,
      'deleted_messages', 0
    );
  end if;

  if not v_sched.is_enabled then
    return jsonb_build_object(
      'ran', false,
      'reason', 'disabled',
      'deleted_sessions', 0,
      'deleted_messages', 0
    );
  end if;

  v_days := coalesce((v_sched.config->>'retention_days')::integer, 0);
  if v_days < 1 or v_days > 3650 then
    raise exception using
      errcode = '22023',
      message = 'ailab-chat-retention retention_days must be between 1 and 3650';
  end if;

  v_cutoff := now() - make_interval(days => v_days);

  select coalesce(array_agg(s."SessionID"), '{}'::bigint[])
  into v_session_ids
  from (
    select cs."SessionID"
    from public."ChatSession" cs
    where cs."UpdateDate" < v_cutoff
    order by cs."UpdateDate" asc
    limit v_batch
  ) s;

  if coalesce(cardinality(v_session_ids), 0) = 0 then
    return jsonb_build_object(
      'ran', true,
      'reason', 'nothing_to_delete',
      'retention_days', v_days,
      'cutoff', v_cutoff,
      'deleted_sessions', 0,
      'deleted_messages', 0
    );
  end if;

  delete from public."ChatMessage" cm
  where cm."SessionID" = any (v_session_ids);
  get diagnostics v_msg_count = row_count;

  delete from public."ChatSession" cs
  where cs."SessionID" = any (v_session_ids);
  get diagnostics v_sess_count = row_count;

  return jsonb_build_object(
    'ran', true,
    'reason', 'ok',
    'retention_days', v_days,
    'cutoff', v_cutoff,
    'deleted_sessions', v_sess_count,
    'deleted_messages', v_msg_count,
    'batch_size', v_batch
  );
end;
$$;

comment on function public.nrm_rpc_ailab_chat_retention_run(integer) is
  'AI Lab: UpdateDate가 retention_days보다 오래된 ChatMessage+ChatSession 물리 삭제. 시스템 스케줄 활성 시에만 동작.';

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
      and job_kind = 'ailab_chat_retention'
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

    v_run := public.nrm_rpc_ailab_chat_retention_run(500);
    v_result := v_result || jsonb_build_array(
      jsonb_build_object(
        'schedule_key', v_sched.schedule_key,
        'next_run_at', v_next,
        'result', v_run
      )
    );
  end loop;

  return jsonb_build_object('processed', v_result);
end;
$$;

comment on function public.nrm_rpc_system_schedule_tick() is
  'due된 ailab_chat_retention 시스템 스케줄을 실행하고 next_run_at을 갱신. pg_cron에서 호출.';

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
            when s.job_kind = 'ailab_chat_retention'
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
          else 9000
        end,
        s.schedule_key
      limit v_limit offset v_offset
    ) q
  ), '[]'::jsonb);
end;
$$;

create or replace function public.nrm_rpc_system_schedule_set_enabled(
  p_caller_serial text,
  p_schedule_id uuid,
  p_enabled boolean
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
  if not found then
    return false;
  end if;

  update public.nrm_system_schedule
  set is_enabled = p_enabled
  where schedule_id = p_schedule_id;

  if v_sched.job_kind = 'musicbrainz_collection' then
    v_music_id := nullif(v_sched.config->>'music_schedule_id', '')::uuid;
    if v_music_id is not null then
      update public.music_collection_schedule
      set is_enabled = p_enabled,
          last_disabled_reason = case when p_enabled then null else 'admin' end
      where schedule_id = v_music_id;
    end if;
  end if;

  return true;
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

  if v_sched.job_kind = 'ailab_chat_retention' then
    perform public.music_reject_unknown_keys(p_payload, array[
      'display_name', 'schedule_kind', 'daily_time_kst', 'interval_minutes',
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
        1440
      )
      else null
    end;
    v_enabled := coalesce((p_payload->>'is_enabled')::boolean, v_sched.is_enabled);
    v_next := coalesce(
      (p_payload->>'next_run_at')::timestamptz,
      case
        when v_kind = 'daily' then public.nrm_system_schedule_next_daily_run(v_daily, now())
        else now() + make_interval(mins => v_interval)
      end
    );

    update public.nrm_system_schedule set
      display_name = coalesce(nullif(btrim(p_payload->>'display_name'), ''), display_name),
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
      'display_name', 'schedule_kind', 'daily_time_kst', 'interval_minutes',
      'next_run_at', 'is_enabled', 'date_from_offset_days', 'date_to_offset_days',
      'country_codes', 'primary_types', 'secondary_types', 'release_statuses',
      'max_artist_count', 'max_request_count', 'max_new_recording_count', 'priority'
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
    v_next := coalesce(
      (p_payload->>'next_run_at')::timestamptz,
      case
        when v_kind = 'daily' then public.nrm_system_schedule_next_daily_run(v_daily, now())
        else now() + make_interval(mins => v_interval)
      end
    );

    -- Update linked music schedule (update-only path). schedule_key is immutable here.
    perform public.music_rpc_admin_schedule_upsert(
      p_caller_serial,
      v_music_id,
      jsonb_strip_nulls(jsonb_build_object(
        'schedule_key', (select schedule_key from public.music_collection_schedule where schedule_id = v_music_id),
        'display_name', coalesce(nullif(btrim(p_payload->>'display_name'), ''), v_sched.display_name),
        'schedule_kind', v_kind,
        'daily_time_kst', case when v_kind = 'daily' then v_daily::text else null end,
        'interval_minutes', v_interval,
        'next_run_at', v_next,
        'is_enabled', coalesce(p_payload->'is_enabled', to_jsonb(v_sched.is_enabled)),
        'date_from_offset_days', p_payload->'date_from_offset_days',
        'date_to_offset_days', p_payload->'date_to_offset_days',
        'country_codes', p_payload->'country_codes',
        'primary_types', p_payload->'primary_types',
        'secondary_types', p_payload->'secondary_types',
        'release_statuses', p_payload->'release_statuses',
        'max_artist_count', p_payload->'max_artist_count',
        'max_request_count', p_payload->'max_request_count',
        'max_new_recording_count', p_payload->'max_new_recording_count',
        'priority', p_payload->'priority'
      ))
    );

    update public.nrm_system_schedule s set
      display_name = m.display_name,
      is_enabled = m.is_enabled,
      schedule_kind = m.schedule_kind,
      daily_time_kst = m.daily_time_kst,
      interval_minutes = m.interval_minutes,
      next_run_at = m.next_run_at
    from public.music_collection_schedule m
    where s.schedule_id = p_schedule_id
      and m.schedule_id = v_music_id;

    return p_schedule_id;
  end if;

  raise exception using errcode = '22023', message = 'unsupported job_kind';
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

  if v_sched.job_kind = 'ailab_chat_retention' then
    update public.nrm_system_schedule
    set next_run_at = now()
    where schedule_id = p_schedule_id;
    perform public.nrm_rpc_system_schedule_tick();
    return true;
  end if;

  return false;
end;
$$;

-- Harden music admin upsert: existing schedule_id required (no app-side create).
create or replace function public.music_rpc_admin_schedule_upsert(
  p_caller_serial text, p_schedule_id uuid, p_payload jsonb
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := p_schedule_id;
  v_existing public.music_collection_schedule%rowtype;
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
    'next_run_at','is_enabled','date_from_offset_days','date_to_offset_days',
    'country_codes','primary_types','secondary_types','release_statuses',
    'max_artist_count','max_request_count','max_new_recording_count','priority'
  ]);

  -- schedule_key is immutable after seed registration.
  if p_payload ? 'schedule_key'
     and nullif(btrim(p_payload->>'schedule_key'), '') is distinct from v_existing.schedule_key then
    raise exception using
      errcode = '22023',
      message = 'schedule_key is immutable';
  end if;

  update public.music_collection_schedule set
    display_name = coalesce(nullif(btrim(p_payload->>'display_name'), ''), display_name),
    schedule_kind = coalesce(nullif(p_payload->>'schedule_kind', ''), schedule_kind),
    daily_time_kst = case
      when coalesce(nullif(p_payload->>'schedule_kind', ''), schedule_kind) = 'daily'
        then coalesce(nullif(p_payload->>'daily_time_kst', '')::time, daily_time_kst)
      else null
    end,
    interval_minutes = case
      when coalesce(nullif(p_payload->>'schedule_kind', ''), schedule_kind) = 'interval'
        then coalesce((p_payload->>'interval_minutes')::integer, interval_minutes)
      else null
    end,
    next_run_at = coalesce((p_payload->>'next_run_at')::timestamptz, next_run_at),
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

  -- Keep linked system schedule timing/enabled in sync when present.
  update public.nrm_system_schedule s set
    display_name = m.display_name,
    is_enabled = m.is_enabled,
    schedule_kind = m.schedule_kind,
    daily_time_kst = m.daily_time_kst,
    interval_minutes = m.interval_minutes,
    next_run_at = m.next_run_at
  from public.music_collection_schedule m
  where m.schedule_id = v_id
    and s.job_kind = 'musicbrainz_collection'
    and (s.config->>'music_schedule_id')::uuid = v_id;

  return v_id;
end;
$$;

-- Also sync system ledger when music set_enabled is used directly.
create or replace function public.music_rpc_admin_schedule_set_enabled(
  p_caller_serial text, p_schedule_id uuid, p_enabled boolean
)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
  if not public.nrm_is_admin_caller(p_caller_serial) then
    raise exception using errcode = '42501', message = 'admin required';
  end if;
  update public.music_collection_schedule set is_enabled = p_enabled,
    last_disabled_reason = case when p_enabled then null else 'admin' end
  where schedule_id = p_schedule_id;
  if not found then
    return false;
  end if;
  update public.nrm_system_schedule
  set is_enabled = p_enabled
  where job_kind = 'musicbrainz_collection'
    and (config->>'music_schedule_id')::uuid = p_schedule_id;
  return true;
end;
$$;

grant execute on function public.nrm_system_schedule_next_daily_run(time, timestamptz) to postgres;
grant execute on function public.nrm_rpc_ailab_chat_retention_run(integer) to postgres, service_role;
grant execute on function public.nrm_rpc_system_schedule_tick() to postgres, service_role;
grant execute on function public.nrm_rpc_system_schedule_list(text, integer, integer) to anon, authenticated;
grant execute on function public.nrm_rpc_system_schedule_set_enabled(text, uuid, boolean) to anon, authenticated;
grant execute on function public.nrm_rpc_system_schedule_update(text, uuid, jsonb) to anon, authenticated;
grant execute on function public.nrm_rpc_system_schedule_run_now(text, uuid) to anon, authenticated;

revoke all on function public.nrm_forbid_schedule_row_delete() from public, anon, authenticated;
revoke all on function public.nrm_rpc_ailab_chat_retention_run(integer) from public, anon, authenticated;
revoke all on function public.nrm_rpc_system_schedule_tick() from public, anon, authenticated;

comment on function public.nrm_rpc_system_schedule_list(text, integer, integer) is
  '관리자: 공통 시스템 스케줄 목록 (music 상세·retention_days 포함)';
comment on function public.nrm_rpc_system_schedule_set_enabled(text, uuid, boolean) is
  '관리자: 시스템 스케줄 on/off (musicbrainz면 linked music_collection_schedule도 동기화)';
comment on function public.nrm_rpc_system_schedule_update(text, uuid, jsonb) is
  '관리자: 기존 시스템 스케줄 편집만 허용. 신규 생성·삭제는 불가.';
comment on function public.nrm_rpc_system_schedule_run_now(text, uuid) is
  '관리자: 활성 시스템 스케줄 즉시 실행 예약';
comment on function public.music_rpc_admin_schedule_upsert(text, uuid, jsonb) is
  '관리자: 기존 MusicBrainz 수집 스케줄 수정만 허용. schedule_id 필수, schedule_key 불변.';

-- Minute tick for due AI Lab chat retention (and future non-music system jobs).
create extension if not exists pg_cron;

do $$
declare v_job_id bigint;
begin
  for v_job_id in
    select jobid from cron.job where jobname = 'nrm-system-schedule-tick'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end
$$;

select cron.schedule(
  'nrm-system-schedule-tick',
  '* * * * *',
  $cron$
  select public.nrm_rpc_system_schedule_tick();
  $cron$
);
