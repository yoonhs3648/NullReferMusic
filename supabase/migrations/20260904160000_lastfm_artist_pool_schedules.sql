-- Last.fm Top-artist pools -> MusicBrainz upcoming-release collection.
-- Four schedules share exclusive enabled artist ownership by schedule priority.

grant usage, create on schema public to nrm_music_rpc_owner;

alter table public.music_collection_schedule
  add column lastfm_method text,
  add column lastfm_param text,
  add column lastfm_limit integer not null default 100,
  add constraint ck_music_collection_schedule_lastfm_method check (
    lastfm_method is null
    or lastfm_method in ('geo.getTopArtists', 'chart.getTopArtists', 'tag.getTopArtists')
  ),
  add constraint ck_music_collection_schedule_lastfm_limit check (
    lastfm_limit between 1 and 1000
  ),
  add constraint ck_music_collection_schedule_lastfm_params check (
    lastfm_method is null
    or (lastfm_method = 'geo.getTopArtists' and nullif(btrim(lastfm_param), '') is not null)
    or (lastfm_method = 'tag.getTopArtists' and nullif(btrim(lastfm_param), '') is not null)
    or (lastfm_method = 'chart.getTopArtists' and lastfm_param is null)
  );

alter table public.music_schedule_run
  add column new_recording_count integer not null default 0,
  drop constraint ck_music_schedule_run_counts,
  add constraint ck_music_schedule_run_counts check (
    request_count >= 0 and discovered_count >= 0 and inserted_count >= 0
    and updated_count >= 0 and duplicate_count >= 0 and failure_count >= 0
    and new_recording_count >= 0
  );

create table public.music_lastfm_artist_pool_fetch (
  fetch_id uuid not null default extensions.gen_random_uuid(),
  schedule_id uuid not null,
  schedule_run_id uuid not null,
  job_id uuid not null,
  lastfm_method text not null,
  lastfm_param text,
  artist_limit integer not null,
  response_hash bytea,
  matched_count integer not null default 0,
  linked_count integer not null default 0,
  created_at timestamptz not null default now(),
  constraint pk_music_lastfm_artist_pool_fetch primary key (fetch_id),
  constraint ux_music_lastfm_artist_pool_fetch_run unique (schedule_run_id),
  constraint fk_music_lastfm_artist_pool_fetch_schedule foreign key (schedule_id)
    references public.music_collection_schedule(schedule_id) on delete restrict,
  constraint fk_music_lastfm_artist_pool_fetch_run foreign key (schedule_run_id)
    references public.music_schedule_run(schedule_run_id) on delete restrict,
  constraint fk_music_lastfm_artist_pool_fetch_job foreign key (job_id)
    references public.music_sync_job(job_id) on delete restrict,
  constraint ck_music_lastfm_artist_pool_fetch_method check (
    lastfm_method in ('geo.getTopArtists', 'chart.getTopArtists', 'tag.getTopArtists')
  ),
  constraint ck_music_lastfm_artist_pool_fetch_params check (
    (lastfm_method = 'geo.getTopArtists' and nullif(btrim(lastfm_param), '') is not null)
    or (lastfm_method = 'tag.getTopArtists' and nullif(btrim(lastfm_param), '') is not null)
    or (lastfm_method = 'chart.getTopArtists' and lastfm_param is null)
  ),
  constraint ck_music_lastfm_artist_pool_fetch_limit check (artist_limit between 1 and 1000),
  constraint ck_music_lastfm_artist_pool_fetch_hash check (
    response_hash is null or pg_catalog.octet_length(response_hash) = 32
  ),
  constraint ck_music_lastfm_artist_pool_fetch_counts check (
    matched_count >= 0 and linked_count >= 0 and linked_count <= matched_count
  )
);

create index ix_music_lastfm_artist_pool_fetch_schedule
  on public.music_lastfm_artist_pool_fetch(schedule_id, created_at desc);
create index ix_music_lastfm_artist_pool_fetch_job
  on public.music_lastfm_artist_pool_fetch(job_id);

alter table public.music_sync_job
  drop constraint ck_music_sync_job_collection_links,
  drop constraint ck_music_sync_job_kind,
  add constraint ck_music_sync_job_kind check (
    job_kind in (
      'mb_lookup','mb_redirect','lastfm_artist_pool','mb_discovery',
      'mb_release_hydrate','mb_recording_hydrate',
      'lastfm_tags','embedding','reconcile'
    )
  ),
  add constraint ck_music_sync_job_collection_links check (
    (job_kind = 'lastfm_artist_pool'
      and schedule_id is not null and schedule_run_id is not null
      and discovery_scan_id is null and candidate_id is null)
    or (job_kind = 'mb_discovery'
      and schedule_id is not null and schedule_run_id is not null
      and discovery_scan_id is not null and candidate_id is null)
    or (job_kind = 'mb_release_hydrate'
      and schedule_id is not null and schedule_run_id is not null
      and candidate_id is not null)
    or job_kind not in ('lastfm_artist_pool','mb_discovery','mb_release_hydrate')
  );

-- Resolve existing cross-schedule ownership before enforcing exclusivity.
with ranked as (
  select
    sa.schedule_id,
    sa.artist_mbid,
    pg_catalog.row_number() over (
      partition by sa.artist_mbid
      order by s.priority, s.schedule_id
    ) as ownership_rank
  from public.music_schedule_artist sa
  join public.music_collection_schedule s on s.schedule_id = sa.schedule_id
  where sa.is_enabled
)
update public.music_schedule_artist sa
set is_enabled = false
from ranked r
where r.schedule_id = sa.schedule_id
  and r.artist_mbid = sa.artist_mbid
  and r.ownership_rank > 1;

create unique index if not exists ux_music_schedule_artist_exclusive_enabled
  on public.music_schedule_artist (artist_mbid)
  where is_enabled;

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
  if p_worker_id is null or p_batch_size not between 1 and 20
     or p_lease_seconds not between 15 and 300 then
    raise exception using errcode = '22023', message = 'invalid schedule claim parameters';
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
    limit p_batch_size
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
      'lastfm_artist_pool','mb_discovery','mb_release_hydrate','mb_recording_hydrate'
    )
      and (
        (j.job_status in ('pending','retry') and j.available_at <= now())
        or (j.job_status = 'processing' and j.lease_until < now())
      )
    order by
      case j.job_kind
        when 'lastfm_artist_pool' then 0
        when 'mb_discovery' then 1
        when 'mb_release_hydrate' then 2
        when 'mb_recording_hydrate' then 3
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
        'secondary_types', s.secondary_types
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
  left join public.music_collection_schedule s on s.schedule_id = c.schedule_id;
end;
$$;

create or replace function public.music_rpc_apply_lastfm_artist_pool(
  p_job_id uuid,
  p_fence_token uuid,
  p_response_hash bytea,
  p_artists jsonb
)
returns table(applied boolean, result_code text, linked_artists integer)
language plpgsql security definer set search_path = ''
as $$
declare
  v_job public.music_sync_job%rowtype;
  v_schedule public.music_collection_schedule%rowtype;
  v_run public.music_schedule_run%rowtype;
  v_item jsonb;
  v_artist_mbid uuid;
  v_other record;
  v_linked integer := 0;
  v_matched integer := 0;
  v_cohort text;
  v_request_key text;
begin
  if p_response_hash is not null and pg_catalog.octet_length(p_response_hash) <> 32 then
    raise exception using errcode = '22023', message = 'invalid Last.fm response hash';
  end if;
  if pg_catalog.jsonb_typeof(p_artists) <> 'array'
     or pg_catalog.jsonb_array_length(p_artists) > 1000 then
    raise exception using errcode = '22023', message = 'invalid Last.fm artist payload';
  end if;
  select * into v_job
  from public.music_sync_job
  where job_id = p_job_id
  for update;
  if not found or v_job.job_kind <> 'lastfm_artist_pool'
     or v_job.job_status <> 'processing'
     or v_job.fence_token is distinct from p_fence_token
     or v_job.lease_until < now() then
    return query select false, 'FENCE_LOST'::text, 0;
    return;
  end if;
  select * into v_schedule
  from public.music_collection_schedule
  where schedule_id = v_job.schedule_id
  for update;
  select * into v_run
  from public.music_schedule_run
  where schedule_run_id = v_job.schedule_run_id
    and schedule_id = v_job.schedule_id
  for update;
  if not found or v_schedule.lastfm_method is null then
    return query select false, 'VERSION_CONFLICT'::text, 0;
    return;
  end if;
  v_cohort := case v_schedule.schedule_key
    when 'musicbrainz-lastfm-korea-top' then 'korea_top'
    when 'musicbrainz-lastfm-global-top' then 'global_top'
    when 'musicbrainz-lastfm-hiphop-top' then 'hiphop_top'
    when 'musicbrainz-lastfm-korean-hiphop-top' then 'korean_hiphop_top'
    else null
  end;
  if v_cohort is null then
    raise exception using errcode = '22023', message = 'unsupported Last.fm schedule key';
  end if;
  insert into public.music_lastfm_artist_pool_fetch(
    schedule_id, schedule_run_id, job_id, lastfm_method, lastfm_param,
    artist_limit, response_hash
  ) values (
    v_schedule.schedule_id, v_run.schedule_run_id, v_job.job_id,
    v_schedule.lastfm_method, v_schedule.lastfm_param,
    v_schedule.lastfm_limit, p_response_hash
  )
  on conflict (schedule_run_id) do update set
    job_id = excluded.job_id,
    lastfm_method = excluded.lastfm_method,
    lastfm_param = excluded.lastfm_param,
    artist_limit = excluded.artist_limit,
    response_hash = excluded.response_hash;

  update public.music_schedule_artist
  set is_enabled = false
  where schedule_id = v_schedule.schedule_id
    and is_enabled;

  select pg_catalog.count(*)::integer
  into v_matched
  from pg_catalog.jsonb_array_elements(p_artists) a(value)
  where nullif(a.value->>'artist_mbid', '') is not null;

  for v_item in
    select a.value
    from pg_catalog.jsonb_array_elements(p_artists) with ordinality a(value, ord)
    order by coalesce((a.value->>'rank')::integer, a.ord::integer), a.ord
  loop
    perform public.music_reject_unknown_keys(v_item, array[
      'rank','name','lastfm_mbid','artist_mbid','match_status','playcount','listeners'
    ]);
    v_artist_mbid := nullif(v_item->>'artist_mbid', '')::uuid;
    if v_artist_mbid is null then
      continue;
    end if;
    if v_linked >= v_schedule.max_artist_count then
      exit;
    end if;
    insert into public.music_artist_allowlist(
      artist_mbid, display_name, cohort, priority, is_enabled,
      verified_at, selection_note
    ) values (
      v_artist_mbid, coalesce(nullif(btrim(v_item->>'name'), ''), v_artist_mbid::text),
      v_cohort, coalesce((v_item->>'rank')::integer, 1000), true, now(),
      'Last.fm ' || v_schedule.lastfm_method || ' pool'
    )
    on conflict (artist_mbid) do update set
      display_name = excluded.display_name,
      cohort = excluded.cohort,
      priority = excluded.priority,
      is_enabled = true,
      verified_at = excluded.verified_at,
      selection_note = excluded.selection_note;

    select sa.schedule_id, s.priority
    into v_other
    from public.music_schedule_artist sa
    join public.music_collection_schedule s on s.schedule_id = sa.schedule_id
    where sa.artist_mbid = v_artist_mbid
      and sa.is_enabled
      and sa.schedule_id <> v_schedule.schedule_id
    order by s.priority, s.schedule_id
    limit 1
    for update of sa;
    if found and v_other.priority < v_schedule.priority then
      continue;
    end if;
    update public.music_schedule_artist
    set is_enabled = false
    where artist_mbid = v_artist_mbid
      and schedule_id <> v_schedule.schedule_id
      and is_enabled;
    insert into public.music_schedule_artist(
      schedule_id, artist_mbid, priority_override, is_enabled
    ) values (
      v_schedule.schedule_id, v_artist_mbid,
      coalesce((v_item->>'rank')::integer, 1000), true
    )
    on conflict (schedule_id, artist_mbid) do update set
      priority_override = excluded.priority_override,
      is_enabled = true;
    v_linked := v_linked + 1;
  end loop;

  update public.music_lastfm_artist_pool_fetch
  set matched_count = v_matched, linked_count = v_linked
  where schedule_run_id = v_run.schedule_run_id;

  insert into public.music_discovery_scan(
    schedule_run_id, schedule_id, artist_mbid, request_key
  )
  select
    v_run.schedule_run_id,
    v_schedule.schedule_id,
    sa.artist_mbid,
    pg_catalog.encode(extensions.digest(
      v_run.schedule_run_id::text || ':' || sa.artist_mbid::text, 'sha256'
    ), 'hex')
  from public.music_schedule_artist sa
  join public.music_artist_allowlist al on al.artist_mbid = sa.artist_mbid
  where sa.schedule_id = v_schedule.schedule_id
    and sa.is_enabled
    and al.is_enabled
  order by coalesce(sa.priority_override, al.priority), sa.artist_mbid
  limit v_schedule.max_artist_count
  on conflict (schedule_run_id, schedule_id, artist_mbid) do nothing;

  insert into public.music_sync_job(
    job_kind, entity_type, entity_id, idempotency_key, priority,
    schedule_id, schedule_run_id, discovery_scan_id
  )
  select
    'mb_discovery', 'artist', d.artist_mbid,
    'discovery:' || d.request_key, v_schedule.priority,
    d.schedule_id, d.schedule_run_id, d.discovery_scan_id
  from public.music_discovery_scan d
  where d.schedule_run_id = v_run.schedule_run_id
  on conflict (idempotency_key) do nothing;

  update public.music_sync_job
  set job_status = 'completed', completed_at = now(),
      lease_until = null, worker_id = null, fence_token = null
  where job_id = p_job_id
    and fence_token = p_fence_token;
  return query select true, 'APPLIED'::text, v_linked;
end;
$$;

create or replace function public.music_rpc_apply_discovery_page(
  p_scan_id uuid, p_fence_token uuid, p_offset integer, p_page_size integer,
  p_total_count integer, p_response_hash bytea, p_candidates jsonb,
  p_is_last_page boolean
)
returns table(applied boolean, result_code text, candidate_count integer, next_offset integer)
language plpgsql security definer set search_path = ''
as $$
declare
  v_scan public.music_discovery_scan%rowtype;
  v_item jsonb;
  v_count integer := 0;
  v_duplicate integer := 0;
  v_candidate_id uuid;
  v_key text;
  v_is_duplicate boolean;
begin
  if p_offset < 0 or p_page_size not between 0 and 100 or p_total_count < 0
     or pg_catalog.octet_length(p_response_hash) <> 32
     or pg_catalog.jsonb_typeof(p_candidates) <> 'array'
     or pg_catalog.jsonb_array_length(p_candidates) > 100 then
    raise exception using errcode = '22023', message = 'invalid discovery page';
  end if;
  if public.music_capacity_blocks_collection_writes() then
    return query select false, 'CAPACITY_WRITE_STOPPED'::text, 0, p_offset;
    return;
  end if;
  select * into v_scan
  from public.music_discovery_scan
  where discovery_scan_id = p_scan_id
  for update;
  if not found or v_scan.scan_status <> 'processing'
     or v_scan.fence_token is distinct from p_fence_token
     or v_scan.lease_until < now() then
    return query select false, 'FENCE_LOST'::text, 0, coalesce(v_scan.next_offset, 0);
    return;
  end if;
  if v_scan.next_offset <> p_offset then
    return query select false, 'VERSION_CONFLICT'::text, 0, v_scan.next_offset;
    return;
  end if;
  for v_item in select value from pg_catalog.jsonb_array_elements(p_candidates)
  loop
    perform public.music_reject_unknown_keys(v_item, array[
      'release_mbid','release_group_mbid','title','release_date_text','release_status',
      'country_code','primary_type','secondary_types'
    ]);
    v_key := pg_catalog.encode(extensions.digest(
      v_scan.schedule_id::text || ':' || (v_item->>'release_mbid'), 'sha256'
    ), 'hex');
    v_is_duplicate :=
      exists (
        select 1 from public.music_release_mbid
        where mbid = (v_item->>'release_mbid')::uuid
      )
      or exists (
        select 1
        from public.music_release_candidate rc
        where rc.release_mbid = (v_item->>'release_mbid')::uuid
          and rc.schedule_id <> v_scan.schedule_id
          and rc.candidate_status in ('queued','hydrating','applied')
      );
    insert into public.music_release_candidate(
      schedule_id, schedule_run_id, discovery_scan_id, artist_mbid,
      release_mbid, release_group_mbid, request_key, title, release_date_text,
      release_status, country_code, primary_type, secondary_types,
      candidate_status, validation_result, queued_at
    ) values (
      v_scan.schedule_id, v_scan.schedule_run_id, v_scan.discovery_scan_id,
      v_scan.artist_mbid, (v_item->>'release_mbid')::uuid,
      nullif(v_item->>'release_group_mbid','')::uuid,
      v_key, nullif(v_item->>'title',''), nullif(v_item->>'release_date_text',''),
      nullif(v_item->>'release_status',''), nullif(v_item->>'country_code',''),
      nullif(v_item->>'primary_type',''),
      coalesce(array(
        select pg_catalog.jsonb_array_elements_text(
          coalesce(v_item->'secondary_types','[]'::jsonb)
        )
      ), '{}'),
      case when v_is_duplicate then 'rejected' else 'queued' end,
      case when v_is_duplicate then 'duplicate' else null end,
      case when v_is_duplicate then null else now() end
    )
    on conflict (schedule_id, release_mbid) do update set
      candidate_status = excluded.candidate_status,
      validation_result = excluded.validation_result,
      queued_at = excluded.queued_at,
      updated_at = now()
    returning candidate_id into v_candidate_id;
    if v_is_duplicate then
      v_duplicate := v_duplicate + 1;
    else
      insert into public.music_sync_job(
        job_kind, entity_type, entity_id, idempotency_key, priority,
        schedule_id, schedule_run_id, candidate_id
      ) values (
        'mb_release_hydrate', 'release', (v_item->>'release_mbid')::uuid,
        'release-hydrate:' || v_key, 0, v_scan.schedule_id,
        v_scan.schedule_run_id, v_candidate_id
      )
      on conflict (idempotency_key) do nothing;
    end if;
    v_count := v_count + 1;
  end loop;
  update public.music_discovery_scan
  set next_offset = p_offset + p_page_size,
      last_page_size = p_page_size,
      total_count = p_total_count,
      page_count = page_count + 1,
      response_hash = p_response_hash,
      scan_status = case when p_is_last_page then 'completed' else 'processing' end,
      completed_at = case when p_is_last_page then now() else null end,
      lease_until = case when p_is_last_page then null else lease_until end
  where discovery_scan_id = p_scan_id;
  update public.music_schedule_run
  set discovered_count = discovered_count + v_count,
      duplicate_count = duplicate_count + v_duplicate
  where schedule_run_id = v_scan.schedule_run_id;
  return query select true, 'APPLIED'::text, v_count, p_offset + p_page_size;
end;
$$;

-- Full durable release apply function with per-run new Recording quota.
create or replace function public.music_rpc_apply_release_bundle_v2(
  p_job_id uuid, p_fence_token uuid, p_payload jsonb
)
returns table(applied boolean, result_code text, candidate_id uuid)
language plpgsql security definer set search_path = ''
as $$
declare
  v_job public.music_sync_job%rowtype;
  v_candidate public.music_release_candidate%rowtype;
  v_run public.music_schedule_run%rowtype;
  v_max_new_recordings integer;
  v_album jsonb; v_release jsonb; v_medium jsonb; v_track jsonb; v_recording jsonb;
  v_credit jsonb; v_alias jsonb;
  v_album_id uuid; v_release_id uuid; v_recording_id uuid; v_track_id uuid; v_artist_id uuid;
  v_album_mbid uuid; v_release_mbid uuid; v_recording_mbid uuid; v_track_mbid uuid;
  v_position integer; v_track_count integer := 0; v_medium_count integer := 0;
  v_inserted integer := 0; v_updated integer := 0;
begin
  perform public.music_reject_unknown_keys(p_payload, array[
    'candidate_id','source_release_mbid','source_release_final_mbid',
    'release_aliases','validation_status','album','release'
  ]);
  if p_payload->>'validation_status' <> 'applied' then
    return query select false, 'INVALID_PAYLOAD'::text, null::uuid; return;
  end if;
  if public.music_capacity_blocks_collection_writes() then
    return query select false, 'CAPACITY_WRITE_STOPPED'::text, null::uuid; return;
  end if;
  select * into v_job from public.music_sync_job where job_id = p_job_id for update;
  if not found or v_job.job_kind <> 'mb_release_hydrate' or v_job.job_status <> 'processing'
     or v_job.fence_token is distinct from p_fence_token or v_job.lease_until < now() then
    return query select false, 'FENCE_LOST'::text, v_job.candidate_id; return;
  end if;
  select * into v_candidate from public.music_release_candidate
    where music_release_candidate.candidate_id = v_job.candidate_id for update;
  if (p_payload->>'candidate_id')::uuid is distinct from v_job.candidate_id
     or (p_payload->>'source_release_mbid')::uuid is distinct from v_candidate.release_mbid then
    return query select false, 'INVALID_PAYLOAD'::text, v_job.candidate_id; return;
  end if;
  select r.* into v_run
  from public.music_schedule_run r
  where r.schedule_run_id = v_job.schedule_run_id
  for update;
  select s.max_new_recording_count into v_max_new_recordings
  from public.music_collection_schedule s
  where s.schedule_id = v_job.schedule_id;
  if not found or v_run.new_recording_count >= v_max_new_recordings then
    update public.music_release_candidate
    set candidate_status = 'rejected', validation_result = 'quota_reached', updated_at = now()
    where music_release_candidate.candidate_id = v_job.candidate_id;
    update public.music_sync_job
    set job_status = 'completed', completed_at = now(), lease_until = null,
        worker_id = null
    where music_sync_job.job_id = p_job_id and fence_token = p_fence_token;
    return query select true, 'QUOTA_REACHED'::text, v_job.candidate_id; return;
  end if;
  v_album := p_payload->'album';
  v_release := p_payload->'release';
  perform public.music_reject_unknown_keys(v_album, array[
    'mbid','aliases','title','disambiguation','primary_type','secondary_types',
    'first_release_date_text','artist_credit','tags','genres'
  ]);
  perform public.music_reject_unknown_keys(v_release, array[
    'mbid','title','status','quality','packaging','country_code','release_date_text',
    'barcode','text_language','text_script','artist_credit','tags','genres','media'
  ]);
  if pg_catalog.jsonb_typeof(v_album->'artist_credit') <> 'array'
     or pg_catalog.jsonb_array_length(v_album->'artist_credit') = 0
     or pg_catalog.jsonb_typeof(v_release->'artist_credit') <> 'array'
     or pg_catalog.jsonb_array_length(v_release->'artist_credit') = 0
     or pg_catalog.jsonb_typeof(v_release->'media') <> 'array' then
    return query select false, 'INVALID_PAYLOAD'::text, v_job.candidate_id; return;
  end if;

  v_album_mbid := (v_album->>'mbid')::uuid;
  for v_credit in select value from pg_catalog.jsonb_array_elements(v_album->'artist_credit')
  loop
    v_artist_id := public.music_worker_upsert_artist(v_credit);
    exit;
  end loop;
  select album_id into v_album_id from public.music_album_mbid where mbid = v_album_mbid for update;
  if v_album_id is null then
    insert into public.music_album(
      canonical_mbid, title, disambiguation, primary_type, secondary_types,
      artist_credit_name, primary_artist_id, first_release_date_text, last_mb_verified_at
    ) values (
      v_album_mbid, v_album->>'title', nullif(v_album->>'disambiguation',''),
      nullif(v_album->>'primary_type',''),
      coalesce(array(select pg_catalog.jsonb_array_elements_text(v_album->'secondary_types')), '{}'),
      v_album->'artist_credit'->0->>'credited_name', v_artist_id,
      nullif(v_album->>'first_release_date_text',''), now()
    ) returning album_id into v_album_id;
    insert into public.music_album_mbid(
      mbid, album_id, identifier_status, is_canonical, resolved_mbid,
      last_checked_at, last_http_status
    ) values (v_album_mbid, v_album_id, 'current', true, v_album_mbid, now(), 200);
    v_inserted := v_inserted + 1;
  else
    update public.music_album set
      title = v_album->>'title', disambiguation = nullif(v_album->>'disambiguation',''),
      primary_type = nullif(v_album->>'primary_type',''),
      secondary_types = coalesce(array(
        select pg_catalog.jsonb_array_elements_text(v_album->'secondary_types')
      ), '{}'),
      artist_credit_name = v_album->'artist_credit'->0->>'credited_name',
      primary_artist_id = v_artist_id,
      first_release_date_text = nullif(v_album->>'first_release_date_text',''),
      last_mb_verified_at = now(), row_version = row_version + 1
    where album_id = v_album_id and entity_status = 'active';
    v_updated := v_updated + 1;
  end if;
  delete from public.music_album_artist_credit where album_id = v_album_id;
  v_position := 0;
  for v_credit in select value from pg_catalog.jsonb_array_elements(v_album->'artist_credit')
  loop
    v_artist_id := public.music_worker_upsert_artist(v_credit);
    insert into public.music_album_artist_credit(
      album_id, position, artist_id, credited_name, join_phrase
    ) values (
      v_album_id, v_position, v_artist_id, v_credit->>'credited_name',
      coalesce(v_credit->>'join_phrase','')
    );
    v_position := v_position + 1;
  end loop;
  perform public.music_worker_upsert_tags('album', v_album_id, v_album->'tags', v_album->'genres');
  for v_alias in
    select value from pg_catalog.jsonb_array_elements(coalesce(v_album->'aliases','[]'::jsonb))
  loop
    perform public.music_reject_unknown_keys(v_alias, array['mbid','redirect_target_mbid']);
    if exists (
      select 1 from public.music_album_mbid
      where mbid = (v_alias->>'mbid')::uuid and album_id <> v_album_id
    ) then
      return query select false, 'QUARANTINED'::text, v_job.candidate_id; return;
    end if;
    insert into public.music_album_mbid(
      mbid, album_id, identifier_status, is_canonical, redirect_target_mbid,
      resolved_mbid, last_checked_at, redirect_detected_at, last_http_status
    ) values (
      (v_alias->>'mbid')::uuid, v_album_id, 'redirected', false,
      (v_alias->>'redirect_target_mbid')::uuid, v_album_mbid, now(), now(), 301
    ) on conflict (mbid) do update set
      identifier_status = 'redirected', is_canonical = false,
      redirect_target_mbid = excluded.redirect_target_mbid,
      resolved_mbid = excluded.resolved_mbid, last_checked_at = now(), last_http_status = 301;
  end loop;

  v_release_mbid := (v_release->>'mbid')::uuid;
  select release_id into v_release_id from public.music_release_mbid where mbid = v_release_mbid for update;
  update public.music_release set is_representative = false, retired_at = now()
  where album_id = v_album_id and is_representative
    and (v_release_id is null or release_id <> v_release_id);
  select pg_catalog.count(*), coalesce(pg_catalog.sum(pg_catalog.jsonb_array_length(value->'tracks')), 0)
  into v_medium_count, v_track_count
  from pg_catalog.jsonb_array_elements(v_release->'media');
  if v_release_id is null then
    insert into public.music_release(
      album_id, canonical_mbid, title, artist_credit_name, status, quality, packaging,
      country_code, release_date_text, barcode, text_language, text_script,
      track_count, medium_count, is_representative, selection_score
    ) values (
      v_album_id, v_release_mbid, v_release->>'title',
      v_release->'artist_credit'->0->>'credited_name', nullif(v_release->>'status',''),
      nullif(v_release->>'quality',''), nullif(v_release->>'packaging',''),
      nullif(v_release->>'country_code',''), nullif(v_release->>'release_date_text',''),
      nullif(v_release->>'barcode',''), nullif(v_release->>'text_language',''),
      nullif(v_release->>'text_script',''), v_track_count, v_medium_count, true, 0
    ) returning release_id into v_release_id;
    insert into public.music_release_mbid(
      mbid, release_id, identifier_status, is_canonical, resolved_mbid,
      last_checked_at, last_http_status
    ) values (v_release_mbid, v_release_id, 'current', true, v_release_mbid, now(), 200);
    v_inserted := v_inserted + 1;
  else
    if exists (
      select 1 from public.music_release
      where release_id = v_release_id and album_id <> v_album_id
    ) then
      return query select false, 'QUARANTINED'::text, v_job.candidate_id; return;
    end if;
    update public.music_release set
      title = v_release->>'title',
      artist_credit_name = v_release->'artist_credit'->0->>'credited_name',
      status = nullif(v_release->>'status',''), quality = nullif(v_release->>'quality',''),
      packaging = nullif(v_release->>'packaging',''),
      country_code = nullif(v_release->>'country_code',''),
      release_date_text = nullif(v_release->>'release_date_text',''),
      barcode = nullif(v_release->>'barcode',''),
      text_language = nullif(v_release->>'text_language',''),
      text_script = nullif(v_release->>'text_script',''),
      track_count = v_track_count, medium_count = v_medium_count,
      is_representative = true, retired_at = null, selected_at = now(),
      row_version = row_version + 1
    where release_id = v_release_id;
    v_updated := v_updated + 1;
  end if;
  delete from public.music_release_artist_credit where release_id = v_release_id;
  v_position := 0;
  for v_credit in select value from pg_catalog.jsonb_array_elements(v_release->'artist_credit')
  loop
    v_artist_id := public.music_worker_upsert_artist(v_credit);
    insert into public.music_release_artist_credit(
      release_id, position, artist_id, credited_name, join_phrase
    ) values (
      v_release_id, v_position, v_artist_id, v_credit->>'credited_name',
      coalesce(v_credit->>'join_phrase','')
    );
    v_position := v_position + 1;
  end loop;
  perform public.music_worker_upsert_tags('release', v_release_id, v_release->'tags', v_release->'genres');

  for v_medium in select value from pg_catalog.jsonb_array_elements(v_release->'media')
  loop
    perform public.music_reject_unknown_keys(v_medium, array['position','title','format','tracks']);
    for v_track in select value from pg_catalog.jsonb_array_elements(v_medium->'tracks')
    loop
      perform public.music_reject_unknown_keys(v_track, array[
        'mbid','position','number','title','length_ms','artist_credit','recording'
      ]);
      v_recording := v_track->'recording';
      perform public.music_reject_unknown_keys(v_recording, array[
        'mbid','title','disambiguation','length_ms','video',
        'first_release_date_text','artist_credit'
      ]);
      v_recording_mbid := (v_recording->>'mbid')::uuid;
      select recording_id into v_recording_id
      from public.music_recording_mbid
      where mbid = v_recording_mbid
      for update;
      v_artist_id := public.music_worker_upsert_artist(v_recording->'artist_credit'->0);
      if v_recording_id is null then
        select * into v_run
        from public.music_schedule_run
        where schedule_run_id = v_job.schedule_run_id
        for update;
        if v_run.new_recording_count >= v_max_new_recordings then
          continue;
        end if;
        insert into public.music_recording(
          canonical_mbid, title, disambiguation, artist_credit_name, primary_artist_id,
          length_ms, is_video, first_release_date_text, last_mb_verified_at
        ) values (
          v_recording_mbid, v_recording->>'title',
          nullif(v_recording->>'disambiguation',''),
          v_recording->'artist_credit'->0->>'credited_name', v_artist_id,
          (v_recording->>'length_ms')::integer,
          coalesce((v_recording->>'video')::boolean, false),
          nullif(v_recording->>'first_release_date_text',''), now()
        ) returning recording_id into v_recording_id;
        insert into public.music_recording_mbid(
          mbid, recording_id, identifier_status, is_canonical, resolved_mbid,
          last_checked_at, last_http_status
        ) values (
          v_recording_mbid, v_recording_id, 'current', true,
          v_recording_mbid, now(), 200
        );
        update public.music_schedule_run
        set new_recording_count = new_recording_count + 1
        where schedule_run_id = v_job.schedule_run_id
        returning new_recording_count into v_run.new_recording_count;
        v_inserted := v_inserted + 1;
      end if;
      if v_recording_id is null then
        continue;
      end if;
      v_track_mbid := (v_track->>'mbid')::uuid;
      select track_id into v_track_id
      from public.music_track_mbid
      where mbid = v_track_mbid
      for update;
      if v_track_id is null then
        select track_id into v_track_id
        from public.music_track
        where release_id = v_release_id
          and medium_position = (v_medium->>'position')::integer
          and track_position = (v_track->>'position')::integer
        for update;
      end if;
      if v_track_id is null then
        insert into public.music_track(
          release_id, album_id, recording_id, canonical_mbid, source_recording_mbid,
          medium_position, medium_title, medium_format, track_position, track_number,
          title, length_ms, artist_credit_name
        ) values (
          v_release_id, v_album_id, v_recording_id, v_track_mbid, v_recording_mbid,
          (v_medium->>'position')::integer, nullif(v_medium->>'title',''),
          nullif(v_medium->>'format',''), (v_track->>'position')::integer,
          v_track->>'number', v_track->>'title', (v_track->>'length_ms')::integer,
          v_track->'artist_credit'->0->>'credited_name'
        ) returning track_id into v_track_id;
        insert into public.music_track_mbid(
          mbid, track_id, identifier_status, is_canonical, resolved_mbid,
          last_checked_at, last_http_status
        ) values (v_track_mbid, v_track_id, 'current', true, v_track_mbid, now(), 200);
      else
        if exists (
          select 1 from public.music_track
          where track_id = v_track_id and (
            release_id <> v_release_id
            or medium_position <> (v_medium->>'position')::integer
            or track_position <> (v_track->>'position')::integer
          )
        ) then
          return query select false, 'QUARANTINED'::text, v_job.candidate_id; return;
        end if;
        update public.music_track_mbid
        set identifier_status = 'unresolved', is_canonical = false, resolved_mbid = null
        where track_id = v_track_id and is_canonical and mbid <> v_track_mbid;
        insert into public.music_track_mbid(
          mbid, track_id, identifier_status, is_canonical, resolved_mbid,
          last_checked_at, last_http_status
        ) values (
          v_track_mbid, v_track_id, 'current', true, v_track_mbid, now(), 200
        )
        on conflict (mbid) do update set
          identifier_status = 'current', is_canonical = true,
          redirect_target_mbid = null, resolved_mbid = excluded.mbid,
          last_checked_at = now(), last_http_status = 200;
        update public.music_track set
          canonical_mbid = v_track_mbid,
          recording_id = v_recording_id,
          source_recording_mbid = v_recording_mbid,
          medium_title = nullif(v_medium->>'title',''),
          medium_format = nullif(v_medium->>'format',''),
          track_number = v_track->>'number',
          title = v_track->>'title',
          length_ms = (v_track->>'length_ms')::integer,
          artist_credit_name = v_track->'artist_credit'->0->>'credited_name',
          entity_status = 'active'
        where track_id = v_track_id;
      end if;
      delete from public.music_track_artist_credit where track_id = v_track_id;
      v_position := 0;
      for v_credit in select value from pg_catalog.jsonb_array_elements(v_track->'artist_credit')
      loop
        v_artist_id := public.music_worker_upsert_artist(v_credit);
        insert into public.music_track_artist_credit(
          track_id, position, artist_id, credited_name, join_phrase
        ) values (
          v_track_id, v_position, v_artist_id, v_credit->>'credited_name',
          coalesce(v_credit->>'join_phrase','')
        );
        v_position := v_position + 1;
      end loop;
      insert into public.music_sync_job(
        job_kind, entity_type, entity_id, idempotency_key, priority,
        schedule_id, schedule_run_id, candidate_id
      ) values (
        'mb_recording_hydrate', 'recording', v_recording_mbid,
        'recording-hydrate:' || v_recording_mbid::text || ':' ||
          pg_catalog.to_char(now() at time zone 'UTC', 'YYYY-MM-DD'),
        -10, v_job.schedule_id, v_job.schedule_run_id, v_job.candidate_id
      )
      on conflict (idempotency_key) do nothing;
    end loop;
  end loop;

  update public.music_track_mbid tm
  set identifier_status = 'unresolved', is_canonical = false, resolved_mbid = null
  from public.music_track t
  where t.track_id = tm.track_id and t.release_id = v_release_id and tm.is_canonical
    and not exists (
      select 1
      from pg_catalog.jsonb_array_elements(v_release->'media') m,
           pg_catalog.jsonb_array_elements(m->'tracks') tr
      where (m->>'position')::integer = t.medium_position
        and (tr->>'position')::integer = t.track_position
    );
  update public.music_track t
  set entity_status = 'deleted', canonical_mbid = null
  where t.release_id = v_release_id
    and not exists (
      select 1
      from pg_catalog.jsonb_array_elements(v_release->'media') m,
           pg_catalog.jsonb_array_elements(m->'tracks') tr
      where (m->>'position')::integer = t.medium_position
        and (tr->>'position')::integer = t.track_position
    );

  for v_alias in
    select value
    from pg_catalog.jsonb_array_elements(coalesce(p_payload->'release_aliases','[]'::jsonb))
  loop
    perform public.music_reject_unknown_keys(v_alias, array['mbid','redirect_target_mbid']);
    if exists (
      select 1 from public.music_release_mbid
      where mbid = (v_alias->>'mbid')::uuid and release_id <> v_release_id
    ) then
      return query select false, 'QUARANTINED'::text, v_job.candidate_id; return;
    end if;
    insert into public.music_release_mbid(
      mbid, release_id, identifier_status, is_canonical, redirect_target_mbid,
      resolved_mbid, last_checked_at, redirect_detected_at, last_http_status
    ) values (
      (v_alias->>'mbid')::uuid, v_release_id, 'redirected', false,
      (v_alias->>'redirect_target_mbid')::uuid, v_release_mbid, now(), now(), 301
    )
    on conflict (mbid) do update set
      identifier_status = 'redirected', is_canonical = false,
      redirect_target_mbid = excluded.redirect_target_mbid,
      resolved_mbid = excluded.resolved_mbid,
      last_checked_at = now(), last_http_status = 301;
  end loop;
  update public.music_release_candidate
  set release_group_mbid = v_album_mbid,
      representative_release_mbid = v_release_mbid,
      validation_result = 'applied',
      candidate_status = 'applied',
      applied_at = now()
  where music_release_candidate.candidate_id = v_job.candidate_id;
  update public.music_schedule_run
  set inserted_count = inserted_count + v_inserted,
      updated_count = updated_count + v_updated
  where schedule_run_id = v_job.schedule_run_id;
  update public.music_sync_job
  set job_status = 'completed', completed_at = now(),
      lease_until = null, worker_id = null
  where music_sync_job.job_id = p_job_id and fence_token = p_fence_token;
  return query select true, 'APPLIED'::text, v_job.candidate_id;
end;
$$;

-- Migrate the three historical schedules, then seed the fourth.
-- Evaluate old keys from a VALUES join so SET schedule_key does not poison later CASE arms.
update public.music_collection_schedule m
set
  schedule_key = v.new_key,
  display_name = v.display_name,
  lastfm_method = v.lastfm_method,
  lastfm_param = v.lastfm_param,
  lastfm_limit = 100,
  max_artist_count = 100,
  max_new_recording_count = 1000,
  max_request_count = 45,
  priority = v.priority,
  schedule_kind = 'daily',
  daily_time_kst = v.daily_time_kst,
  next_run_at = public.nrm_system_schedule_next_daily_run(v.daily_time_kst, now()),
  interval_minutes = null,
  date_from_offset_days = 0,
  date_to_offset_days = 365,
  release_statuses = array['Official']::text[],
  is_enabled = true,
  last_disabled_reason = null
from (
  values
    (
      'musicbrainz-k-pop-daily',
      'musicbrainz-lastfm-korea-top',
      '한국 Top 아티스트 발매예정',
      'geo.getTopArtists',
      'Korea, Republic of',
      20,
      time '09:00'
    ),
    (
      'musicbrainz-korean-hip-hop-daily',
      'musicbrainz-lastfm-korean-hiphop-top',
      '한국 힙합 Top 아티스트 발매예정',
      'tag.getTopArtists',
      'korean hip hop',
      10,
      time '10:00'
    ),
    (
      'musicbrainz-global-chart-daily',
      'musicbrainz-lastfm-global-top',
      '글로벌 Top 아티스트 발매예정',
      'chart.getTopArtists',
      null::text,
      40,
      time '11:00'
    )
) as v(old_key, new_key, display_name, lastfm_method, lastfm_param, priority, daily_time_kst)
where m.schedule_key = v.old_key;

insert into public.music_collection_schedule(
  schedule_key, display_name, schedule_kind, daily_time_kst, interval_minutes,
  next_run_at, is_enabled, date_from_offset_days, date_to_offset_days,
  release_statuses, max_artist_count, max_request_count, max_new_recording_count,
  priority, lastfm_method, lastfm_param, lastfm_limit
)
select
  'musicbrainz-lastfm-hiphop-top', '힙합 Top 아티스트 발매예정',
  'daily', time '10:30', null,
  public.nrm_system_schedule_next_daily_run(time '10:30', now()),
  true, 0, 365, array['Official']::text[], 100, 45, 1000,
  30, 'tag.getTopArtists', 'hip-hop', 100
where not exists (
  select 1 from public.music_collection_schedule
  where schedule_key = 'musicbrainz-lastfm-hiphop-top'
);

update public.music_schedule_artist
set is_enabled = false
where schedule_id in (
  select schedule_id
  from public.music_collection_schedule
  where schedule_key in (
    'musicbrainz-lastfm-korea-top',
    'musicbrainz-lastfm-korean-hiphop-top',
    'musicbrainz-lastfm-hiphop-top',
    'musicbrainz-lastfm-global-top'
  )
);

update public.nrm_system_schedule ns
set
  schedule_key = v.new_key,
  display_name = v.display_name
from (
  values
    ('musicbrainz-k-pop-daily', 'musicbrainz-lastfm-korea-top', '한국 Top 아티스트 발매예정'),
    ('musicbrainz-korean-hip-hop-daily', 'musicbrainz-lastfm-korean-hiphop-top', '한국 힙합 Top 아티스트 발매예정'),
    ('musicbrainz-global-chart-daily', 'musicbrainz-lastfm-global-top', '글로벌 Top 아티스트 발매예정')
) as v(old_key, new_key, display_name)
where ns.schedule_key = v.old_key;

update public.nrm_system_schedule ns
set display_name = ms.display_name,
    is_enabled = ms.is_enabled,
    schedule_kind = ms.schedule_kind,
    daily_time_kst = ms.daily_time_kst,
    interval_minutes = ms.interval_minutes,
    next_run_at = ms.next_run_at,
    config = pg_catalog.jsonb_build_object('music_schedule_id', ms.schedule_id)
from public.music_collection_schedule ms
where ns.job_kind = 'musicbrainz_collection'
  and ns.schedule_key = ms.schedule_key
  and ms.schedule_key in (
    'musicbrainz-lastfm-korea-top',
    'musicbrainz-lastfm-korean-hiphop-top',
    'musicbrainz-lastfm-global-top'
  );

insert into public.nrm_system_schedule(
  schedule_key, display_name, job_kind, is_enabled, schedule_kind,
  daily_time_kst, interval_minutes, next_run_at, config
)
select
  ms.schedule_key, ms.display_name, 'musicbrainz_collection',
  ms.is_enabled, ms.schedule_kind, ms.daily_time_kst, ms.interval_minutes,
  ms.next_run_at, pg_catalog.jsonb_build_object('music_schedule_id', ms.schedule_id)
from public.music_collection_schedule ms
where ms.schedule_key = 'musicbrainz-lastfm-hiphop-top'
on conflict (schedule_key) do update set
  display_name = excluded.display_name,
  job_kind = excluded.job_kind,
  is_enabled = excluded.is_enabled,
  schedule_kind = excluded.schedule_kind,
  daily_time_kst = excluded.daily_time_kst,
  interval_minutes = excluded.interval_minutes,
  next_run_at = excluded.next_run_at,
  config = excluded.config;

alter table public.music_lastfm_artist_pool_fetch enable row level security;
create policy pl_music_lastfm_artist_pool_fetch_music_rpc_owner
  on public.music_lastfm_artist_pool_fetch
  for all to nrm_music_rpc_owner
  using (true) with check (true);

grant select, insert, update, delete on table
  public.music_lastfm_artist_pool_fetch
to nrm_music_rpc_owner;
revoke all on table public.music_lastfm_artist_pool_fetch
  from public, anon, authenticated;

alter function public.music_rpc_claim_due_schedules(uuid, integer, integer)
  owner to nrm_music_rpc_owner;
alter function public.music_rpc_claim_mb_work(uuid, integer, integer)
  owner to nrm_music_rpc_owner;
alter function public.music_rpc_apply_lastfm_artist_pool(uuid, uuid, bytea, jsonb)
  owner to nrm_music_rpc_owner;
alter function public.music_rpc_apply_discovery_page(
  uuid, uuid, integer, integer, integer, bytea, jsonb, boolean
) owner to nrm_music_rpc_owner;
alter function public.music_rpc_apply_release_bundle_v2(uuid, uuid, jsonb)
  owner to nrm_music_rpc_owner;

revoke all on function public.music_rpc_apply_lastfm_artist_pool(uuid, uuid, bytea, jsonb)
  from public, anon, authenticated;
grant execute on function public.music_rpc_apply_lastfm_artist_pool(uuid, uuid, bytea, jsonb)
  to service_role;

comment on table public.music_lastfm_artist_pool_fetch is
  'Last.fm Top 아티스트 pool 응답의 실행별 해시·매칭·연결 집계';
comment on column public.music_collection_schedule.lastfm_method is
  'Last.fm Top artist API method';
comment on column public.music_collection_schedule.lastfm_param is
  'geo country 또는 tag 이름; chart method는 NULL';
comment on column public.music_collection_schedule.lastfm_limit is
  'Last.fm pool에서 요청할 최대 아티스트 수';
comment on column public.music_schedule_run.new_recording_count is
  '해당 스케줄 실행에서 새로 생성한 Recording 수';
comment on column public.music_lastfm_artist_pool_fetch.fetch_id is 'Pool fetch 내부 UUID';
comment on column public.music_lastfm_artist_pool_fetch.schedule_id is '수집 스케줄 FK';
comment on column public.music_lastfm_artist_pool_fetch.schedule_run_id is '스케줄 실행 FK; 실행당 하나';
comment on column public.music_lastfm_artist_pool_fetch.job_id is 'lastfm_artist_pool 작업 FK';
comment on column public.music_lastfm_artist_pool_fetch.lastfm_method is '호출한 Last.fm method';
comment on column public.music_lastfm_artist_pool_fetch.lastfm_param is '호출 country/tag parameter';
comment on column public.music_lastfm_artist_pool_fetch.artist_limit is '호출 시 artist limit';
comment on column public.music_lastfm_artist_pool_fetch.response_hash is '정규화 응답 SHA-256';
comment on column public.music_lastfm_artist_pool_fetch.matched_count is 'MusicBrainz MBID 매칭 수';
comment on column public.music_lastfm_artist_pool_fetch.linked_count is '현재 스케줄에 배타 연결된 수';
comment on column public.music_lastfm_artist_pool_fetch.created_at is '적용 시각';
comment on function public.music_rpc_apply_lastfm_artist_pool(uuid, uuid, bytea, jsonb) is
  'Last.fm artist pool을 배타 schedule artist로 적용하고 MB discovery를 생성';

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
      'lastfm_artist_pool','mb_discovery','mb_release_hydrate','mb_recording_hydrate'
    )
      and job_status in ('pending','processing','retry')
  );
end;
$$;

alter function public.music_rpc_finalize_mb_runs(uuid) owner to nrm_music_rpc_owner;

revoke create on schema public from nrm_music_rpc_owner;
