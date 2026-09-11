-- Upcoming verify enqueue + claim context (apply_target) + verify result RPC.
-- Promote reuses mb_release_hydrate → music_rpc_apply_release_bundle_v2 (ledger).

grant usage, create on schema public to nrm_music_rpc_owner;

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
      'lastfm_artist_pool', 'mb_discovery', 'mb_release_hydrate', 'mb_recording_hydrate',
      'mb_upcoming_verify'
    )
      and job_status in ('pending', 'processing', 'retry')
  );
$$;

alter function public.music_collection_is_busy() owner to nrm_music_rpc_owner;
revoke all on function public.music_collection_is_busy() from public, anon, authenticated;
grant execute on function public.music_collection_is_busy() to service_role, nrm_music_rpc_owner;

create or replace function public.music_rpc_enqueue_upcoming_verify_batch(
  p_limit integer default 20
)
returns table(enqueued integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
  v_today date := (timezone('Asia/Seoul', now()))::date;
  v_count integer := 0;
  v_inserted integer;
  v_row record;
begin
  if public.music_capacity_blocks_collection_writes() then
    return query select 0;
    return;
  end if;

  for v_row in
    select u.upcoming_id, u.release_mbid
    from public.music_upcoming_release u
    where u.staging_status in ('watching', 'deferred')
      and (
        public.music_partial_date_end(u.release_date_text) is null
        or public.music_partial_date_end(u.release_date_text) <= v_today
        or u.last_verified_at is null
        or u.last_verified_at < now() - interval '20 hours'
      )
      and not exists (
        select 1
        from public.music_sync_job j
        where j.job_kind = 'mb_upcoming_verify'
          and j.entity_id = u.release_mbid
          and j.job_status in ('pending', 'processing', 'retry')
      )
    order by
      case when public.music_partial_date_end(u.release_date_text) <= v_today then 0 else 1 end,
      u.last_verified_at nulls first,
      u.updated_at
    limit v_limit
  loop
    insert into public.music_sync_job(
      job_kind, entity_type, entity_id, idempotency_key, priority
    ) values (
      'mb_upcoming_verify', 'release', v_row.release_mbid,
      'upcoming-verify:' || v_row.upcoming_id::text || ':' ||
        pg_catalog.to_char(timezone('Asia/Seoul', now()), 'YYYY-MM-DD'),
      5
    )
    on conflict (idempotency_key) do nothing;
    get diagnostics v_inserted = row_count;
    v_count := v_count + v_inserted;
  end loop;

  return query select v_count;
end;
$$;

alter function public.music_rpc_enqueue_upcoming_verify_batch(integer)
  owner to nrm_music_rpc_owner;
revoke all on function public.music_rpc_enqueue_upcoming_verify_batch(integer)
  from public, anon, authenticated;
grant execute on function public.music_rpc_enqueue_upcoming_verify_batch(integer)
  to service_role;

create or replace function public.music_rpc_apply_upcoming_verify_result(
  p_job_id uuid,
  p_fence_token uuid,
  p_payload jsonb
)
returns table(applied boolean, result_code text, upcoming_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.music_sync_job%rowtype;
  v_row public.music_upcoming_release%rowtype;
  v_outcome text;
  v_today date := (timezone('Asia/Seoul', now()))::date;
  v_date_end date;
  v_candidate_id uuid;
  v_request_key text;
  v_new_date text;
  v_status text;
  v_run_id uuid;
  v_fence uuid := extensions.gen_random_uuid();
begin
  perform public.music_reject_unknown_keys(p_payload, array[
    'release_mbid','title','artist_credit_name','release_group_mbid',
    'release_date_text','release_status','country_code','primary_type',
    'secondary_types','http_status','outcome_hint'
  ]);

  select * into v_job from public.music_sync_job where job_id = p_job_id for update;
  if not found or v_job.job_kind <> 'mb_upcoming_verify' or v_job.job_status <> 'processing'
     or v_job.fence_token is distinct from p_fence_token or v_job.lease_until < now() then
    return query select false, 'FENCE_LOST'::text, null::uuid;
    return;
  end if;

  select * into v_row
  from public.music_upcoming_release
  where release_mbid = coalesce((p_payload->>'release_mbid')::uuid, v_job.entity_id)
  for update;
  if not found then
    update public.music_sync_job
    set job_status = 'completed', completed_at = now(), lease_until = null, worker_id = null
    where job_id = p_job_id and fence_token = p_fence_token;
    return query select true, 'ALREADY_GONE'::text, null::uuid;
    return;
  end if;

  if v_row.staging_status in ('promoted', 'promote_queued', 'cancelled') then
    update public.music_sync_job
    set job_status = 'completed', completed_at = now(), lease_until = null, worker_id = null
    where job_id = p_job_id and fence_token = p_fence_token;
    return query select true, 'SKIP_' || upper(v_row.staging_status), v_row.upcoming_id;
    return;
  end if;

  v_outcome := nullif(p_payload->>'outcome_hint', '');
  if v_outcome = 'not_found' or coalesce((p_payload->>'http_status')::integer, 200) = 404 then
    delete from public.music_upcoming_release where upcoming_id = v_row.upcoming_id;
    update public.music_sync_job
    set job_status = 'completed', completed_at = now(), lease_until = null, worker_id = null
    where job_id = p_job_id and fence_token = p_fence_token;
    return query select true, 'CANCELLED_REMOVED'::text, v_row.upcoming_id;
    return;
  end if;

  v_status := lower(coalesce(nullif(p_payload->>'release_status', ''), ''));
  if v_status in ('cancelled', 'withdrawn', 'deleted') then
    delete from public.music_upcoming_release where upcoming_id = v_row.upcoming_id;
    update public.music_sync_job
    set job_status = 'completed', completed_at = now(), lease_until = null, worker_id = null
    where job_id = p_job_id and fence_token = p_fence_token;
    return query select true, 'CANCELLED_REMOVED'::text, v_row.upcoming_id;
    return;
  end if;

  v_new_date := nullif(btrim(coalesce(p_payload->>'release_date_text', '')), '');
  update public.music_upcoming_release set
    title = coalesce(nullif(btrim(p_payload->>'title'), ''), title),
    artist_credit_name = case
      when nullif(btrim(p_payload->>'artist_credit_name'), '') is not null
        then btrim(p_payload->>'artist_credit_name')
      else artist_credit_name
    end,
    release_group_mbid = coalesce(nullif(p_payload->>'release_group_mbid','')::uuid, release_group_mbid),
    release_date_text = coalesce(v_new_date, release_date_text),
    release_status = coalesce(nullif(p_payload->>'release_status',''), release_status),
    country_code = coalesce(nullif(p_payload->>'country_code',''), country_code),
    primary_type = coalesce(nullif(p_payload->>'primary_type',''), primary_type),
    secondary_types = case
      when pg_catalog.jsonb_typeof(p_payload->'secondary_types') = 'array'
           and pg_catalog.jsonb_array_length(p_payload->'secondary_types') > 0
        then array(select jsonb_array_elements_text(p_payload->'secondary_types'))
      else secondary_types
    end,
    last_verified_at = now(),
    last_mb_http_status = coalesce((p_payload->>'http_status')::integer, 200),
    last_verify_note = null,
    updated_at = now()
  where upcoming_id = v_row.upcoming_id
  returning * into v_row;

  v_date_end := public.music_partial_date_end(v_row.release_date_text);

  if v_date_end is not null and v_date_end > v_today then
    update public.music_upcoming_release
    set staging_status = 'watching',
        last_verify_note = 'still_upcoming'
    where upcoming_id = v_row.upcoming_id;
    update public.music_sync_job
    set job_status = 'completed', completed_at = now(), lease_until = null, worker_id = null
    where job_id = p_job_id and fence_token = p_fence_token;
    return query select true, 'STILL_UPCOMING'::text, v_row.upcoming_id;
    return;
  end if;

  if v_date_end is null then
    update public.music_upcoming_release
    set staging_status = 'deferred',
        last_verify_note = 'date_unknown'
    where upcoming_id = v_row.upcoming_id;
    update public.music_sync_job
    set job_status = 'completed', completed_at = now(), lease_until = null, worker_id = null
    where job_id = p_job_id and fence_token = p_fence_token;
    return query select true, 'DEFERRED_NO_DATE'::text, v_row.upcoming_id;
    return;
  end if;

  -- Past/today → create promote run + hydrate job (ledger apply_target).
  insert into public.music_schedule_run(
    schedule_id, request_key, run_status, fence_token, worker_id, lease_until,
    date_from, date_to
  ) values (
    v_row.schedule_id,
    'upcoming-promote-run:' || v_row.upcoming_id::text,
    'running',
    v_fence,
    '00000000-0000-0000-0000-0000000000f1',
    now() + interval '2 hours',
    v_today - 30,
    v_today + 7
  )
  on conflict (request_key) do update set
    run_status = 'running',
    fence_token = excluded.fence_token,
    worker_id = excluded.worker_id,
    lease_until = excluded.lease_until,
    finished_at = null,
    error_message = null
  returning schedule_run_id into v_run_id;

  v_request_key := pg_catalog.encode(extensions.digest(
    'promote:' || v_row.schedule_id::text || ':' || v_row.release_mbid::text, 'sha256'
  ), 'hex');

  insert into public.music_release_candidate(
    schedule_id, schedule_run_id, discovery_scan_id, artist_mbid,
    release_mbid, release_group_mbid, request_key, title, release_date_text,
    release_status, country_code, primary_type, secondary_types,
    candidate_status, validation_result, queued_at
  ) values (
    v_row.schedule_id, v_run_id, null, v_row.artist_mbid,
    v_row.release_mbid, v_row.release_group_mbid, v_request_key,
    v_row.title, v_row.release_date_text, v_row.release_status, v_row.country_code,
    v_row.primary_type, v_row.secondary_types,
    'queued', 'promote_from_upcoming', now()
  )
  on conflict (schedule_id, release_mbid) do update set
    schedule_run_id = excluded.schedule_run_id,
    candidate_status = 'queued',
    validation_result = 'promote_from_upcoming',
    release_group_mbid = coalesce(excluded.release_group_mbid, music_release_candidate.release_group_mbid),
    title = excluded.title,
    release_date_text = excluded.release_date_text,
    release_status = excluded.release_status,
    queued_at = now(),
    updated_at = now()
  returning candidate_id into v_candidate_id;

  insert into public.music_sync_job(
    job_kind, entity_type, entity_id, idempotency_key, priority,
    schedule_id, schedule_run_id, candidate_id
  ) values (
    'mb_release_hydrate', 'release', v_row.release_mbid,
    'upcoming-promote:' || v_row.upcoming_id::text, 8,
    v_row.schedule_id, v_run_id, v_candidate_id
  )
  on conflict (idempotency_key) do nothing;

  update public.music_upcoming_release
  set staging_status = 'promote_queued',
      last_schedule_run_id = v_run_id,
      last_verify_note = 'queued_promote'
  where upcoming_id = v_row.upcoming_id;

  update public.music_sync_job
  set job_status = 'completed', completed_at = now(), lease_until = null, worker_id = null
  where job_id = p_job_id and fence_token = p_fence_token;

  return query select true, 'PROMOTE_QUEUED'::text, v_row.upcoming_id;
end;
$$;

alter function public.music_rpc_apply_upcoming_verify_result(uuid, uuid, jsonb)
  owner to nrm_music_rpc_owner;
revoke all on function public.music_rpc_apply_upcoming_verify_result(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.music_rpc_apply_upcoming_verify_result(uuid, uuid, jsonb)
  to service_role;

create or replace function public.music_rpc_mark_upcoming_promoted(
  p_release_mbid uuid
)
returns table(applied boolean, result_code text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.music_upcoming_release
  set staging_status = 'promoted',
      promoted_at = now(),
      last_verified_at = now(),
      last_verify_note = 'promoted_to_ledger',
      updated_at = now()
  where release_mbid = p_release_mbid
    and staging_status in ('promote_queued', 'watching', 'deferred');

  update public.music_schedule_run r
  set run_status = case when r.failure_count > 0 then 'partial' else 'completed' end,
      finished_at = coalesce(r.finished_at, now()),
      lease_until = now()
  where r.request_key = (
    select 'upcoming-promote-run:' || u.upcoming_id::text
    from public.music_upcoming_release u
    where u.release_mbid = p_release_mbid
    limit 1
  )
  and r.run_status = 'running';

  return query select true, 'MARKED'::text;
end;
$$;

alter function public.music_rpc_mark_upcoming_promoted(uuid)
  owner to nrm_music_rpc_owner;
revoke all on function public.music_rpc_mark_upcoming_promoted(uuid)
  from public, anon, authenticated;
grant execute on function public.music_rpc_mark_upcoming_promoted(uuid)
  to service_role;

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
    where j.job_kind in (
      'lastfm_artist_pool','mb_discovery','mb_release_hydrate','mb_recording_hydrate',
      'mb_upcoming_verify'
    )
      and (
        (j.job_status in ('pending','retry') and j.available_at <= now())
        or (j.job_status = 'processing' and j.lease_until < now())
      )
    order by
      case j.job_kind
        when 'mb_upcoming_verify' then 0
        when 'lastfm_artist_pool' then 1
        when 'mb_discovery' then 2
        when 'mb_release_hydrate' then 3
        when 'mb_recording_hydrate' then 4
      end,
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
      when c.job_kind = 'lastfm_artist_pool' then pg_catalog.jsonb_build_object(
        'schedule_id', c.schedule_id,
        'schedule_run_id', c.schedule_run_id,
        'schedule_key', s.schedule_key,
        'lastfm_method', s.lastfm_method,
        'lastfm_param', s.lastfm_param,
        'lastfm_limit', s.lastfm_limit,
        'max_artist_count', s.max_artist_count,
        'priority', s.priority
      )
      when c.job_kind = 'mb_discovery' then pg_catalog.jsonb_build_object(
        'discovery_scan_id', d.discovery_scan_id,
        'artist_mbid', d.artist_mbid,
        'next_offset', d.next_offset,
        'date_from', sr.date_from,
        'date_to', sr.date_to
      )
      when c.job_kind = 'mb_release_hydrate' then pg_catalog.jsonb_build_object(
        'candidate_id', rc.candidate_id,
        'release_mbid', rc.release_mbid,
        'artist_mbid', rc.artist_mbid,
        'date_from', sr.date_from,
        'date_to', sr.date_to,
        'country_codes', s.country_codes,
        'release_statuses', s.release_statuses,
        'primary_types', s.primary_types,
        'secondary_types', s.secondary_types,
        'collection_mode', coalesce(s.collection_mode, 'upcoming'),
        'apply_target', case
          when rc.validation_result = 'promote_from_upcoming' then 'ledger'
          when coalesce(s.collection_mode, 'upcoming') = 'catalog' then 'ledger'
          else 'staging'
        end
      )
      when c.job_kind = 'mb_upcoming_verify' then pg_catalog.jsonb_build_object(
        'release_mbid', c.entity_id,
        'upcoming_id', u.upcoming_id,
        'title', u.title,
        'artist_mbid', u.artist_mbid
      )
      else pg_catalog.jsonb_build_object(
        'recording_mbid', c.entity_id,
        'schedule_run_id', c.schedule_run_id
      )
    end
  from claimed c
  left join public.music_discovery_scan d on d.discovery_scan_id = c.discovery_scan_id
  left join public.music_release_candidate rc on rc.candidate_id = c.candidate_id
  left join public.music_schedule_run sr on sr.schedule_run_id = c.schedule_run_id
  left join public.music_collection_schedule s on s.schedule_id = c.schedule_id
  left join public.music_upcoming_release u on u.release_mbid = c.entity_id
    and c.job_kind = 'mb_upcoming_verify';
end;
$$;

alter function public.music_rpc_claim_mb_work(uuid, integer, integer)
  owner to nrm_music_rpc_owner;
revoke all on function public.music_rpc_claim_mb_work(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.music_rpc_claim_mb_work(uuid, integer, integer)
  to service_role;

-- When ledger apply completes a promote candidate, mark staging promoted atomically.
create or replace function public.music_trg_mark_upcoming_on_promote_apply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.candidate_status = 'applied'
     and old.validation_result = 'promote_from_upcoming'
     and old.candidate_status is distinct from 'applied' then
    update public.music_upcoming_release
    set staging_status = 'promoted',
        promoted_at = now(),
        last_verified_at = now(),
        last_verify_note = 'promoted_to_ledger',
        updated_at = now()
    where release_mbid = new.release_mbid
      and staging_status in ('promote_queued', 'watching', 'deferred');
  end if;
  return new;
end;
$$;

alter function public.music_trg_mark_upcoming_on_promote_apply() owner to nrm_music_rpc_owner;

drop trigger if exists trg_music_release_candidate_upcoming_promote
  on public.music_release_candidate;
create trigger trg_music_release_candidate_upcoming_promote
  after update of candidate_status, validation_result on public.music_release_candidate
  for each row
  execute function public.music_trg_mark_upcoming_on_promote_apply();

create or replace function public.music_rpc_finalize_mb_runs(p_worker_id uuid)
returns table(has_more boolean)
language plpgsql security definer set search_path = ''
as $$
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
  update public.music_collection_schedule s
    set claimed_until = null, claim_fence_token = null, claimed_by = null
  where exists (
    select 1 from public.music_schedule_run r
    where r.schedule_id = s.schedule_id and r.run_status <> 'running'
      and r.fence_token = s.claim_fence_token
  );
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

-- Drop unused promote job kind from constraint (keep verify only).
alter table public.music_sync_job drop constraint if exists ck_music_sync_job_kind;
alter table public.music_sync_job
  add constraint ck_music_sync_job_kind check (job_kind in (
    'mb_lookup','mb_redirect','lastfm_artist_pool','mb_discovery',
    'mb_release_hydrate','mb_recording_hydrate','mb_upcoming_verify',
    'lastfm_tags','embedding','reconcile'
  ));

revoke create on schema public from nrm_music_rpc_owner;
