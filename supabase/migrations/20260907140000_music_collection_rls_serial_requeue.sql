-- Fix hydrate RLS gaps, enforce global serial schedule claim, requeue failed collection work.

grant usage, create on schema public to nrm_music_rpc_owner;

-- ---------------------------------------------------------------------------
-- 1) RLS policies missing from the original owner-policy set
-- ---------------------------------------------------------------------------
do $$
declare
  v_table text;
  v_policy text;
begin
  foreach v_table in array array[
    'music_album_artist_credit',
    'music_release_artist_credit',
    'music_recording_artist_credit',
    'music_track_artist_credit',
    'music_genre',
    'music_artist_genre',
    'music_album_genre',
    'music_release_genre',
    'music_recording_genre',
    'music_tag',
    'music_tag_alias',
    'music_artist_mb_tag',
    'music_album_mb_tag',
    'music_release_mb_tag',
    'music_recording_mb_tag',
    'music_recording_isrc',
    'music_mbid_resolution_observation',
    'lastfm_tag_fetch_attempt',
    'music_lastfm_artist_pool_fetch'
  ]
  loop
    if to_regclass('public.' || v_table) is null then
      continue;
    end if;
    execute format('alter table public.%I enable row level security', v_table);
    v_policy := 'pl_' || v_table || '_music_rpc_owner';
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = v_table
        and policyname = v_policy
    ) then
      execute format(
        'create policy %I on public.%I for all to nrm_music_rpc_owner using (true) with check (true)',
        v_policy,
        v_table
      );
    end if;
  end loop;
end
$$;

grant select, insert, update, delete on table
  public.music_album_artist_credit,
  public.music_release_artist_credit,
  public.music_recording_artist_credit,
  public.music_track_artist_credit,
  public.music_genre,
  public.music_artist_genre,
  public.music_album_genre,
  public.music_release_genre,
  public.music_recording_genre,
  public.music_tag,
  public.music_tag_alias,
  public.music_artist_mb_tag,
  public.music_album_mb_tag,
  public.music_release_mb_tag,
  public.music_recording_mb_tag,
  public.music_recording_isrc
to nrm_music_rpc_owner;

grant usage, select on sequence public.music_tag_tag_id_seq to nrm_music_rpc_owner;
do $$
declare v_seq text;
begin
  v_seq := pg_catalog.pg_get_serial_sequence('public.music_tag_alias', 'tag_alias_id');
  if v_seq is not null then
    execute format('grant usage, select on sequence %s to nrm_music_rpc_owner', v_seq);
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2) Global serial claim: at most one MusicBrainz schedule run in flight
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
grant execute on function public.music_collection_is_busy() to service_role, nrm_music_rpc_owner;

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
begin
  if p_worker_id is null
     or p_batch_size not between 1 and 20
     or p_lease_seconds not between 15 and 300 then
    raise exception using errcode = '22023', message = 'invalid schedule claim parameters';
  end if;

  -- Global serial queue: never start another schedule while prior work is open.
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

  -- Force one schedule per claim regardless of caller batch size.
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
      v_schedule.schedule_id::text || ':' || v_schedule.next_run_at::text, 'sha256'
    ), 'hex');

    insert into public.music_schedule_run(
      schedule_run_id, schedule_id, request_key, fence_token, worker_id, lease_until,
      date_from, date_to, capacity_before_bytes
    ) values (
      v_run_id, v_schedule.schedule_id, v_request_key, v_fence, p_worker_id,
      now() + pg_catalog.make_interval(secs => p_lease_seconds), v_from, v_to, v_bytes
    )
    on conflict (request_key) do nothing;
    if not found then
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
    where music_collection_schedule.schedule_id = v_schedule.schedule_id;

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

-- run_now only marks due; does not clear lease or force a parallel run.
create or replace function public.music_rpc_admin_schedule_run_now(
  p_caller_serial text,
  p_schedule_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.nrm_is_admin_caller(p_caller_serial) then
    raise exception using errcode = '42501', message = 'admin required';
  end if;

  update public.music_collection_schedule
  set next_run_at = least(next_run_at, now())
  where schedule_id = p_schedule_id
    and is_enabled;

  -- If the collection pipeline is idle, clear a stale lease so the next worker
  -- tick can claim this due schedule immediately. Never clear while busy.
  if found and not public.music_collection_is_busy() then
    update public.music_collection_schedule
    set claimed_until = null,
        claim_fence_token = null,
        claimed_by = null
    where schedule_id = p_schedule_id
      and is_enabled;
  end if;

  return found;
end;
$$;

alter function public.music_rpc_admin_schedule_run_now(text, uuid)
  owner to nrm_music_rpc_owner;

comment on function public.music_collection_is_busy() is
  'MusicBrainz 수집 전역 직렬 큐: running run 또는 open collection job 존재 여부';
comment on function public.music_rpc_claim_due_schedules(uuid, integer, integer) is
  'due 스케줄 claim. 전역 busy면 0건, 아니면 최대 1건만 claim';
comment on function public.music_rpc_admin_schedule_run_now(text, uuid) is
  '즉시 실행 예약(next_run_at=now). busy면 큐만 남기고 병렬 시작하지 않음';

-- ---------------------------------------------------------------------------
-- 3) Requeue failed / quarantined collection work after RLS repair
-- ---------------------------------------------------------------------------
with requeued as (
  update public.music_sync_job j
  set job_status = 'pending',
      available_at = now(),
      lease_until = null,
      fence_token = null,
      worker_id = null,
      last_error_message = null,
      http_status = null,
      api_error_code = null,
      completed_at = null
  where j.job_kind in (
      'lastfm_artist_pool', 'mb_discovery', 'mb_release_hydrate', 'mb_recording_hydrate'
    )
    and j.job_status in ('dead', 'quarantined', 'blocked')
  returning j.job_id, j.schedule_run_id, j.candidate_id
)
update public.music_dead_letter d
set resolved_at = now(),
    resolution_note = 'auto-requeue after RLS/serial-queue fix 20260907'
from requeued r
where d.resolved_at is null
  and d.source_kind = 'sync_job'
  and d.source_id = r.job_id;

update public.music_release_candidate c
set candidate_status = 'queued',
    validation_result = null,
    updated_at = now()
where c.candidate_status = 'quarantined';

update public.music_schedule_run r
set run_status = 'running',
    finished_at = null,
    failure_count = 0,
    error_message = null
where exists (
  select 1
  from public.music_sync_job j
  where j.schedule_run_id = r.schedule_run_id
    and j.job_kind in (
      'lastfm_artist_pool', 'mb_discovery', 'mb_release_hydrate', 'mb_recording_hydrate'
    )
    and j.job_status in ('pending', 'processing', 'retry')
);

revoke create on schema public from nrm_music_rpc_owner;
