-- nrm_music_rpc_owner가 nrm_system_schedule을 읽/쓰지 못해
-- claim_due·즉시 실행이 42501로 매분 실패하고 due 큐가 쌓이던 것을 고친다.

grant usage, create on schema public to nrm_music_rpc_owner;

grant select, update on table public.nrm_system_schedule to nrm_music_rpc_owner;

drop policy if exists pl_nrm_system_schedule_music_rpc_owner on public.nrm_system_schedule;
create policy pl_nrm_system_schedule_music_rpc_owner
  on public.nrm_system_schedule
  for all to nrm_music_rpc_owner
  using (true) with check (true);

grant execute on function public.music_collection_pool_job_kind(text)
  to nrm_music_rpc_owner, service_role;
grant execute on function public.music_collection_enqueue_pool_job(uuid, uuid, text, integer, text)
  to nrm_music_rpc_owner, service_role;

create or replace function public.music_rpc_sync_system_schedule_next_run(
  p_music_schedule_id uuid,
  p_next_run_at timestamptz
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
    and s.lastfm_method is not null
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

  perform public.music_rpc_sync_system_schedule_next_run(
    v_schedule.schedule_id, v_schedule.next_run_at
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
  if v_schedule.lastfm_method is null then
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

  perform public.music_rpc_sync_system_schedule_next_run(
    p_schedule_id, v_schedule.next_run_at
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

grant usage, create on schema public to nrm_music_rpc_owner;

revoke all on function public.music_rpc_sync_system_schedule_next_run(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.music_rpc_sync_system_schedule_next_run(uuid, timestamptz)
  to nrm_music_rpc_owner, service_role, postgres;

revoke all on function public.music_rpc_claim_due_schedules(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.music_rpc_claim_due_schedules(uuid, integer, integer)
  to service_role;

revoke all on function public.music_rpc_admin_schedule_run_now(text, uuid)
  from public, anon, authenticated;
grant execute on function public.music_rpc_admin_schedule_run_now(text, uuid)
  to anon, authenticated, service_role;

-- 실행 탭에 남아 있던 due 대기열은 오늘 슬롯을 건너뛰고 다음 정기 시각으로 보낸다.
with due as (
  select schedule_id, schedule_key, schedule_kind, daily_time_kst, interval_minutes
  from public.music_collection_schedule
  where is_enabled
    and lastfm_method is not null
    and next_run_at <= now()
)
update public.music_collection_schedule ms
set next_run_at = case
      when ms.schedule_kind = 'interval'
        then now() + pg_catalog.make_interval(mins => ms.interval_minutes)
      else public.nrm_system_schedule_next_daily_run(ms.daily_time_kst, now())
    end,
    claimed_until = null,
    claim_fence_token = null,
    claimed_by = null,
    updated_at = now()
from due
where ms.schedule_id = due.schedule_id;

update public.nrm_system_schedule ns
set next_run_at = ms.next_run_at,
    updated_at = now()
from public.music_collection_schedule ms
where ns.job_kind = 'musicbrainz_collection'
  and nullif(ns.config->>'music_schedule_id', '')::uuid = ms.schedule_id;

select public.nrm_system_schedule_log_write(
  'rpc', 'due_queue_cleared', 'info',
  jsonb_build_object(
    'due_after', (
      select count(*)::integer
      from public.music_collection_schedule
      where is_enabled and lastfm_method is not null and next_run_at <= now()
    )
  )
);
