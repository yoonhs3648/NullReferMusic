-- 실행/실패 탭에 ops_cleanup을 포함하고 시드한다.

-- 실행 탭 due 큐에 태그 갱신 스케줄을 포함한다.

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

  perform public.music_rpc_recover_stale_collection();
  v_run_limit := least(p_limit, 200);

  with unified as (
    select
      r.run_status,
      r.started_at,
      to_jsonb(r) || jsonb_build_object(
        'job_kind', 'musicbrainz_collection',
        'result', null,
        'display_name', coalesce(ns.display_name, ms.display_name),
        'schedule_key', coalesce(ns.schedule_key, ms.schedule_key)
      ) as row
    from public.music_schedule_run r
    left join public.music_collection_schedule ms
      on ms.schedule_id = r.schedule_id
    left join public.nrm_system_schedule ns
      on ns.job_kind = 'musicbrainz_collection'
     and nullif(ns.config->>'music_schedule_id', '')::uuid = r.schedule_id
    union all
    select
      sr.run_status,
      sr.started_at,
      jsonb_build_object(
        'schedule_run_id', sr.system_run_id,
        'schedule_id', sr.schedule_id,
        'request_key', sr.job_kind,
        'run_status', sr.run_status,
        'fence_token', '00000000-0000-0000-0000-000000000000',
        'worker_id', '00000000-0000-0000-0000-000000000000',
        'lease_until', coalesce(sr.finished_at, sr.started_at),
        'date_from', (sr.started_at at time zone 'Asia/Seoul')::date,
        'date_to', (sr.started_at at time zone 'Asia/Seoul')::date,
        'request_count', 0,
        'discovered_count', 0,
        'inserted_count', coalesce(
          nullif(sr.result->>'deleted_sessions', '')::integer,
          nullif(sr.result->>'deleted_rows', '')::integer,
          0
        ),
        'updated_count', coalesce(nullif(sr.result->>'deleted_messages', '')::integer, 0),
        'duplicate_count', coalesce(nullif(sr.result->>'deleted_token_history', '')::integer, 0),
        'failure_count', case when sr.run_status in ('failed', 'partial') then 1 else 0 end,
        'capacity_before_bytes', null,
        'capacity_after_bytes', null,
        'started_at', sr.started_at,
        'finished_at', sr.finished_at,
        'error_message', sr.error_message,
        'job_kind', sr.job_kind,
        'result', sr.result,
        'display_name', ns.display_name,
        'schedule_key', ns.schedule_key
      ) as row
    from public.nrm_system_schedule_run sr
    left join public.nrm_system_schedule ns
      on ns.schedule_id = sr.schedule_id
    where sr.job_kind in ('ailab_chat_retention', 'track_history_retention', 'ops_cleanup')
  ),
  due_rows as (
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
      and (s.lastfm_method is not null or s.collection_mode = 'tag_refresh')
      and s.next_run_at <= now()
      and not exists (
        select 1
        from public.music_schedule_run r
        where r.schedule_id = s.schedule_id
          and r.run_status = 'running'
      )
    union all
    select
      ns.schedule_id,
      ns.schedule_key,
      ns.display_name,
      1000,
      ns.next_run_at,
      ns.is_enabled,
      'waiting'::text
    from public.nrm_system_schedule ns
    where ns.is_enabled
      and ns.job_kind in ('ailab_chat_retention', 'track_history_retention', 'ops_cleanup')
      and ns.next_run_at <= now()
      and not exists (
        select 1
        from public.nrm_system_schedule_run r
        where r.schedule_id = ns.schedule_id
          and r.run_status = 'running'
      )
  )
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
        select jsonb_agg(to_jsonb(d) order by d.priority, d.next_run_at)
        from (
          select * from due_rows
          order by priority, next_run_at
          limit 50
        ) d
      ), '[]'::jsonb),
      'open_jobs', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.display_name)
        from (
          select
            j.schedule_id,
            coalesce(ns.display_name, ms.display_name, '수집 작업') as display_name,
            count(*)::integer as job_count
          from public.music_sync_job j
          left join public.music_collection_schedule ms
            on ms.schedule_id = j.schedule_id
          left join public.nrm_system_schedule ns
            on ns.job_kind = 'musicbrainz_collection'
           and nullif(ns.config->>'music_schedule_id', '')::uuid = j.schedule_id
          where j.job_status in ('pending', 'retry', 'processing')
          group by j.schedule_id, coalesce(ns.display_name, ms.display_name, '수집 작업')
        ) x
      ), '[]'::jsonb)
    ),
    'running_runs', coalesce((
      select jsonb_agg(u.row order by u.started_at desc)
      from (
        select started_at, row
        from unified
        where run_status = 'running'
        order by started_at desc
        limit 100
      ) u
    ), '[]'::jsonb),
    'completed_runs', coalesce((
      select jsonb_agg(u.row order by u.started_at desc)
      from (
        select started_at, row
        from unified
        where run_status = 'completed'
        order by started_at desc
        limit v_run_limit
      ) u
    ), '[]'::jsonb),
    'failure_runs', coalesce((
      select jsonb_agg(u.row order by u.started_at desc)
      from (
        select started_at, row
        from unified
        where run_status in ('partial', 'failed', 'cancelled')
        order by started_at desc
        limit v_run_limit
      ) u
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


create or replace function public.music_rpc_recover_stale_collection()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_finalized integer := 0;
  v_cleared integer := 0;
  v_pruned integer := 0;
begin
  update public.music_schedule_run r
  set run_status = case when r.failure_count > 0 then 'partial' else 'completed' end,
      finished_at = coalesce(r.finished_at, now()),
      capacity_after_bytes = coalesce(
        r.capacity_after_bytes,
        pg_catalog.pg_database_size(pg_catalog.current_database())
      )
  where r.run_status = 'running'
    and not exists (
      select 1
      from public.music_sync_job j
      where j.schedule_run_id = r.schedule_run_id
        and j.job_status in ('pending', 'processing', 'retry')
    );
  get diagnostics v_finalized = row_count;

  update public.music_collection_schedule s
  set claimed_until = null,
      claim_fence_token = null,
      claimed_by = null
  where (s.claimed_until is not null and s.claimed_until < now())
     or exists (
       select 1
       from public.music_schedule_run r
       where r.schedule_id = s.schedule_id
         and r.fence_token is not distinct from s.claim_fence_token
         and r.run_status <> 'running'
     );
  get diagnostics v_cleared = row_count;

  delete from public.nrm_system_schedule_log
  where created_at < now() - interval '1 month'
     or log_id in (
       select log_id
       from public.nrm_system_schedule_log
       order by created_at desc
       offset 4000
     );
  get diagnostics v_pruned = row_count;

  if v_finalized > 0 or v_cleared > 0 then
    perform public.nrm_system_schedule_log_write(
      'rpc', 'recover_stale', 'info',
      jsonb_build_object(
        'finalized_runs', v_finalized,
        'cleared_leases', v_cleared,
        'pruned_logs', v_pruned
      )
    );
  end if;

  return jsonb_build_object(
    'finalized_runs', v_finalized,
    'cleared_leases', v_cleared,
    'pruned_logs', v_pruned,
    'collection_busy', public.music_collection_is_busy()
  );
end;
$$;

alter function public.nrm_rpc_system_schedule_tick() owner to postgres;
alter function public.nrm_rpc_system_schedule_list(text, integer, integer)
  owner to nrm_music_rpc_owner;
alter function public.nrm_rpc_system_schedule_update(text, uuid, jsonb)
  owner to nrm_music_rpc_owner;
alter function public.nrm_rpc_system_schedule_run_now(text, uuid)
  owner to nrm_music_rpc_owner;
alter function public.music_rpc_recover_stale_collection()
  owner to nrm_music_rpc_owner;

revoke all on function public.nrm_rpc_system_schedule_tick() from public, anon, authenticated;
grant execute on function public.nrm_rpc_system_schedule_tick()
  to postgres, service_role, nrm_music_rpc_owner;
grant execute on function public.nrm_rpc_system_schedule_list(text, integer, integer)
  to anon, authenticated, service_role;
grant execute on function public.nrm_rpc_system_schedule_update(text, uuid, jsonb)
  to anon, authenticated, service_role;
revoke all on function public.nrm_rpc_system_schedule_run_now(text, uuid)
  from public, anon, authenticated;
grant execute on function public.nrm_rpc_system_schedule_run_now(text, uuid)
  to anon, authenticated, service_role;
grant execute on function public.music_rpc_recover_stale_collection()
  to service_role, nrm_music_rpc_owner, postgres;

insert into public.nrm_system_schedule(
  schedule_key, display_name, job_kind, is_enabled, schedule_kind,
  daily_time_kst, interval_minutes, weekly_weekday, next_run_at, config
)
values (
  'ops-monthly-cleanup',
  '운영 데이터 정리',
  'ops_cleanup',
  true,
  'monthly',
  time '00:00',
  null,
  null,
  public.nrm_system_schedule_next_monthly_run(time '00:00', now()),
  '{}'::jsonb
)
on conflict (schedule_key) do update set
  display_name = excluded.display_name,
  job_kind = excluded.job_kind,
  is_enabled = excluded.is_enabled,
  schedule_kind = excluded.schedule_kind,
  daily_time_kst = excluded.daily_time_kst,
  interval_minutes = excluded.interval_minutes,
  weekly_weekday = excluded.weekly_weekday,
  next_run_at = excluded.next_run_at,
  updated_at = now();
