-- catalog: Last.fm 리스트를 모두 받은 뒤에만 MusicBrainz job을 큐잉한다.
-- claim은 Last.fm → MusicBrainz 한 곡씩 → Last.fm 태그 순. 다른 스케줄/verify는 실행 중 run을 끼어들지 않는다.

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
      'lastfm_artist_pool', 'lastfm_track_pool', 'lastfm_tag_refresh', 'lastfm_tags',
      'mb_discovery', 'mb_release_hydrate', 'mb_recording_hydrate',
      'mb_catalog_track_resolve'
    )
      and job_status in ('pending', 'processing', 'retry')
  );
$$;

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
  if public.music_collection_is_busy() then
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

create or replace function public.music_rpc_apply_lastfm_track_pool_page(
  p_job_id uuid,
  p_fence_token uuid,
  p_page integer,
  p_page_size integer,
  p_response_hash bytea,
  p_tracks jsonb,
  p_is_last_page boolean
)
returns table(applied boolean, result_code text, continue_page boolean, next_page integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.music_sync_job%rowtype;
  v_schedule public.music_collection_schedule%rowtype;
  v_run public.music_schedule_run%rowtype;
  v_fetch public.music_lastfm_track_pool_fetch%rowtype;
  v_budget record;
  v_item jsonb;
  v_identity text;
  v_other record;
  v_existing uuid;
  v_queued integer := 0;
  v_last boolean := p_is_last_page;
begin
  if p_page < 1 or p_page_size not between 1 and 50
     or pg_catalog.jsonb_typeof(p_tracks) <> 'array'
     or pg_catalog.jsonb_array_length(p_tracks) > 50
     or pg_catalog.octet_length(p_response_hash) <> 32 then
    raise exception using errcode = '22023', message = 'invalid Last.fm track page';
  end if;
  select * into v_job from public.music_sync_job where job_id = p_job_id for update;
  if not found or v_job.job_kind <> 'lastfm_track_pool'
     or v_job.job_status <> 'processing'
     or v_job.fence_token is distinct from p_fence_token
     or v_job.lease_until < now() then
    return query select false, 'FENCE_LOST'::text, false, p_page;
    return;
  end if;
  select * into v_schedule
  from public.music_collection_schedule
  where schedule_id = v_job.schedule_id
  for update;
  select * into v_run
  from public.music_schedule_run
  where schedule_run_id = v_job.schedule_run_id
  for update;
  if not found or v_schedule.collection_mode <> 'catalog' then
    return query select false, 'VERSION_CONFLICT'::text, false, p_page;
    return;
  end if;

  select * into v_fetch
  from public.music_lastfm_track_pool_fetch
  where schedule_run_id = v_job.schedule_run_id
  for update;
  if not found then
    select * into v_budget from public.music_rpc_catalog_capacity_budget();
    insert into public.music_lastfm_track_pool_fetch(
      schedule_id, schedule_run_id, job_id, lastfm_method, lastfm_param,
      page_size, track_limit, next_page, growth_budget, bytes_per_track, remaining_bytes
    ) values (
      v_schedule.schedule_id, v_run.schedule_run_id, v_job.job_id,
      v_schedule.lastfm_method, v_schedule.lastfm_param,
      p_page_size,
      greatest(
        v_budget.track_limit,
        (
          select count(*)::integer
          from public.music_schedule_catalog_recording m
          where m.schedule_id = v_schedule.schedule_id
            and m.is_enabled
            and m.membership_status in ('pending', 'active')
        )
      ),
      p_page, v_budget.growth_budget, v_budget.bytes_per_track, v_budget.remaining_bytes
    )
    returning * into v_fetch;
  elsif v_fetch.next_page <> p_page then
    return query select false, 'VERSION_CONFLICT'::text, false, v_fetch.next_page;
    return;
  end if;

  if v_fetch.track_limit = 0 then
    v_last := true;
  end if;

  for v_item in
    select value
    from pg_catalog.jsonb_array_elements(p_tracks) with ordinality a(value, ord)
    order by coalesce((a.value->>'rank')::integer, a.ord::integer), a.ord
  loop
    perform public.music_reject_unknown_keys(v_item, array[
      'rank','artist_name','track_title','identity_key','lastfm_mbid',
      'artist_mbid','playcount','listeners'
    ]);
    if v_fetch.fetched_count >= v_fetch.track_limit then
      v_last := true;
      exit;
    end if;
    v_identity := v_item->>'identity_key';
    if v_identity is null or v_identity !~ '^[0-9a-f]{64}$' then
      continue;
    end if;
    v_fetch.fetched_count := v_fetch.fetched_count + 1;
    insert into public.music_catalog_track_candidate(
      schedule_id, schedule_run_id, identity_key, chart_rank,
      artist_name, track_title, lastfm_mbid, lastfm_playcount, lastfm_listeners
    ) values (
      v_schedule.schedule_id, v_run.schedule_run_id, v_identity,
      greatest(1, least(5000, coalesce(nullif((v_item->>'rank')::integer, 0), v_fetch.fetched_count))),
      v_item->>'artist_name', v_item->>'track_title',
      nullif(v_item->>'lastfm_mbid', '')::uuid,
      nullif(v_item->>'playcount', '')::bigint,
      nullif(v_item->>'listeners', '')::bigint
    )
    on conflict (schedule_run_id, identity_key) do nothing;

    select m.schedule_id, s.priority, m.recording_id
    into v_other
    from public.music_schedule_catalog_recording m
    join public.music_collection_schedule s on s.schedule_id = m.schedule_id
    where m.identity_key = v_identity
      and m.is_enabled
      and m.membership_status in ('pending', 'active')
      and m.schedule_id <> v_schedule.schedule_id
    order by s.priority, s.schedule_id
    limit 1
    for update of m;
    if found and v_other.priority < v_schedule.priority then
      update public.music_catalog_track_candidate
      set match_status = 'skipped_exclusive', candidate_status = 'skipped', updated_at = now()
      where schedule_run_id = v_run.schedule_run_id and identity_key = v_identity;
      continue;
    end if;

    select m.recording_id into v_existing
    from public.music_schedule_catalog_recording m
    where m.schedule_id = v_schedule.schedule_id
      and m.identity_key = v_identity
      and m.membership_status in ('pending', 'active')
    limit 1;
    if v_existing is not null then
      update public.music_schedule_catalog_recording
      set last_seen_run_id = v_run.schedule_run_id,
          chart_rank = greatest(1, least(5000, coalesce(nullif((v_item->>'rank')::integer, 0), chart_rank, 1))),
          membership_status = 'active',
          is_enabled = true,
          updated_at = now()
      where schedule_id = v_schedule.schedule_id
        and identity_key = v_identity
        and recording_id = v_existing;
      update public.music_catalog_track_candidate
      set recording_id = v_existing,
          match_status = 'applied',
          candidate_status = 'applied',
          updated_at = now()
      where schedule_run_id = v_run.schedule_run_id and identity_key = v_identity;
    end if;
  end loop;

  if pg_catalog.jsonb_array_length(p_tracks) = 0 then
    v_last := true;
  end if;

  if v_last then
    insert into public.music_sync_job(
      job_kind, entity_type, entity_id, idempotency_key, priority,
      schedule_id, schedule_run_id
    )
    select
      'mb_catalog_track_resolve', 'recording', c.candidate_id,
      'catalog-resolve:' || v_run.schedule_run_id::text || ':' || c.identity_key,
      v_schedule.priority, v_schedule.schedule_id, v_run.schedule_run_id
    from public.music_catalog_track_candidate c
    where c.schedule_run_id = v_run.schedule_run_id
      and c.candidate_status = 'queued'
    order by c.chart_rank, c.created_at, c.candidate_id
    on conflict (idempotency_key) do nothing;
    get diagnostics v_queued = row_count;
  end if;

  update public.music_lastfm_track_pool_fetch as f
  set fetched_count = v_fetch.fetched_count,
      queued_count = f.queued_count + v_queued,
      next_page = case when v_last then f.next_page else p_page + 1 end,
      snapshot_complete = v_last,
      response_hash = p_response_hash,
      job_id = v_job.job_id,
      updated_at = now()
  where f.schedule_run_id = v_run.schedule_run_id;

  if v_last then
    update public.music_sync_job
    set job_status = 'completed', completed_at = now(),
        lease_until = null, worker_id = null, fence_token = null
    where job_id = p_job_id and fence_token = p_fence_token;
    return query select true, 'APPLIED'::text, false, p_page;
  else
    return query select true, 'APPLIED'::text, true, p_page + 1;
  end if;
end;
$$;

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
  if exists (
    select 1 from public.music_capacity_policy p
    where p.policy_key = 'project1' and p.is_enabled
      and pg_catalog.pg_database_size(pg_catalog.current_database()) >= p.write_stop_bytes
  ) then
    return;
  end if;
  return query
  with picked as (
    select j.job_id
    from public.music_sync_job j
    left join public.music_catalog_track_candidate cc
      on cc.candidate_id = j.entity_id
     and j.job_kind = 'mb_catalog_track_resolve'
    where j.job_kind in (
        'lastfm_artist_pool','lastfm_track_pool','mb_catalog_track_resolve',
        'lastfm_tag_refresh','lastfm_tags','mb_discovery','mb_release_hydrate',
        'mb_recording_hydrate','mb_upcoming_verify'
      )
      and (
        (j.job_status in ('pending','retry') and j.available_at <= now())
        or (j.job_status = 'processing' and j.lease_until < now())
      )
      and not (
        j.job_kind = 'mb_catalog_track_resolve'
        and exists (
          select 1 from public.music_sync_job p
          where p.schedule_run_id is not distinct from j.schedule_run_id
            and p.job_kind = 'lastfm_track_pool'
            and p.job_status in ('pending','processing','retry')
        )
      )
      and not (
        j.job_kind = 'lastfm_tags'
        and exists (
          select 1 from public.music_sync_job p
          where p.schedule_run_id is not distinct from j.schedule_run_id
            and p.job_kind = 'mb_catalog_track_resolve'
            and p.job_status in ('pending','processing','retry')
        )
      )
      and not (
        j.job_kind = 'mb_upcoming_verify'
        and exists (
          select 1 from public.music_sync_job p
          where p.job_kind in (
            'lastfm_artist_pool','lastfm_track_pool','lastfm_tag_refresh','lastfm_tags',
            'mb_catalog_track_resolve','mb_discovery','mb_release_hydrate','mb_recording_hydrate'
          )
            and p.job_status in ('pending','processing','retry')
        )
      )
    order by
      case j.job_kind
        when 'lastfm_track_pool' then 1
        when 'lastfm_artist_pool' then 1
        when 'mb_catalog_track_resolve' then 2
        when 'lastfm_tags' then 3
        when 'lastfm_tag_refresh' then 4
        when 'mb_discovery' then 5
        when 'mb_release_hydrate' then 6
        when 'mb_recording_hydrate' then 7
        when 'mb_upcoming_verify' then 8
      end,
      case when j.job_status in ('retry', 'processing') then 0 else 1 end,
      j.priority desc,
      coalesce(cc.chart_rank, 2147483647),
      j.available_at, j.created_at, j.job_id
    for update of j skip locked
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
      when c.job_kind = 'lastfm_track_pool' then pg_catalog.jsonb_build_object(
        'schedule_id', c.schedule_id,
        'schedule_run_id', c.schedule_run_id,
        'schedule_key', s.schedule_key,
        'lastfm_method', s.lastfm_method,
        'lastfm_param', s.lastfm_param,
        'page', coalesce(tf.next_page, 1),
        'page_size', coalesce(tf.page_size, 50),
        'track_limit', coalesce(tf.track_limit, (
          select b.track_limit from public.music_rpc_catalog_capacity_budget() b
        )),
        'priority', s.priority
      )
      when c.job_kind = 'lastfm_tag_refresh' then pg_catalog.jsonb_build_object(
        'schedule_id', c.schedule_id,
        'schedule_run_id', c.schedule_run_id,
        'after_recording_id', tr.after_recording_id
      )
      when c.job_kind = 'mb_catalog_track_resolve' then pg_catalog.jsonb_build_object(
        'candidate_id', cc.candidate_id,
        'artist_name', cc.artist_name,
        'track_title', cc.track_title,
        'lastfm_mbid', cc.lastfm_mbid,
        'identity_key', cc.identity_key,
        'chart_rank', cc.chart_rank
      )
      when c.job_kind = 'lastfm_tags' then pg_catalog.jsonb_build_object(
        'recording_id', c.entity_id,
        'canonical_mbid', rec.canonical_mbid,
        'artist_name', rec.artist_credit_name,
        'track_title', rec.title
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
    and c.job_kind = 'mb_upcoming_verify'
  left join public.music_lastfm_track_pool_fetch tf on tf.schedule_run_id = c.schedule_run_id
    and c.job_kind = 'lastfm_track_pool'
  left join public.music_lastfm_tag_refresh_state tr on tr.schedule_run_id = c.schedule_run_id
    and c.job_kind = 'lastfm_tag_refresh'
  left join public.music_catalog_track_candidate cc on cc.candidate_id = c.entity_id
    and c.job_kind = 'mb_catalog_track_resolve'
  left join public.music_recording rec on rec.recording_id = c.entity_id
    and c.job_kind = 'lastfm_tags';
end;
$$;

alter function public.music_collection_is_busy() owner to nrm_music_rpc_owner;
alter function public.music_rpc_enqueue_upcoming_verify_batch(integer) owner to nrm_music_rpc_owner;
alter function public.music_rpc_apply_lastfm_track_pool_page(uuid, uuid, integer, integer, bytea, jsonb, boolean)
  owner to nrm_music_rpc_owner;
alter function public.music_rpc_claim_mb_work(uuid, integer, integer) owner to nrm_music_rpc_owner;

revoke all on function public.music_collection_is_busy() from public, anon, authenticated;
revoke all on function public.music_rpc_enqueue_upcoming_verify_batch(integer) from public, anon, authenticated;
revoke all on function public.music_rpc_apply_lastfm_track_pool_page(uuid, uuid, integer, integer, bytea, jsonb, boolean)
  from public, anon, authenticated;
revoke all on function public.music_rpc_claim_mb_work(uuid, integer, integer) from public, anon, authenticated;

grant execute on function public.music_collection_is_busy() to service_role, nrm_music_rpc_owner;
grant execute on function public.music_rpc_enqueue_upcoming_verify_batch(integer) to service_role;
grant execute on function public.music_rpc_apply_lastfm_track_pool_page(uuid, uuid, integer, integer, bytea, jsonb, boolean)
  to service_role;
grant execute on function public.music_rpc_claim_mb_work(uuid, integer, integer) to service_role;

comment on function public.music_collection_is_busy() is
  '실행 중 collection run 또는 Last.fm/MusicBrainz/태그 수집 job이 있으면 busy. upcoming verify는 넣지 않는다';
comment on function public.music_rpc_enqueue_upcoming_verify_batch(integer) is
  '수집이 busy면 0건. 실행 중인 스케줄 큐를 끼어들지 않는다';
comment on function public.music_rpc_apply_lastfm_track_pool_page(uuid, uuid, integer, integer, bytea, jsonb, boolean) is
  'Last.fm Top Tracks 페이지를 적재한다. MusicBrainz resolve job은 snapshot이 끝난 뒤에만 큐잉한다';
comment on function public.music_rpc_claim_mb_work(uuid, integer, integer) is
  'Last.fm 리스트 → catalog MusicBrainz 한 곡 → Last.fm 태그 순. 같은 곡 retry를 pending보다 먼저 집는다';
