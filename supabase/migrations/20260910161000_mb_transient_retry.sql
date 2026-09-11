-- MusicBrainz HTTP 503(및 tick 안 3회 재시도 후에도 실패한 일시 오류) 임시 재시도 큐.
-- 성공·계약 오류는 행을 물리 삭제한다. 원장 테이블이 아니므로 hard-delete 금지 트리거를 달지 않는다.

alter table public.music_collection_schedule
  drop constraint if exists ck_music_collection_schedule_collection_mode;
alter table public.music_collection_schedule
  add constraint ck_music_collection_schedule_collection_mode
  check (collection_mode in ('upcoming', 'catalog', 'tag_refresh', 'mb_transient_retry'));

comment on column public.music_collection_schedule.collection_mode is
  'upcoming=발매예정 스테이징, catalog=원장 직행, tag_refresh=전곡 Last.fm 태그, mb_transient_retry=MusicBrainz 일시 실패 재시도';

create table if not exists public.music_mb_transient_retry (
  retry_id uuid not null default extensions.gen_random_uuid(),
  source_job_kind text not null,
  entity_id uuid not null,
  source_schedule_id uuid,
  discovery_scan_id uuid,
  candidate_id uuid,
  http_status integer,
  last_error text,
  failed_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  attempt_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pk_music_mb_transient_retry primary key (retry_id),
  constraint ux_music_mb_transient_retry_job unique (source_job_kind, entity_id),
  constraint ck_music_mb_transient_retry_kind check (source_job_kind in (
    'mb_catalog_track_resolve', 'mb_discovery', 'mb_release_hydrate',
    'mb_recording_hydrate', 'mb_upcoming_verify'
  )),
  constraint ck_music_mb_transient_retry_attempts check (attempt_count >= 0),
  constraint ck_music_mb_transient_retry_error check (char_length(coalesce(last_error, '')) <= 1000)
);

comment on table public.music_mb_transient_retry is
  'MusicBrainz 일시 HTTP 실패(503 등) 재시도 대기. 성공 또는 계약 오류면 DELETE.';

create index if not exists ix_music_mb_transient_retry_failed
  on public.music_mb_transient_retry (failed_at, retry_id);

alter table public.music_mb_transient_retry enable row level security;
revoke all on table public.music_mb_transient_retry from public, anon, authenticated;
grant select, insert, update, delete on table public.music_mb_transient_retry
  to nrm_music_rpc_owner, service_role, postgres;

drop policy if exists pl_music_mb_transient_retry_music_rpc_owner
  on public.music_mb_transient_retry;
create policy pl_music_mb_transient_retry_music_rpc_owner
  on public.music_mb_transient_retry
  for all to nrm_music_rpc_owner using (true) with check (true);

create or replace function public.music_rpc_enqueue_mb_transient_retry(
  p_job_kind text,
  p_entity_id uuid,
  p_source_schedule_id uuid default null,
  p_discovery_scan_id uuid default null,
  p_candidate_id uuid default null,
  p_http_status integer default null,
  p_error_message text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_job_kind not in (
    'mb_catalog_track_resolve', 'mb_discovery', 'mb_release_hydrate',
    'mb_recording_hydrate', 'mb_upcoming_verify'
  ) or p_entity_id is null then
    return;
  end if;
  insert into public.music_mb_transient_retry(
    source_job_kind, entity_id, source_schedule_id, discovery_scan_id, candidate_id,
    http_status, last_error, failed_at, updated_at
  ) values (
    p_job_kind, p_entity_id, p_source_schedule_id, p_discovery_scan_id, p_candidate_id,
    p_http_status, nullif(left(coalesce(p_error_message, ''), 1000), ''),
    now(), now()
  )
  on conflict (source_job_kind, entity_id) do update set
    source_schedule_id = coalesce(excluded.source_schedule_id, music_mb_transient_retry.source_schedule_id),
    discovery_scan_id = coalesce(excluded.discovery_scan_id, music_mb_transient_retry.discovery_scan_id),
    candidate_id = coalesce(excluded.candidate_id, music_mb_transient_retry.candidate_id),
    http_status = excluded.http_status,
    last_error = excluded.last_error,
    failed_at = music_mb_transient_retry.failed_at,
    updated_at = now();
end;
$$;

create or replace function public.music_rpc_enqueue_mb_transient_retry_jobs(
  p_schedule_id uuid,
  p_run_id uuid,
  p_priority integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
begin
  update public.music_catalog_track_candidate c
  set candidate_status = 'queued', updated_at = now()
  from public.music_mb_transient_retry r
  where r.source_job_kind = 'mb_catalog_track_resolve'
    and c.candidate_id = r.entity_id
    and c.candidate_status in ('hydrating', 'rejected');

  update public.music_release_candidate rc
  set candidate_status = 'queued', validation_result = null, updated_at = now()
  from public.music_mb_transient_retry r
  where r.source_job_kind = 'mb_release_hydrate'
    and rc.candidate_id = coalesce(r.candidate_id, r.entity_id)
    and rc.candidate_status in ('rejected', 'quarantined');

  update public.music_discovery_scan d
  set scan_status = 'retry', lease_until = null, worker_id = null, fence_token = null
  from public.music_mb_transient_retry r
  where r.source_job_kind = 'mb_discovery'
    and d.discovery_scan_id = coalesce(r.discovery_scan_id, r.entity_id)
    and d.scan_status in ('failed', 'quarantined');

  insert into public.music_sync_job(
    job_kind, entity_type, entity_id, idempotency_key, priority,
    schedule_id, schedule_run_id, discovery_scan_id, candidate_id
  )
  select
    r.source_job_kind,
    case r.source_job_kind
      when 'mb_discovery' then 'artist'
      when 'mb_release_hydrate' then 'release'
      when 'mb_upcoming_verify' then 'release'
      else 'recording'
    end,
    r.entity_id,
    'mb-503-retry:' || p_run_id::text || ':' || r.retry_id::text,
    coalesce(p_priority, 5),
    p_schedule_id,
    p_run_id,
    case when r.source_job_kind = 'mb_discovery'
      then coalesce(r.discovery_scan_id, r.entity_id) end,
    case when r.source_job_kind = 'mb_release_hydrate'
      then coalesce(r.candidate_id, r.entity_id) end
  from public.music_mb_transient_retry r
  where not exists (
    select 1 from public.music_sync_job j
    where j.job_kind = r.source_job_kind
      and j.entity_id = r.entity_id
      and j.job_status in ('pending', 'processing', 'retry')
  )
    and (
      r.source_job_kind <> 'mb_catalog_track_resolve'
      or exists (
        select 1 from public.music_catalog_track_candidate c
        where c.candidate_id = r.entity_id
          and c.candidate_status in ('queued', 'hydrating')
      )
    )
  order by r.failed_at, r.retry_id
  limit 200
  on conflict (idempotency_key) do nothing;
  get diagnostics v_count = row_count;

  update public.music_mb_transient_retry r
  set last_attempt_at = now(),
      attempt_count = r.attempt_count + 1,
      updated_at = now()
  where exists (
    select 1 from public.music_sync_job j
    where j.schedule_run_id = p_run_id
      and j.job_kind = r.source_job_kind
      and j.entity_id = r.entity_id
  );

  return v_count;
end;
$$;

create or replace function public.music_mb_transient_retry_on_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.job_kind not in (
    'mb_catalog_track_resolve', 'mb_discovery', 'mb_release_hydrate',
    'mb_recording_hydrate', 'mb_upcoming_verify'
  ) then
    return new;
  end if;
  if new.job_status in ('completed', 'quarantined', 'blocked') then
    delete from public.music_mb_transient_retry
    where source_job_kind = new.job_kind
      and entity_id = new.entity_id;
  end if;
  return new;
end;
$$;

drop trigger if exists tr_music_sync_job_transient_retry on public.music_sync_job;
create trigger tr_music_sync_job_transient_retry
  after update of job_status on public.music_sync_job
  for each row
  execute function public.music_mb_transient_retry_on_job();

create or replace function public.music_collection_enqueue_pool_job(
  p_schedule_id uuid,
  p_run_id uuid,
  p_request_key text,
  p_priority integer,
  p_mode text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_mode = 'mb_transient_retry' then
    perform public.music_rpc_enqueue_mb_transient_retry_jobs(p_schedule_id, p_run_id, p_priority);
    return;
  end if;
  if p_mode = 'tag_refresh' then
    insert into public.music_sync_job(
      job_kind, entity_type, entity_id, idempotency_key, priority,
      schedule_id, schedule_run_id
    ) values (
      'lastfm_tag_refresh', 'recording', p_schedule_id,
      'lastfm-tag-refresh:' || p_request_key, p_priority, p_schedule_id, p_run_id
    )
    on conflict (idempotency_key) do nothing;
    insert into public.music_lastfm_tag_refresh_state(schedule_run_id, after_recording_id, queued_count)
    values (p_run_id, null, 0)
    on conflict (schedule_run_id) do nothing;
    return;
  end if;
  insert into public.music_sync_job(
    job_kind, entity_type, entity_id, idempotency_key, priority,
    schedule_id, schedule_run_id
  ) values (
    public.music_collection_pool_job_kind(p_mode),
    case when p_mode = 'catalog' then 'recording' else 'artist' end,
    p_schedule_id,
    case when p_mode = 'catalog' then 'lastfm-track-pool:' else 'lastfm-pool:' end || p_request_key,
    p_priority, p_schedule_id, p_run_id
  )
  on conflict (idempotency_key) do nothing;
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
    and (s.lastfm_method is not null or s.collection_mode in ('tag_refresh', 'mb_transient_retry'))
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
  if v_schedule.collection_mode not in ('tag_refresh', 'mb_transient_retry') and v_schedule.lastfm_method is null then
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
      and (s.lastfm_method is not null or s.collection_mode in ('tag_refresh', 'mb_transient_retry'))
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

insert into public.music_collection_schedule(
  schedule_key, display_name, schedule_kind, daily_time_kst, interval_minutes,
  weekly_weekday, monthly_day, once_on_date, next_run_at, is_enabled,
  date_from_offset_days, date_to_offset_days, release_statuses,
  max_artist_count, max_request_count, max_new_recording_count,
  priority, lastfm_method, lastfm_param, lastfm_limit, collection_mode
)
select
  'musicbrainz-mb-503-retry',
  'MusicBrainz 503 재시도',
  'interval',
  null,
  60,
  null, null, null,
  now(),
  true, 0, 0, array['Official']::text[], 1, 45, 1000,
  5, null, null, 100, 'mb_transient_retry'
where not exists (
  select 1 from public.music_collection_schedule s
  where s.schedule_key = 'musicbrainz-mb-503-retry'
);

insert into public.nrm_system_schedule(
  schedule_key, display_name, job_kind, is_enabled, schedule_kind,
  daily_time_kst, interval_minutes, weekly_weekday, monthly_day, once_on_date,
  next_run_at, config
)
select
  ms.schedule_key, ms.display_name, 'musicbrainz_collection',
  ms.is_enabled, ms.schedule_kind, ms.daily_time_kst, ms.interval_minutes,
  ms.weekly_weekday, ms.monthly_day, ms.once_on_date, ms.next_run_at,
  pg_catalog.jsonb_build_object('music_schedule_id', ms.schedule_id)
from public.music_collection_schedule ms
where ms.schedule_key = 'musicbrainz-mb-503-retry'
on conflict (schedule_key) do update set
  display_name = excluded.display_name,
  job_kind = excluded.job_kind,
  schedule_kind = excluded.schedule_kind,
  daily_time_kst = excluded.daily_time_kst,
  interval_minutes = excluded.interval_minutes,
  weekly_weekday = excluded.weekly_weekday,
  monthly_day = excluded.monthly_day,
  once_on_date = excluded.once_on_date,
  next_run_at = excluded.next_run_at,
  config = excluded.config,
  updated_at = now();

grant execute on function public.music_rpc_enqueue_mb_transient_retry(
  text, uuid, uuid, uuid, uuid, integer, text
) to nrm_music_rpc_owner, service_role, postgres;
grant execute on function public.music_rpc_enqueue_mb_transient_retry_jobs(uuid, uuid, integer)
  to nrm_music_rpc_owner, service_role, postgres;
grant execute on function public.music_mb_transient_retry_on_job()
  to nrm_music_rpc_owner, service_role, postgres;
