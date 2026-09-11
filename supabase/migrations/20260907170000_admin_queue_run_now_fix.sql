-- Fix run_now: sync system↔music next_run_at, start run immediately when idle.
-- Admin overview: expose live queue snapshot for 실행 tab.

grant usage, create on schema public to nrm_music_rpc_owner;

-- Repair desynced next_run_at (system was left in the past after music claims).
update public.nrm_system_schedule ns
set next_run_at = m.next_run_at,
    updated_at = now()
from public.music_collection_schedule m
where ns.job_kind = 'musicbrainz_collection'
  and nullif(ns.config->>'music_schedule_id', '')::uuid = m.schedule_id
  and ns.next_run_at is distinct from m.next_run_at;

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
begin
  if not public.nrm_is_admin_caller(p_caller_serial) then
    raise exception using errcode = '42501', message = 'admin required';
  end if;

  select * into v_schedule
  from public.music_collection_schedule
  where schedule_id = p_schedule_id
  for update;
  if not found or not v_schedule.is_enabled then
    return false;
  end if;

  v_busy := public.music_collection_is_busy();

  -- Mark due on both ledgers so UI and worker see the same queue.
  update public.music_collection_schedule
  set next_run_at = now(),
      claimed_until = case when v_busy then claimed_until else null end,
      claim_fence_token = case when v_busy then claim_fence_token else null end,
      claimed_by = case when v_busy then claimed_by else null end
  where schedule_id = p_schedule_id;

  update public.nrm_system_schedule
  set next_run_at = now(),
      updated_at = now()
  where job_kind = 'musicbrainz_collection'
    and nullif(config->>'music_schedule_id', '')::uuid = p_schedule_id;

  -- If another collection is open, stay queued as due-only.
  if v_busy then
    return true;
  end if;

  select * into v_policy
  from public.music_capacity_policy
  where policy_key = 'project1'
  for update;
  v_bytes := pg_catalog.pg_database_size(pg_catalog.current_database());
  if v_policy.is_enabled and v_bytes >= v_policy.disable_discovery_bytes then
    perform public.music_rpc_disable_schedulers_for_capacity(v_bytes);
    return true;
  end if;

  -- Idle → create schedule_run + first job immediately (do not wait for cron tick).
  v_run_id := extensions.gen_random_uuid();
  v_fence := extensions.gen_random_uuid();
  v_from := (now() at time zone 'Asia/Seoul')::date + v_schedule.date_from_offset_days;
  v_to := (now() at time zone 'Asia/Seoul')::date + v_schedule.date_to_offset_days;
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

  insert into public.music_sync_job(
    job_kind, entity_type, entity_id, idempotency_key, priority,
    schedule_id, schedule_run_id
  ) values (
    'lastfm_artist_pool', 'artist', v_schedule.schedule_id,
    'lastfm-pool:' || v_request_key, v_schedule.priority,
    v_schedule.schedule_id, v_run_id
  );

  update public.music_collection_schedule
  set claimed_until = now() + interval '3 minutes',
      claim_fence_token = v_fence,
      claimed_by = '00000000-0000-0000-0000-0000000000a1',
      next_run_at = case
        when schedule_kind = 'interval'
          then now() + pg_catalog.make_interval(mins => interval_minutes)
        else (
          ((now() at time zone 'Asia/Seoul')::date + 1 + daily_time_kst)
          at time zone 'Asia/Seoul'
        )
      end
  where schedule_id = p_schedule_id
  returning * into v_schedule;

  update public.nrm_system_schedule
  set next_run_at = v_schedule.next_run_at,
      updated_at = now()
  where job_kind = 'musicbrainz_collection'
    and nullif(config->>'music_schedule_id', '')::uuid = p_schedule_id;

  return true;
end;
$$;

alter function public.music_rpc_admin_schedule_run_now(text, uuid)
  owner to nrm_music_rpc_owner;
revoke all on function public.music_rpc_admin_schedule_run_now(text, uuid)
  from public, anon, authenticated;
grant execute on function public.music_rpc_admin_schedule_run_now(text, uuid)
  to anon, authenticated, service_role;

comment on function public.music_rpc_admin_schedule_run_now(text, uuid) is
  '즉시 실행: idle면 schedule_run+job을 바로 생성, busy면 due만 남김. system/music next_run_at 동기화';

-- Sync system next_run_at whenever worker claims a music schedule.
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
begin
  if p_worker_id is null
     or p_batch_size not between 1 and 20
     or p_lease_seconds not between 15 and 300 then
    raise exception using errcode = '22023', message = 'invalid schedule claim parameters';
  end if;

  if public.music_collection_is_busy() then
    return;
  end if;

  select * into v_policy
  from public.music_capacity_policy
  where policy_key = 'project1'
  for update;
  v_bytes := pg_catalog.pg_database_size(pg_catalog.current_database());
  if v_policy.is_enabled and v_bytes >= v_policy.disable_discovery_bytes then
    perform public.music_rpc_disable_schedulers_for_capacity(v_bytes);
    return;
  end if;

  for v_schedule in
    select s.*
    from public.music_collection_schedule s
    where s.is_enabled
      and s.lastfm_method is not null
      and s.next_run_at <= now()
      and (s.claimed_until is null or s.claimed_until < now())
    order by s.priority, s.next_run_at
    for update skip locked
    limit 1
  loop
    v_run_id := extensions.gen_random_uuid();
    v_fence := extensions.gen_random_uuid();
    v_from := (now() at time zone 'Asia/Seoul')::date + v_schedule.date_from_offset_days;
    v_to := (now() at time zone 'Asia/Seoul')::date + v_schedule.date_to_offset_days;
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
      continue;
    end if;

    update public.music_collection_schedule
    set claimed_until = now() + pg_catalog.make_interval(secs => p_lease_seconds),
        claim_fence_token = v_fence,
        claimed_by = p_worker_id,
        next_run_at = case
          when schedule_kind = 'interval'
            then now() + pg_catalog.make_interval(mins => interval_minutes)
          else (
            ((now() at time zone 'Asia/Seoul')::date + 1 + daily_time_kst)
            at time zone 'Asia/Seoul'
          )
        end
    where music_collection_schedule.schedule_id = v_schedule.schedule_id
    returning * into v_schedule;

    update public.nrm_system_schedule
    set next_run_at = v_schedule.next_run_at,
        updated_at = now()
    where job_kind = 'musicbrainz_collection'
      and nullif(config->>'music_schedule_id', '')::uuid = v_schedule.schedule_id;

    insert into public.music_sync_job(
      job_kind, entity_type, entity_id, idempotency_key, priority,
      schedule_id, schedule_run_id
    ) values (
      'lastfm_artist_pool', 'artist', v_schedule.schedule_id,
      'lastfm-pool:' || v_request_key, v_schedule.priority,
      v_schedule.schedule_id, v_run_id
    )
    on conflict (idempotency_key) do nothing;

    return query
      select v_run_id, v_schedule.schedule_id, v_fence, v_from, v_to,
             v_schedule.max_request_count;
  end loop;
end;
$$;

alter function public.music_rpc_claim_due_schedules(uuid, integer, integer)
  owner to nrm_music_rpc_owner;

create or replace function public.music_rpc_admin_overview(
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
  v_result jsonb;
  v_run_limit integer;
begin
  if not public.nrm_is_admin_caller(p_caller_serial) then
    raise exception using errcode = '42501', message = 'admin required';
  end if;
  if p_limit not between 1 and 200 or p_offset < 0 then
    raise exception using errcode = '22023', message = 'invalid pagination';
  end if;

  v_run_limit := least(p_limit, 50);

  select jsonb_build_object(
    'schedules', coalesce((
      select jsonb_agg(to_jsonb(x))
      from (
        select *
        from public.music_collection_schedule
        order by priority, schedule_key
        limit p_limit offset p_offset
      ) x
    ), '[]'::jsonb),
    'allowlist_count', (select count(*)::integer from public.music_artist_allowlist),
    'pending_jobs', (
      select count(*)::integer
      from public.music_sync_job
      where job_status in ('pending', 'retry', 'processing')
    ),
    'collection_busy', public.music_collection_is_busy(),
    'queue', jsonb_build_object(
      'due_schedules', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.priority, x.next_run_at)
        from (
          select
            s.schedule_id,
            s.schedule_key,
            s.display_name,
            s.priority,
            s.next_run_at,
            s.is_enabled,
            'waiting'::text as queue_state
          from public.music_collection_schedule s
          where s.is_enabled
            and s.lastfm_method is not null
            and s.next_run_at <= now()
            and not exists (
              select 1
              from public.music_schedule_run r
              where r.schedule_id = s.schedule_id
                and r.run_status = 'running'
            )
          order by s.priority, s.next_run_at
          limit 50
        ) x
      ), '[]'::jsonb),
      'open_jobs', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.job_kind, x.job_status)
        from (
          select j.job_kind, j.job_status, count(*)::integer as job_count
          from public.music_sync_job j
          where j.job_status in ('pending', 'retry', 'processing')
          group by j.job_kind, j.job_status
          order by j.job_kind, j.job_status
        ) x
      ), '[]'::jsonb)
    ),
    'running_runs', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.started_at desc)
      from (
        select *
        from public.music_schedule_run
        where run_status = 'running'
        order by started_at desc
        limit 100
      ) x
    ), '[]'::jsonb),
    'completed_runs', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.started_at desc)
      from (
        select *
        from public.music_schedule_run
        where run_status = 'completed'
        order by started_at desc
        limit v_run_limit
      ) x
    ), '[]'::jsonb),
    'failure_runs', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.started_at desc)
      from (
        select *
        from public.music_schedule_run
        where run_status in ('partial', 'failed', 'cancelled')
        order by started_at desc
        limit v_run_limit
      ) x
    ), '[]'::jsonb),
    'capacity', (
      select to_jsonb(x)
      from (
        select *
        from public.music_capacity_snapshot
        order by captured_at desc
        limit 1
      ) x
    )
  ) into v_result;

  return v_result;
end;
$$;

alter function public.music_rpc_admin_overview(text, integer, integer)
  owner to nrm_music_rpc_owner;
revoke all on function public.music_rpc_admin_overview(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.music_rpc_admin_overview(text, integer, integer)
  to anon, authenticated, service_role;

revoke create on schema public from nrm_music_rpc_owner;
