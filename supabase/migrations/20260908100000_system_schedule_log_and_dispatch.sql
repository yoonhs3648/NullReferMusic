-- System schedule durable logs, unified run history, stale recovery, and
-- immediate worker dispatch. Fixes idle queue / missing run records.

grant usage, create on schema public to nrm_music_rpc_owner;

-- ---------------------------------------------------------------------------
-- 1) Durable scheduler logs + unified run ledger
-- ---------------------------------------------------------------------------
create table public.nrm_system_schedule_log (
  log_id uuid not null default extensions.gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text not null,
  event text not null,
  level text not null default 'info',
  schedule_id uuid,
  schedule_key text,
  schedule_run_id uuid,
  job_id uuid,
  detail jsonb not null default '{}'::jsonb,
  constraint pk_nrm_system_schedule_log primary key (log_id),
  constraint ck_nrm_system_schedule_log_source check (
    source in ('rpc', 'cron', 'edge', 'pg_net', 'trigger')
  ),
  constraint ck_nrm_system_schedule_log_level check (
    level in ('debug', 'info', 'warn', 'error')
  ),
  constraint ck_nrm_system_schedule_log_event check (btrim(event) <> ''),
  constraint fk_nrm_system_schedule_log_schedule foreign key (schedule_id)
    references public.nrm_system_schedule(schedule_id) on delete set null
);

create index ix_nrm_system_schedule_log_created
  on public.nrm_system_schedule_log (created_at desc);
create index ix_nrm_system_schedule_log_event
  on public.nrm_system_schedule_log (event, created_at desc);

create table public.nrm_system_schedule_run (
  system_run_id uuid not null default extensions.gen_random_uuid(),
  schedule_id uuid not null,
  job_kind text not null,
  run_status text not null default 'running',
  music_schedule_run_id uuid,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error_message text,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pk_nrm_system_schedule_run primary key (system_run_id),
  constraint fk_nrm_system_schedule_run_schedule foreign key (schedule_id)
    references public.nrm_system_schedule(schedule_id) on delete restrict,
  constraint fk_nrm_system_schedule_run_music foreign key (music_schedule_run_id)
    references public.music_schedule_run(schedule_run_id) on delete set null,
  constraint ux_nrm_system_schedule_run_music unique (music_schedule_run_id),
  constraint ck_nrm_system_schedule_run_status check (
    run_status in ('running', 'completed', 'partial', 'failed', 'cancelled')
  ),
  constraint ck_nrm_system_schedule_run_kind check (
    job_kind in ('musicbrainz_collection', 'ailab_chat_retention', 'track_history_retention')
  )
);

create index ix_nrm_system_schedule_run_status
  on public.nrm_system_schedule_run (run_status, started_at desc);
create index ix_nrm_system_schedule_run_schedule
  on public.nrm_system_schedule_run (schedule_id, started_at desc);

alter table public.nrm_system_schedule_log enable row level security;
alter table public.nrm_system_schedule_run enable row level security;

create policy pl_nrm_system_schedule_log_owner
  on public.nrm_system_schedule_log
  for all to nrm_music_rpc_owner
  using (true) with check (true);
create policy pl_nrm_system_schedule_run_owner
  on public.nrm_system_schedule_run
  for all to nrm_music_rpc_owner
  using (true) with check (true);
create policy pl_nrm_system_schedule_log_postgres
  on public.nrm_system_schedule_log
  for all to postgres
  using (true) with check (true);
create policy pl_nrm_system_schedule_run_postgres
  on public.nrm_system_schedule_run
  for all to postgres
  using (true) with check (true);

grant select, insert, update, delete on table
  public.nrm_system_schedule_log, public.nrm_system_schedule_run
  to nrm_music_rpc_owner, postgres, service_role;
revoke all on table public.nrm_system_schedule_log, public.nrm_system_schedule_run
  from public, anon, authenticated;

comment on table public.nrm_system_schedule_log is
  '시스템 스케줄·Edge·Cron 진단 로그. 비밀값(토큰·API key) 금지.';
comment on table public.nrm_system_schedule_run is
  '시스템 스케줄 실행 이력(수집 + retention). 관리 UI 비노출. 수집 실행/실패 탭은 music_schedule_run.';

create or replace function public.nrm_system_schedule_log_write(
  p_source text,
  p_event text,
  p_level text default 'info',
  p_detail jsonb default '{}'::jsonb,
  p_schedule_id uuid default null,
  p_schedule_key text default null,
  p_schedule_run_id uuid default null,
  p_job_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_key text;
begin
  if p_source is null or p_event is null or btrim(p_event) = '' then
    return null;
  end if;
  v_key := nullif(btrim(coalesce(p_schedule_key, '')), '');
  if v_key is null and p_schedule_id is not null then
    select schedule_key into v_key
    from public.nrm_system_schedule
    where schedule_id = p_schedule_id;
  end if;
  insert into public.nrm_system_schedule_log(
    source, event, level, schedule_id, schedule_key,
    schedule_run_id, job_id, detail
  ) values (
    p_source,
    left(btrim(p_event), 80),
    case when p_level in ('debug', 'info', 'warn', 'error') then p_level else 'info' end,
    p_schedule_id,
    v_key,
    p_schedule_run_id,
    p_job_id,
    coalesce(p_detail, '{}'::jsonb)
  )
  returning log_id into v_id;
  raise log 'nrm-schedule source=% event=% level=% key=% run=% job=% detail=%',
    p_source,
    left(btrim(p_event), 80),
    case when p_level in ('debug', 'info', 'warn', 'error') then p_level else 'info' end,
    v_key,
    p_schedule_run_id,
    p_job_id,
    left(coalesce(p_detail, '{}'::jsonb)::text, 1500);
  return v_id;
exception
  when others then
    return null;
end;
$$;

alter function public.nrm_system_schedule_log_write(
  text, text, text, jsonb, uuid, text, uuid, uuid
) owner to nrm_music_rpc_owner;
grant execute on function public.nrm_system_schedule_log_write(
  text, text, text, jsonb, uuid, text, uuid, uuid
) to nrm_music_rpc_owner, postgres, service_role;

create or replace function public.nrm_rpc_system_schedule_log_append(
  p_source text,
  p_event text,
  p_level text default 'info',
  p_detail jsonb default '{}'::jsonb,
  p_schedule_id uuid default null,
  p_schedule_key text default null,
  p_schedule_run_id uuid default null,
  p_job_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_source not in ('edge', 'cron', 'pg_net', 'rpc') then
    raise exception using errcode = '22023', message = 'invalid log source';
  end if;
  return public.nrm_system_schedule_log_write(
    p_source, p_event, p_level, p_detail,
    p_schedule_id, p_schedule_key, p_schedule_run_id, p_job_id
  );
end;
$$;

alter function public.nrm_rpc_system_schedule_log_append(
  text, text, text, jsonb, uuid, text, uuid, uuid
) owner to nrm_music_rpc_owner;
revoke all on function public.nrm_rpc_system_schedule_log_append(
  text, text, text, jsonb, uuid, text, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.nrm_rpc_system_schedule_log_append(
  text, text, text, jsonb, uuid, text, uuid, uuid
) to service_role;

create or replace function public.nrm_rpc_system_schedule_log_page(
  p_caller_serial text,
  p_limit integer default 80,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 80), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if not public.nrm_is_admin_caller(p_caller_serial) then
    raise exception using errcode = '42501', message = 'admin required';
  end if;
  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select
          log_id, created_at, source, event, level,
          schedule_id, schedule_key, schedule_run_id, job_id, detail
        from public.nrm_system_schedule_log
        order by created_at desc
        limit v_limit offset v_offset
      ) x
    ), '[]'::jsonb),
    'total', (select count(*)::integer from public.nrm_system_schedule_log)
  );
end;
$$;

alter function public.nrm_rpc_system_schedule_log_page(text, integer, integer)
  owner to nrm_music_rpc_owner;
revoke all on function public.nrm_rpc_system_schedule_log_page(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.nrm_rpc_system_schedule_log_page(text, integer, integer)
  to postgres, service_role;

-- ---------------------------------------------------------------------------
-- 2) Mirror music_schedule_run → nrm_system_schedule_run
-- ---------------------------------------------------------------------------
create or replace function public.nrm_trg_mirror_music_schedule_run()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_system public.nrm_system_schedule%rowtype;
begin
  select * into v_system
  from public.nrm_system_schedule
  where job_kind = 'musicbrainz_collection'
    and nullif(config->>'music_schedule_id', '')::uuid = new.schedule_id
  limit 1;
  if not found then
    perform public.nrm_system_schedule_log_write(
      'trigger', 'music_run_unmapped', 'warn',
      jsonb_build_object(
        'music_schedule_id', new.schedule_id,
        'music_schedule_run_id', new.schedule_run_id,
        'run_status', new.run_status
      ),
      null, null, new.schedule_run_id, null
    );
    return new;
  end if;

  insert into public.nrm_system_schedule_run(
    schedule_id, job_kind, run_status, music_schedule_run_id,
    started_at, finished_at, error_message, result
  ) values (
    v_system.schedule_id,
    'musicbrainz_collection',
    new.run_status,
    new.schedule_run_id,
    new.started_at,
    new.finished_at,
    new.error_message,
    jsonb_build_object(
      'discovered_count', new.discovered_count,
      'inserted_count', new.inserted_count,
      'updated_count', new.updated_count,
      'duplicate_count', new.duplicate_count,
      'failure_count', new.failure_count,
      'request_count', new.request_count
    )
  )
  on conflict (music_schedule_run_id) do update set
    run_status = excluded.run_status,
    finished_at = excluded.finished_at,
    error_message = excluded.error_message,
    result = excluded.result,
    updated_at = now();

  return new;
end;
$$;

alter function public.nrm_trg_mirror_music_schedule_run()
  owner to nrm_music_rpc_owner;

drop trigger if exists trg_nrm_mirror_music_schedule_run on public.music_schedule_run;
create trigger trg_nrm_mirror_music_schedule_run
  after insert or update of run_status, finished_at, error_message,
    discovered_count, inserted_count, updated_count, duplicate_count,
    failure_count, request_count
  on public.music_schedule_run
  for each row
  execute function public.nrm_trg_mirror_music_schedule_run();

-- Backfill existing music runs into the unified ledger.
insert into public.nrm_system_schedule_run(
  schedule_id, job_kind, run_status, music_schedule_run_id,
  started_at, finished_at, error_message, result
)
select
  ns.schedule_id,
  'musicbrainz_collection',
  r.run_status,
  r.schedule_run_id,
  r.started_at,
  r.finished_at,
  r.error_message,
  jsonb_build_object(
    'discovered_count', r.discovered_count,
    'inserted_count', r.inserted_count,
    'updated_count', r.updated_count,
    'duplicate_count', r.duplicate_count,
    'failure_count', r.failure_count,
    'request_count', r.request_count
  )
from public.music_schedule_run r
join public.nrm_system_schedule ns
  on ns.job_kind = 'musicbrainz_collection'
 and nullif(ns.config->>'music_schedule_id', '')::uuid = r.schedule_id
on conflict (music_schedule_run_id) do nothing;

-- ---------------------------------------------------------------------------
-- 3) Busy = in-flight collection only (orphan verify jobs must not stall queue)
-- ---------------------------------------------------------------------------
create or replace function public.music_collection_is_busy()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.music_schedule_run
    where run_status = 'running'
  )
  or exists (
    select 1
    from public.music_sync_job
    where job_kind in (
      'lastfm_artist_pool', 'mb_discovery', 'mb_release_hydrate', 'mb_recording_hydrate'
    )
      and job_status in ('pending', 'processing', 'retry')
  );
$$;

alter function public.music_collection_is_busy() owner to nrm_music_rpc_owner;
revoke all on function public.music_collection_is_busy() from public, anon, authenticated;
grant execute on function public.music_collection_is_busy()
  to service_role, nrm_music_rpc_owner;

-- ---------------------------------------------------------------------------
-- 4) Recover stale running runs / prune logs / diagnostics
-- ---------------------------------------------------------------------------
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
  where created_at < now() - interval '14 days'
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

alter function public.music_rpc_recover_stale_collection()
  owner to nrm_music_rpc_owner;
revoke all on function public.music_rpc_recover_stale_collection()
  from public, anon, authenticated;
grant execute on function public.music_rpc_recover_stale_collection()
  to service_role, nrm_music_rpc_owner, postgres;

create or replace function public.music_rpc_scheduler_diagnostics()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bytes bigint;
  v_policy public.music_capacity_policy%rowtype;
begin
  v_bytes := pg_catalog.pg_database_size(pg_catalog.current_database());
  select * into v_policy
  from public.music_capacity_policy
  where policy_key = 'project1';

  return jsonb_build_object(
    'collected_at', now(),
    'collection_busy', public.music_collection_is_busy(),
    'database_bytes', v_bytes,
    'disable_discovery_bytes', v_policy.disable_discovery_bytes,
    'capacity_blocks_writes', public.music_capacity_blocks_collection_writes(),
    'schedulers_disabled_by_capacity',
      v_policy.is_enabled and v_bytes >= v_policy.disable_discovery_bytes,
    'running_runs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'schedule_run_id', r.schedule_run_id,
        'schedule_id', r.schedule_id,
        'started_at', r.started_at,
        'lease_until', r.lease_until,
        'failure_count', r.failure_count
      ) order by r.started_at desc)
      from public.music_schedule_run r
      where r.run_status = 'running'
    ), '[]'::jsonb),
    'open_jobs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'job_kind', x.job_kind,
        'job_status', x.job_status,
        'job_count', x.job_count
      ) order by x.job_kind, x.job_status)
      from (
        select j.job_kind, j.job_status, count(*)::integer as job_count
        from public.music_sync_job j
        where j.job_status in ('pending', 'retry', 'processing')
        group by j.job_kind, j.job_status
      ) x
    ), '[]'::jsonb),
    'due_schedules', coalesce((
      select jsonb_agg(jsonb_build_object(
        'schedule_id', s.schedule_id,
        'schedule_key', s.schedule_key,
        'display_name', s.display_name,
        'next_run_at', s.next_run_at,
        'claimed_until', s.claimed_until,
        'is_enabled', s.is_enabled,
        'lastfm_method', s.lastfm_method
      ) order by s.priority, s.next_run_at)
      from public.music_collection_schedule s
      where s.is_enabled
        and s.lastfm_method is not null
        and s.next_run_at <= now()
    ), '[]'::jsonb)
  );
end;
$$;

alter function public.music_rpc_scheduler_diagnostics()
  owner to nrm_music_rpc_owner;
revoke all on function public.music_rpc_scheduler_diagnostics()
  from public, anon, authenticated;
grant execute on function public.music_rpc_scheduler_diagnostics()
  to service_role, nrm_music_rpc_owner, postgres;

-- ---------------------------------------------------------------------------
-- 5) Kick musicbrainz-sync via pg_net (postgres-owned so Vault is readable)
-- ---------------------------------------------------------------------------
create or replace function public.nrm_rpc_musicbrainz_dispatcher_cron()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_token text;
  v_req bigint;
  v_recover jsonb;
  v_diag jsonb;
begin
  v_recover := public.music_rpc_recover_stale_collection();
  v_diag := public.music_rpc_scheduler_diagnostics();

  select decrypted_secret into v_url
  from vault.decrypted_secrets
  where name = 'musicbrainz_sync_url'
  order by created_at desc
  limit 1;
  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name = 'musicbrainz_cron_token'
  order by created_at desc
  limit 1;

  if v_url is null or btrim(v_url) = '' or v_token is null or btrim(v_token) = '' then
    perform public.nrm_system_schedule_log_write(
      'cron', 'dispatcher_skipped', 'error',
      jsonb_build_object(
        'reason', 'vault_missing',
        'has_url', v_url is not null and btrim(coalesce(v_url, '')) <> '',
        'has_token', v_token is not null and btrim(coalesce(v_token, '')) <> '',
        'recover', v_recover,
        'busy', v_diag->'collection_busy',
        'due_count', jsonb_array_length(coalesce(v_diag->'due_schedules', '[]'::jsonb)),
        'open_jobs', v_diag->'open_jobs'
      )
    );
    return jsonb_build_object(
      'ok', false,
      'reason', 'vault_missing',
      'has_url', v_url is not null,
      'has_token', v_token is not null,
      'recover', v_recover
    );
  end if;

  v_req := net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_token
    ),
    body := jsonb_build_object('scheduled_at', now(), 'mode', 'sync'),
    timeout_milliseconds := 55000
  );

  perform public.nrm_system_schedule_log_write(
    'cron', 'dispatcher_posted', 'info',
    jsonb_build_object(
      'request_id', v_req,
      'recover', v_recover,
      'busy', v_diag->'collection_busy',
      'due_count', jsonb_array_length(coalesce(v_diag->'due_schedules', '[]'::jsonb)),
      'open_jobs', v_diag->'open_jobs',
      'running_runs', jsonb_array_length(coalesce(v_diag->'running_runs', '[]'::jsonb))
    )
  );

  return jsonb_build_object('ok', true, 'request_id', v_req, 'recover', v_recover);
exception
  when others then
    perform public.nrm_system_schedule_log_write(
      'cron', 'dispatcher_failed', 'error',
      jsonb_build_object(
        'sqlstate', sqlstate,
        'message', sqlerrm
      )
    );
    return jsonb_build_object('ok', false, 'reason', sqlerrm);
end;
$$;

alter function public.nrm_rpc_musicbrainz_dispatcher_cron() owner to postgres;
revoke all on function public.nrm_rpc_musicbrainz_dispatcher_cron()
  from public, anon, authenticated;
grant execute on function public.nrm_rpc_musicbrainz_dispatcher_cron()
  to postgres, nrm_music_rpc_owner, service_role;

do $$
declare v_job_id bigint;
begin
  for v_job_id in
    select jobid from cron.job where jobname = 'nrm-musicbrainz-dispatcher'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end
$$;

select cron.schedule(
  'nrm-musicbrainz-dispatcher',
  '* * * * *',
  $cron$
  select public.nrm_rpc_musicbrainz_dispatcher_cron();
  $cron$
);

-- ---------------------------------------------------------------------------
-- 6) claim_due_schedules: recover first, log skip reasons
-- ---------------------------------------------------------------------------
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

  perform public.music_rpc_recover_stale_collection();

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

  select * into v_policy
  from public.music_capacity_policy
  where policy_key = 'project1'
  for update;
  v_bytes := pg_catalog.pg_database_size(pg_catalog.current_database());
  if v_policy.is_enabled and v_bytes >= v_policy.disable_discovery_bytes then
    perform public.music_rpc_disable_schedulers_for_capacity(v_bytes);
    perform public.nrm_system_schedule_log_write(
      'rpc', 'claim_due_skipped_capacity', 'warn',
      jsonb_build_object('database_bytes', v_bytes, 'limit', v_policy.disable_discovery_bytes)
    );
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
  end loop;
end;
$$;

alter function public.music_rpc_claim_due_schedules(uuid, integer, integer)
  owner to nrm_music_rpc_owner;

-- ---------------------------------------------------------------------------
-- 7) run_now: log exceptions, kick worker even when queued
-- ---------------------------------------------------------------------------
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
begin
  if not public.nrm_is_admin_caller(p_caller_serial) then
    raise exception using errcode = '42501', message = 'admin required';
  end if;

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

  if v_busy then
    perform public.nrm_system_schedule_log_write(
      'rpc', 'run_now_queued_busy', 'info',
      jsonb_build_object(
        'music_schedule_id', p_schedule_id,
        'schedule_key', v_schedule.schedule_key,
        'diagnostics', public.music_rpc_scheduler_diagnostics()
      ),
      null, v_schedule.schedule_key, null, null
    );
    v_kick := public.nrm_rpc_musicbrainz_dispatcher_cron();
    perform public.nrm_system_schedule_log_write(
      'rpc', 'run_now_worker_kick', 'info',
      jsonb_build_object('kick', v_kick, 'queued', true),
      null, v_schedule.schedule_key, null, null
    );
    return true;
  end if;

  select * into v_policy
  from public.music_capacity_policy
  where policy_key = 'project1'
  for update;
  v_bytes := pg_catalog.pg_database_size(pg_catalog.current_database());
  if v_policy.is_enabled and v_bytes >= v_policy.disable_discovery_bytes then
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

  v_kick := public.nrm_rpc_musicbrainz_dispatcher_cron();
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

alter function public.music_rpc_admin_schedule_run_now(text, uuid)
  owner to nrm_music_rpc_owner;
revoke all on function public.music_rpc_admin_schedule_run_now(text, uuid)
  from public, anon, authenticated;
grant execute on function public.music_rpc_admin_schedule_run_now(text, uuid)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8) Retention tick records runs + logs; wrap per-job errors
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
      and job_kind in ('ailab_chat_retention', 'track_history_retention')
      and next_run_at <= now()
    order by next_run_at, schedule_key
    for update skip locked
  loop
    v_error := null;
    v_run := null;
    if v_sched.schedule_kind = 'daily' then
      v_next := public.nrm_system_schedule_next_daily_run(v_sched.daily_time_kst, now());
    else
      v_next := now() + make_interval(mins => v_sched.interval_minutes);
    end if;

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

alter function public.nrm_rpc_system_schedule_tick() owner to postgres;
grant execute on function public.nrm_rpc_system_schedule_tick()
  to postgres, service_role, nrm_music_rpc_owner;
grant execute on function public.nrm_rpc_ailab_chat_retention_run(integer)
  to nrm_music_rpc_owner;
grant execute on function public.nrm_rpc_track_history_retention_run(integer)
  to nrm_music_rpc_owner;

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

  if v_sched.job_kind in ('ailab_chat_retention', 'track_history_retention') then
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

alter function public.nrm_rpc_system_schedule_run_now(text, uuid)
  owner to nrm_music_rpc_owner;
revoke all on function public.nrm_rpc_system_schedule_run_now(text, uuid)
  from public, anon, authenticated;
grant execute on function public.nrm_rpc_system_schedule_run_now(text, uuid)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9) finalize logs completion
-- ---------------------------------------------------------------------------
create or replace function public.music_rpc_finalize_mb_runs(p_worker_id uuid)
returns table(has_more boolean)
language plpgsql security definer set search_path = ''
as $$
declare
  v_done integer := 0;
begin
  if p_worker_id is null then
    raise exception using errcode = '22023', message = 'worker id required';
  end if;
  update public.music_schedule_run r
  set run_status = case when r.failure_count > 0 then 'partial' else 'completed' end,
      finished_at = now(),
      capacity_after_bytes = pg_catalog.pg_database_size(pg_catalog.current_database())
  where r.run_status = 'running'
    and not exists (
      select 1 from public.music_sync_job j
      where j.schedule_run_id = r.schedule_run_id
        and j.job_status in ('pending','processing','retry')
    );
  get diagnostics v_done = row_count;
  update public.music_collection_schedule s
    set claimed_until = null, claim_fence_token = null, claimed_by = null
  where exists (
    select 1 from public.music_schedule_run r
    where r.schedule_id = s.schedule_id and r.run_status <> 'running'
      and r.fence_token = s.claim_fence_token
  );
  if v_done > 0 then
    perform public.nrm_system_schedule_log_write(
      'rpc', 'finalize_runs', 'info',
      jsonb_build_object('worker_id', p_worker_id, 'finalized', v_done)
    );
  end if;
  return query select exists (
    select 1 from public.music_sync_job
    where job_kind in (
      'lastfm_artist_pool','mb_discovery','mb_release_hydrate','mb_recording_hydrate',
      'mb_upcoming_verify'
    )
      and job_status in ('pending','processing','retry')
  );
end;
$$;

alter function public.music_rpc_finalize_mb_runs(uuid) owner to nrm_music_rpc_owner;
revoke all on function public.music_rpc_finalize_mb_runs(uuid)
  from public, anon, authenticated;
grant execute on function public.music_rpc_finalize_mb_runs(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 10) Admin overview: music_schedule_run 실행/실패 (진단 로그 비포함)
-- ---------------------------------------------------------------------------
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
  v_run_limit := least(p_limit, 80);

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

comment on function public.nrm_rpc_system_schedule_run_now(text, uuid) is
  '활성 시스템 스케줄 즉시 실행. 실패 시 SQL 원인을 로그에 남기고 예외로 반환.';
comment on function public.nrm_rpc_musicbrainz_dispatcher_cron() is
  'pg_cron/즉시실행: stale 회복 후 musicbrainz-sync Edge를 pg_net으로 호출하고 진단 로그를 남긴다.';
comment on function public.music_rpc_scheduler_diagnostics() is
  '수집 큐 스냅샷(busy, due, open jobs, capacity). Edge/Postgres 진단용. 관리 UI 비노출.';
comment on function public.nrm_rpc_system_schedule_log_page(text, integer, integer) is
  'service_role 진단 조회. 관리 UI 비노출. Postgres RAISE LOG / Edge console.log가 1차.';

revoke create on schema public from nrm_music_rpc_owner;
