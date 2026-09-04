-- Capacity policy: collection stops at 450 MiB by disabling all schedulers.
-- Warning / write-stop no longer gate MusicBrainz/Last.fm/vector collection writes.
-- General app CRUD was never gated by this policy and remains unaffected.

grant usage, create on schema public to nrm_music_rpc_owner;

update public.music_capacity_policy
set
  warning_bytes = 449::bigint * 1024 * 1024,
  disable_discovery_bytes = 450::bigint * 1024 * 1024,
  write_stop_bytes = 499::bigint * 1024 * 1024,
  hard_limit_bytes = 500::bigint * 1024 * 1024,
  updated_at = now()
where policy_key = 'project1';

comment on table public.music_capacity_policy is
  '프로젝트 1 용량 정책. 450MiB부터 수집 스케줄 전체 off. 앱 일반 CRUD는 용량 게이트 없음.';

-- Always false: collection is gated only by turning schedulers off at 450 MiB.
create or replace function public.music_capacity_blocks_collection_writes()
returns boolean
language sql
stable
set search_path = ''
as $$
  select false;
$$;

alter function public.music_capacity_blocks_collection_writes() owner to nrm_music_rpc_owner;
revoke all on function public.music_capacity_blocks_collection_writes() from public, anon, authenticated;

create or replace function public.music_rpc_capacity_status()
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  with policy as (
    select
      warning_bytes,
      disable_discovery_bytes,
      write_stop_bytes,
      hard_limit_bytes
    from public.music_capacity_policy
    where policy_key = 'project1'
  ),
  database_usage as (
    select pg_catalog.pg_database_size(pg_catalog.current_database())::bigint as database_bytes
  ),
  relations as (
    select coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'schema_name', relation.schema_name,
          'relation_name', relation.relation_name,
          'total_bytes', relation.total_bytes,
          'table_bytes', relation.table_bytes,
          'index_bytes', relation.index_bytes
        )
        order by relation.total_bytes desc, relation.relation_name
      ),
      '[]'::jsonb
    ) as value
    from (
      select
        namespace.nspname as schema_name,
        relation.relname as relation_name,
        pg_catalog.pg_total_relation_size(relation.oid)::bigint as total_bytes,
        pg_catalog.pg_table_size(relation.oid)::bigint as table_bytes,
        pg_catalog.pg_indexes_size(relation.oid)::bigint as index_bytes
      from pg_catalog.pg_class relation
      join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relkind in ('r', 'm')
      order by pg_catalog.pg_total_relation_size(relation.oid) desc, relation.relname
    ) relation
  )
  select pg_catalog.jsonb_build_object(
    'project_ref', 'bwkiaapffroyveqqjhom',
    'project_label', '프로젝트 1',
    'database_bytes', database_usage.database_bytes,
    'hard_limit_bytes', policy.hard_limit_bytes,
    'usage_ratio',
      case
        when policy.hard_limit_bytes > 0
          then database_usage.database_bytes::double precision / policy.hard_limit_bytes::double precision
        else 0
      end,
    'capacity_state',
      case
        when database_usage.database_bytes >= policy.disable_discovery_bytes then 'discovery_disabled'
        else 'normal'
      end,
    'thresholds', pg_catalog.jsonb_build_object(
      'warning_bytes', policy.warning_bytes,
      'disable_discovery_bytes', policy.disable_discovery_bytes,
      'write_stop_bytes', policy.write_stop_bytes
    ),
    'relations', relations.value,
    'captured_at', pg_catalog.clock_timestamp()
  )
  from policy
  cross join database_usage
  cross join relations;
$$;

alter function public.music_rpc_capacity_status() owner to nrm_music_rpc_owner;
revoke all on function public.music_rpc_capacity_status() from public, anon, authenticated;
grant execute on function public.music_rpc_capacity_status() to service_role;

create or replace function public.music_rpc_capture_capacity(p_source text)
returns table(snapshot_id uuid, database_bytes bigint, capacity_state text, writes_allowed boolean, discovery_allowed boolean)
language plpgsql security definer set search_path = ''
as $$
declare
  v_policy public.music_capacity_policy%rowtype;
  v_bytes bigint;
  v_snapshot uuid;
  v_state text;
  v_relations jsonb;
begin
  if btrim(coalesce(p_source, '')) = '' or char_length(p_source) > 80 then
    raise exception using errcode = '22023', message = 'invalid capacity source';
  end if;
  select * into v_policy from public.music_capacity_policy where policy_key = 'project1';
  v_bytes := pg_catalog.pg_database_size(pg_catalog.current_database());
  select coalesce(jsonb_object_agg(relname, bytes), '{}'::jsonb) into v_relations
  from (
    select c.relname, pg_catalog.pg_total_relation_size(c.oid) as bytes
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','m')
    order by pg_catalog.pg_total_relation_size(c.oid) desc
    limit 80
  ) s;
  v_state := case
    when v_bytes >= v_policy.disable_discovery_bytes then 'discovery_disabled'
    else 'normal'
  end;
  insert into public.music_capacity_snapshot(source, database_bytes, relation_bytes, capacity_state)
  values (p_source, v_bytes, v_relations, v_state) returning music_capacity_snapshot.snapshot_id into v_snapshot;
  return query select v_snapshot, v_bytes, v_state, true, v_bytes < v_policy.disable_discovery_bytes;
end;
$$;

alter function public.music_rpc_capture_capacity(text) owner to nrm_music_rpc_owner;

create or replace function public.music_rpc_disable_schedulers_for_capacity(
  p_database_bytes bigint
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_disabled boolean := false;
  v_music_count integer := 0;
  v_system_count integer := 0;
begin
  update public.music_collection_schedule
  set is_enabled = false,
      last_disabled_reason = 'capacity_threshold',
      claimed_until = null,
      claim_fence_token = null,
      claimed_by = null
  where is_enabled;
  get diagnostics v_music_count = row_count;
  if v_music_count > 0 then
    v_disabled := true;
  end if;

  if to_regclass('public.nrm_system_schedule') is not null then
    update public.nrm_system_schedule
    set is_enabled = false
    where is_enabled;
    get diagnostics v_system_count = row_count;
    if v_system_count > 0 then
      v_disabled := true;
    end if;
  end if;

  if v_disabled then
    insert into public.music_capacity_event(event_kind, detail)
    values (
      'schedules_disabled',
      jsonb_build_object(
        'database_bytes', p_database_bytes,
        'threshold', 'disable_discovery_bytes',
        'music_schedules_disabled', v_music_count,
        'system_schedules_disabled', v_system_count
      )
    );
  end if;
  return v_disabled;
end;
$$;

alter function public.music_rpc_disable_schedulers_for_capacity(bigint) owner to nrm_music_rpc_owner;
revoke all on function public.music_rpc_disable_schedulers_for_capacity(bigint) from public, anon, authenticated;

create or replace function public.music_rpc_claim_due_schedules(
  p_worker_id uuid, p_batch_size integer, p_lease_seconds integer
)
returns table(
  schedule_run_id uuid, schedule_id uuid, fence_token uuid,
  date_from date, date_to date, max_request_count integer
)
language plpgsql security definer set search_path = ''
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
  if p_worker_id is null or p_batch_size not between 1 and 20 or p_lease_seconds not between 15 and 300 then
    raise exception using errcode = '22023', message = 'invalid schedule claim parameters';
  end if;
  select * into v_policy from public.music_capacity_policy where policy_key = 'project1' for update;
  v_bytes := pg_catalog.pg_database_size(pg_catalog.current_database());
  if v_policy.is_enabled and v_bytes >= v_policy.disable_discovery_bytes then
    perform public.music_rpc_disable_schedulers_for_capacity(v_bytes);
    return;
  end if;
  for v_schedule in
    select s.* from public.music_collection_schedule s
    where s.is_enabled and s.next_run_at <= now()
      and (s.claimed_until is null or s.claimed_until < now())
    order by s.priority, s.next_run_at
    for update skip locked limit p_batch_size
  loop
    v_run_id := extensions.gen_random_uuid();
    v_fence := extensions.gen_random_uuid();
    v_from := (now() at time zone 'Asia/Seoul')::date + v_schedule.date_from_offset_days;
    v_to := (now() at time zone 'Asia/Seoul')::date + v_schedule.date_to_offset_days;
    v_request_key := encode(extensions.digest(
      v_schedule.schedule_id::text || ':' || v_schedule.next_run_at::text, 'sha256'), 'hex');
    insert into public.music_schedule_run(
      schedule_run_id, schedule_id, request_key, fence_token, worker_id, lease_until,
      date_from, date_to, capacity_before_bytes
    ) values (
      v_run_id, v_schedule.schedule_id, v_request_key, v_fence, p_worker_id,
      now() + make_interval(secs => p_lease_seconds), v_from, v_to, v_bytes
    ) on conflict (request_key) do nothing;
    if not found then
      continue;
    end if;
    update public.music_collection_schedule set
      claimed_until = now() + make_interval(secs => p_lease_seconds),
      claim_fence_token = v_fence, claimed_by = p_worker_id,
      next_run_at = case
        when schedule_kind = 'interval' then now() + make_interval(mins => interval_minutes)
        else (
          ((now() at time zone 'Asia/Seoul')::date + 1 + daily_time_kst)
          at time zone 'Asia/Seoul'
        )
      end
    where music_collection_schedule.schedule_id = v_schedule.schedule_id;
    insert into public.music_discovery_scan(
      schedule_run_id, schedule_id, artist_mbid, request_key
    )
    select v_run_id, v_schedule.schedule_id, sa.artist_mbid,
      encode(extensions.digest(v_run_id::text || ':' || sa.artist_mbid::text, 'sha256'), 'hex')
    from public.music_schedule_artist sa
    join public.music_artist_allowlist a on a.artist_mbid = sa.artist_mbid
    where sa.schedule_id = v_schedule.schedule_id and sa.is_enabled and a.is_enabled
    order by coalesce(sa.priority_override, a.priority), sa.artist_mbid
    limit v_schedule.max_artist_count;
    insert into public.music_sync_job(
      job_kind, entity_type, entity_id, idempotency_key, priority,
      schedule_id, schedule_run_id, discovery_scan_id
    )
    select 'mb_discovery', 'artist', d.artist_mbid, 'discovery:' || d.request_key,
      v_schedule.priority, d.schedule_id, d.schedule_run_id, d.discovery_scan_id
    from public.music_discovery_scan d where d.schedule_run_id = v_run_id
    on conflict (idempotency_key) do nothing;
    return query select v_run_id, v_schedule.schedule_id, v_fence, v_from, v_to, v_schedule.max_request_count;
  end loop;
end;
$$;

alter function public.music_rpc_claim_due_schedules(uuid, integer, integer) owner to nrm_music_rpc_owner;

create or replace function public.music_rpc_claim_mb_work(
  p_worker_id uuid, p_batch_size integer, p_lease_seconds integer
)
returns table(
  job_id uuid, job_kind text, entity_id uuid, fence_token uuid,
  attempt_count integer, context jsonb
)
language plpgsql security definer set search_path = ''
as $$
begin
  if p_worker_id is null or p_batch_size not between 1 and 10
     or p_lease_seconds not between 30 and 300 then
    raise exception using errcode = '22023', message = 'invalid MusicBrainz work claim parameters';
  end if;
  if public.music_capacity_blocks_collection_writes() then
    return;
  end if;
  return query
  with picked as (
    select j.job_id
    from public.music_sync_job j
    where j.job_kind in ('mb_discovery','mb_release_hydrate','mb_recording_hydrate')
      and (
        (j.job_status in ('pending','retry') and j.available_at <= now())
        or (j.job_status = 'processing' and j.lease_until < now())
      )
    order by
      case j.job_kind when 'mb_discovery' then 0 when 'mb_release_hydrate' then 1 else 2 end,
      j.priority desc, j.available_at, j.created_at
    for update skip locked
    limit p_batch_size
  ), claimed as (
    update public.music_sync_job j
    set job_status = 'processing',
        worker_id = p_worker_id,
        fence_token = extensions.gen_random_uuid(),
        lease_until = now() + pg_catalog.make_interval(secs => p_lease_seconds),
        attempt_count = j.attempt_count + 1
    from picked p
    where j.job_id = p.job_id
    returning j.*
  ), scan_leases as (
    update public.music_discovery_scan d
    set scan_status = 'processing',
        worker_id = p_worker_id,
        fence_token = c.fence_token,
        lease_until = c.lease_until,
        started_at = coalesce(d.started_at, now())
    from claimed c
    where d.discovery_scan_id = c.discovery_scan_id
    returning d.discovery_scan_id
  )
  select c.job_id, c.job_kind, c.entity_id, c.fence_token, c.attempt_count,
    case
      when c.job_kind = 'mb_discovery' then jsonb_build_object(
        'discovery_scan_id', d.discovery_scan_id,
        'artist_mbid', d.artist_mbid,
        'next_offset', d.next_offset,
        'date_from', sr.date_from,
        'date_to', sr.date_to
      )
      when c.job_kind = 'mb_release_hydrate' then jsonb_build_object(
        'candidate_id', rc.candidate_id,
        'release_mbid', rc.release_mbid,
        'artist_mbid', rc.artist_mbid,
        'date_from', sr.date_from,
        'date_to', sr.date_to,
        'country_codes', s.country_codes,
        'release_statuses', s.release_statuses,
        'primary_types', s.primary_types,
        'secondary_types', s.secondary_types
      )
      else jsonb_build_object(
        'recording_mbid', c.entity_id,
        'schedule_run_id', c.schedule_run_id
      )
    end
  from claimed c
  left join public.music_discovery_scan d on d.discovery_scan_id = c.discovery_scan_id
  left join public.music_release_candidate rc on rc.candidate_id = c.candidate_id
  left join public.music_schedule_run sr on sr.schedule_run_id = c.schedule_run_id
  left join public.music_collection_schedule s on s.schedule_id = c.schedule_id;
end;
$$;

alter function public.music_rpc_claim_mb_work(uuid, integer, integer) owner to nrm_music_rpc_owner;

-- Rewrite write_stop predicates in remaining collection RPCs to the always-false helper.
do $$
declare
  r record;
  v_def text;
  v_new text;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'music_rpc_claim_jobs',
        'music_rpc_apply_discovery_page',
        'music_rpc_apply_release_bundle',
        'music_rpc_apply_release_bundle_v2'
      )
  loop
    v_def := pg_get_functiondef(r.sig);
    if v_def is null then
      continue;
    end if;
    v_new := replace(
      v_def,
      'pg_catalog.pg_database_size(pg_catalog.current_database()) >= p.write_stop_bytes',
      'public.music_capacity_blocks_collection_writes()'
    );
    if v_new is distinct from v_def then
      execute v_new;
    end if;
  end loop;
end
$$;

revoke create on schema public from nrm_music_rpc_owner;
