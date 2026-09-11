-- Historical catalog collection: four exclusive Top-Tracks schedules, dynamic
-- capacity budget, ledger-direct persist of the chart recording only, Last.fm tags.
-- Does not change upcoming-staging schedules.

grant usage, create on schema public to nrm_music_rpc_owner;

alter table public.music_collection_schedule
  drop constraint if exists ck_music_collection_schedule_lastfm_method,
  drop constraint if exists ck_music_collection_schedule_lastfm_limit,
  drop constraint if exists ck_music_collection_schedule_lastfm_params;

alter table public.music_collection_schedule
  add constraint ck_music_collection_schedule_lastfm_method check (
    lastfm_method is null
    or lastfm_method in (
      'geo.getTopArtists', 'chart.getTopArtists', 'tag.getTopArtists',
      'geo.getTopTracks', 'chart.getTopTracks', 'tag.getTopTracks'
    )
  ),
  add constraint ck_music_collection_schedule_lastfm_limit check (
    lastfm_limit between 1 and 5000
  ),
  add constraint ck_music_collection_schedule_lastfm_params check (
    lastfm_method is null
    or (lastfm_method in ('geo.getTopArtists', 'geo.getTopTracks')
      and nullif(btrim(lastfm_param), '') is not null)
    or (lastfm_method in ('tag.getTopArtists', 'tag.getTopTracks')
      and nullif(btrim(lastfm_param), '') is not null)
    or (lastfm_method in ('chart.getTopArtists', 'chart.getTopTracks')
      and lastfm_param is null)
  );

create table public.music_lastfm_track_pool_fetch (
  fetch_id uuid not null default extensions.gen_random_uuid(),
  schedule_id uuid not null,
  schedule_run_id uuid not null,
  job_id uuid not null,
  lastfm_method text not null,
  lastfm_param text,
  page_size integer not null default 50,
  track_limit integer not null,
  next_page integer not null default 1,
  fetched_count integer not null default 0,
  queued_count integer not null default 0,
  growth_budget integer not null default 0,
  bytes_per_track bigint not null default 32768,
  remaining_bytes bigint not null default 0,
  snapshot_complete boolean not null default false,
  committed_at timestamptz,
  response_hash bytea,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pk_music_lastfm_track_pool_fetch primary key (fetch_id),
  constraint ux_music_lastfm_track_pool_fetch_run unique (schedule_run_id),
  constraint fk_music_lastfm_track_pool_fetch_schedule foreign key (schedule_id)
    references public.music_collection_schedule(schedule_id) on delete restrict,
  constraint fk_music_lastfm_track_pool_fetch_run foreign key (schedule_run_id)
    references public.music_schedule_run(schedule_run_id) on delete restrict,
  constraint fk_music_lastfm_track_pool_fetch_job foreign key (job_id)
    references public.music_sync_job(job_id) on delete restrict,
  constraint ck_music_lastfm_track_pool_fetch_method check (
    lastfm_method in ('geo.getTopTracks', 'chart.getTopTracks', 'tag.getTopTracks')
  ),
  constraint ck_music_lastfm_track_pool_fetch_params check (
    (lastfm_method = 'geo.getTopTracks' and nullif(btrim(lastfm_param), '') is not null)
    or (lastfm_method = 'tag.getTopTracks' and nullif(btrim(lastfm_param), '') is not null)
    or (lastfm_method = 'chart.getTopTracks' and lastfm_param is null)
  ),
  constraint ck_music_lastfm_track_pool_fetch_page check (
    page_size between 1 and 50 and next_page between 1 and 200
    and track_limit between 0 and 5000
    and fetched_count >= 0 and queued_count >= 0
    and growth_budget >= 0 and bytes_per_track >= 1024
    and remaining_bytes >= 0
  ),
  constraint ck_music_lastfm_track_pool_fetch_hash check (
    response_hash is null or pg_catalog.octet_length(response_hash) = 32
  )
);

create table public.music_catalog_track_candidate (
  candidate_id uuid not null default extensions.gen_random_uuid(),
  schedule_id uuid not null,
  schedule_run_id uuid not null,
  identity_key text not null,
  chart_rank integer not null,
  artist_name text not null,
  track_title text not null,
  lastfm_mbid uuid,
  lastfm_playcount bigint,
  lastfm_listeners bigint,
  recording_mbid uuid,
  recording_id uuid,
  match_status text not null default 'pending',
  candidate_status text not null default 'queued',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pk_music_catalog_track_candidate primary key (candidate_id),
  constraint ux_music_catalog_track_candidate_run_identity unique (schedule_run_id, identity_key),
  constraint fk_music_catalog_track_candidate_schedule foreign key (schedule_id)
    references public.music_collection_schedule(schedule_id) on delete restrict,
  constraint fk_music_catalog_track_candidate_run foreign key (schedule_run_id)
    references public.music_schedule_run(schedule_run_id) on delete restrict,
  constraint fk_music_catalog_track_candidate_recording foreign key (recording_id)
    references public.music_recording(recording_id) on delete restrict,
  constraint ck_music_catalog_track_candidate_identity check (identity_key ~ '^[0-9a-f]{64}$'),
  constraint ck_music_catalog_track_candidate_rank check (chart_rank between 1 and 5000),
  constraint ck_music_catalog_track_candidate_names check (
    btrim(artist_name) <> '' and btrim(track_title) <> ''
  ),
  constraint ck_music_catalog_track_candidate_match check (
    match_status in (
      'pending','lastfm_mbid','mb_search','unmatched','skipped_exclusive',
      'quota_skipped','applied','rejected'
    )
  ),
  constraint ck_music_catalog_track_candidate_status check (
    candidate_status in ('queued','hydrating','applied','skipped','rejected')
  )
);

create table public.music_schedule_catalog_recording (
  schedule_id uuid not null,
  recording_id uuid not null,
  identity_key text not null,
  chart_rank integer,
  membership_status text not null default 'pending',
  is_enabled boolean not null default true,
  last_seen_run_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pk_music_schedule_catalog_recording primary key (schedule_id, recording_id),
  constraint fk_music_schedule_catalog_recording_schedule foreign key (schedule_id)
    references public.music_collection_schedule(schedule_id) on delete restrict,
  constraint fk_music_schedule_catalog_recording_recording foreign key (recording_id)
    references public.music_recording(recording_id) on delete restrict,
  constraint fk_music_schedule_catalog_recording_run foreign key (last_seen_run_id)
    references public.music_schedule_run(schedule_run_id) on delete restrict,
  constraint ck_music_schedule_catalog_recording_identity check (identity_key ~ '^[0-9a-f]{64}$'),
  constraint ck_music_schedule_catalog_recording_status check (
    membership_status in ('pending','active','retired')
  )
);

create unique index ux_music_schedule_catalog_recording_exclusive
  on public.music_schedule_catalog_recording (recording_id)
  where is_enabled and membership_status in ('pending', 'active');

create index ix_music_lastfm_track_pool_fetch_schedule
  on public.music_lastfm_track_pool_fetch (schedule_id, created_at desc);
create index ix_music_catalog_track_candidate_run
  on public.music_catalog_track_candidate (schedule_run_id, chart_rank);
create index ix_music_schedule_catalog_recording_identity
  on public.music_schedule_catalog_recording (identity_key)
  where is_enabled and membership_status in ('pending', 'active');
create index ix_music_schedule_catalog_recording_status
  on public.music_schedule_catalog_recording (schedule_id, membership_status, is_enabled);

comment on table public.music_lastfm_track_pool_fetch is
  'catalog 스케줄 run의 Last.fm Top Tracks 페이지 커서와 동적 용량 예산';
comment on table public.music_catalog_track_candidate is
  '차트에 오른 곡 후보. 원장 Recording으로 resolve되기 전 상태';
comment on table public.music_schedule_catalog_recording is
  '스케줄이 소유한 catalog Recording. 전 스케줄 배타(활성 행 UNIQUE)';

alter table public.music_sync_job
  drop constraint if exists ck_music_sync_job_kind,
  drop constraint if exists ck_music_sync_job_collection_links;

alter table public.music_sync_job
  add constraint ck_music_sync_job_kind check (job_kind in (
    'mb_lookup','mb_redirect','lastfm_artist_pool','lastfm_track_pool',
    'mb_discovery','mb_release_hydrate','mb_recording_hydrate',
    'mb_catalog_track_resolve','mb_upcoming_verify',
    'lastfm_tags','embedding','reconcile'
  )),
  add constraint ck_music_sync_job_collection_links check (
    (job_kind = 'lastfm_artist_pool'
      and schedule_id is not null and schedule_run_id is not null
      and discovery_scan_id is null and candidate_id is null)
    or (job_kind = 'lastfm_track_pool'
      and schedule_id is not null and schedule_run_id is not null
      and discovery_scan_id is null and candidate_id is null)
    or (job_kind = 'mb_discovery'
      and schedule_id is not null and schedule_run_id is not null
      and discovery_scan_id is not null and candidate_id is null)
    or (job_kind = 'mb_release_hydrate'
      and schedule_id is not null and schedule_run_id is not null
      and candidate_id is not null)
    or (job_kind = 'mb_catalog_track_resolve'
      and schedule_id is not null and schedule_run_id is not null
      and discovery_scan_id is null and candidate_id is null)
    or (job_kind = 'lastfm_tags'
      and discovery_scan_id is null and candidate_id is null
      and ((schedule_id is null and schedule_run_id is null)
        or (schedule_id is not null and schedule_run_id is not null)))
    or job_kind not in (
      'lastfm_artist_pool','lastfm_track_pool','mb_discovery',
      'mb_release_hydrate','mb_catalog_track_resolve','lastfm_tags'
    )
  );

do $$
declare v_table text;
begin
  foreach v_table in array array[
    'music_lastfm_track_pool_fetch',
    'music_catalog_track_candidate',
    'music_schedule_catalog_recording'
  ] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('revoke all on table public.%I from public, anon, authenticated', v_table);
    execute format(
      'create policy %I on public.%I for all to nrm_music_rpc_owner using (true) with check (true)',
      'pl_' || v_table || '_music_rpc_owner', v_table
    );
  end loop;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'lastfm_tag_fetch_attempt'
      and policyname = 'pl_lastfm_tag_fetch_attempt_music_rpc_owner'
  ) then
    execute 'alter table public.lastfm_tag_fetch_attempt enable row level security';
    execute $p$
      create policy pl_lastfm_tag_fetch_attempt_music_rpc_owner
        on public.lastfm_tag_fetch_attempt
        for all to nrm_music_rpc_owner using (true) with check (true)
    $p$;
  end if;
end
$$;

create or replace function public.music_collection_pool_job_kind(p_mode text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_mode = 'catalog' then 'lastfm_track_pool' else 'lastfm_artist_pool' end;
$$;

create or replace function public.music_rpc_catalog_capacity_budget()
returns table(
  database_bytes bigint,
  stop_bytes bigint,
  remaining_bytes bigint,
  bytes_per_track bigint,
  member_count integer,
  track_limit integer,
  growth_budget integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_policy public.music_capacity_policy%rowtype;
  v_bytes bigint;
  v_stop bigint;
  v_remaining bigint;
  v_bpt bigint;
  v_members integer;
  v_limit integer;
begin
  select * into v_policy
  from public.music_capacity_policy
  where policy_key = 'project1';
  v_bytes := pg_catalog.pg_database_size(pg_catalog.current_database());
  v_stop := coalesce(v_policy.disable_discovery_bytes, 471859200);
  v_remaining := greatest(0, v_stop - (8 * 1024 * 1024) - v_bytes);
  select count(*)::integer
  into v_members
  from public.music_schedule_catalog_recording
  where is_enabled and membership_status in ('pending', 'active');
  if v_members >= 20 then
    v_bpt := greatest(
      16384,
      (pg_catalog.pg_total_relation_size('public.music_recording'::regclass)
        + pg_catalog.pg_total_relation_size('public.music_track'::regclass)
        + pg_catalog.pg_total_relation_size('public.music_release'::regclass)
        + pg_catalog.pg_total_relation_size('public.music_album'::regclass)
        + pg_catalog.pg_total_relation_size('public.lastfm_recording_tag'::regclass)
      ) / greatest(v_members, 1)
    );
  else
    v_bpt := 32768;
  end if;
  v_limit := least(5000, (v_remaining / greatest(v_bpt, 1) / 4)::integer);
  if v_remaining = 0 then
    v_limit := 0;
  end if;
  return query select
    v_bytes, v_stop, v_remaining, v_bpt, v_members, v_limit, v_limit;
end;
$$;

create or replace function public.music_rpc_continue_lastfm_track_pool(
  p_job_id uuid, p_fence_token uuid
)
returns table(applied boolean, result_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  update public.music_sync_job
  set job_status = 'retry', available_at = now(), lease_until = null,
      worker_id = null, fence_token = null
  where job_id = p_job_id and job_kind = 'lastfm_track_pool'
    and job_status = 'processing' and fence_token = p_fence_token;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return query select false, 'FENCE_LOST'::text;
  else
    return query select true, 'APPLIED'::text;
  end if;
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
      2, v_budget.growth_budget, v_budget.bytes_per_track, v_budget.remaining_bytes
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
      coalesce((v_item->>'rank')::integer, v_fetch.fetched_count),
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
          chart_rank = coalesce((v_item->>'rank')::integer, chart_rank),
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
      continue;
    end if;

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
      and c.identity_key = v_identity
      and c.candidate_status = 'queued'
    on conflict (idempotency_key) do nothing;
    if found then
      v_queued := v_queued + 1;
    end if;
  end loop;

  if pg_catalog.jsonb_array_length(p_tracks) = 0 then
    v_last := true;
  end if;

  update public.music_lastfm_track_pool_fetch
  set fetched_count = v_fetch.fetched_count,
      queued_count = queued_count + v_queued,
      next_page = case when v_last then next_page else p_page + 1 end,
      snapshot_complete = v_last,
      response_hash = p_response_hash,
      job_id = v_job.job_id,
      updated_at = now()
  where schedule_run_id = v_run.schedule_run_id;

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

create or replace function public.music_rpc_apply_catalog_recording_bundle(
  p_job_id uuid, p_fence_token uuid, p_payload jsonb
)
returns table(applied boolean, result_code text, recording_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.music_sync_job%rowtype;
  v_schedule public.music_collection_schedule%rowtype;
  v_candidate public.music_catalog_track_candidate%rowtype;
  v_album jsonb; v_release jsonb; v_medium jsonb; v_track jsonb; v_recording jsonb;
  v_credit jsonb; v_alias jsonb; v_isrc jsonb;
  v_album_id uuid; v_release_id uuid; v_recording_id uuid; v_track_id uuid; v_artist_id uuid;
  v_album_mbid uuid; v_release_mbid uuid; v_recording_mbid uuid; v_track_mbid uuid;
  v_position integer; v_new_recording boolean := false;
  v_other record;
  v_stop bigint;
  v_headroom bigint := 8 * 1024 * 1024;
begin
  perform public.music_reject_unknown_keys(p_payload, array[
    'candidate_id','requested_mbid','canonical_mbid','recording_aliases','album','release'
  ]);
  select * into v_job from public.music_sync_job where job_id = p_job_id for update;
  if not found or v_job.job_kind <> 'mb_catalog_track_resolve'
     or v_job.job_status <> 'processing'
     or v_job.fence_token is distinct from p_fence_token
     or v_job.lease_until < now() then
    return query select false, 'FENCE_LOST'::text, null::uuid;
    return;
  end if;
  select * into v_schedule
  from public.music_collection_schedule where schedule_id = v_job.schedule_id for update;
  select * into v_candidate
  from public.music_catalog_track_candidate
  where candidate_id = v_job.entity_id
  for update;
  if not found or (p_payload->>'candidate_id')::uuid is distinct from v_candidate.candidate_id then
    return query select false, 'INVALID_PAYLOAD'::text, null::uuid;
    return;
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
  v_medium := v_release->'media'->0;
  v_track := v_medium->'tracks'->0;
  v_recording := v_track->'recording';
  perform public.music_reject_unknown_keys(v_medium, array['position','title','format','tracks']);
  perform public.music_reject_unknown_keys(v_track, array[
    'mbid','position','number','title','length_ms','artist_credit','recording'
  ]);
  perform public.music_reject_unknown_keys(v_recording, array[
    'mbid','title','disambiguation','length_ms','video','first_release_date_text',
    'artist_credit','isrcs','tags','genres'
  ]);
  v_recording_mbid := (v_recording->>'mbid')::uuid;
  select recording_id into v_recording_id
  from public.music_recording_mbid where mbid = v_recording_mbid for update;
  if v_recording_id is null then
    select disable_discovery_bytes into v_stop
    from public.music_capacity_policy where policy_key = 'project1';
    if pg_catalog.pg_database_size(pg_catalog.current_database())
         >= coalesce(v_stop, 471859200) - v_headroom then
      update public.music_catalog_track_candidate
      set match_status = 'quota_skipped', candidate_status = 'skipped', updated_at = now()
      where candidate_id = v_candidate.candidate_id;
      update public.music_sync_job
      set job_status = 'completed', completed_at = now(), lease_until = null, worker_id = null
      where job_id = p_job_id and fence_token = p_fence_token;
      return query select false, 'QUOTA_SKIP'::text, null::uuid;
      return;
    end if;
    v_artist_id := public.music_worker_upsert_artist(v_recording->'artist_credit'->0);
    insert into public.music_recording(
      canonical_mbid, title, disambiguation, artist_credit_name, primary_artist_id,
      length_ms, is_video, first_release_date_text, last_mb_verified_at
    ) values (
      v_recording_mbid, v_recording->>'title', nullif(v_recording->>'disambiguation',''),
      v_recording->'artist_credit'->0->>'credited_name', v_artist_id,
      (v_recording->>'length_ms')::integer, coalesce((v_recording->>'video')::boolean, false),
      nullif(v_recording->>'first_release_date_text',''), now()
    ) returning recording_id into v_recording_id;
    insert into public.music_recording_mbid(
      mbid, recording_id, identifier_status, is_canonical, resolved_mbid, last_checked_at, last_http_status
    ) values (v_recording_mbid, v_recording_id, 'current', true, v_recording_mbid, now(), 200);
    v_new_recording := true;
  end if;

  delete from public.music_recording_artist_credit where recording_id = v_recording_id;
  v_position := 0;
  for v_credit in select value from jsonb_array_elements(v_recording->'artist_credit')
  loop
    v_artist_id := public.music_worker_upsert_artist(v_credit);
    insert into public.music_recording_artist_credit(recording_id, position, artist_id, credited_name, join_phrase)
      values (v_recording_id, v_position, v_artist_id, v_credit->>'credited_name', coalesce(v_credit->>'join_phrase',''));
    v_position := v_position + 1;
  end loop;
  delete from public.music_recording_isrc where recording_id = v_recording_id;
  for v_isrc in select value from jsonb_array_elements(coalesce(v_recording->'isrcs', '[]'::jsonb))
  loop
    insert into public.music_recording_isrc(recording_id, isrc)
      values (v_recording_id, upper(v_isrc #>> '{}')) on conflict do nothing;
  end loop;
  perform public.music_worker_upsert_tags('recording', v_recording_id, v_recording->'tags', v_recording->'genres');

  for v_alias in select value from jsonb_array_elements(coalesce(p_payload->'recording_aliases','[]'::jsonb))
  loop
    perform public.music_reject_unknown_keys(v_alias, array['mbid','redirect_target_mbid']);
    insert into public.music_recording_mbid(
      mbid, recording_id, identifier_status, is_canonical, redirect_target_mbid,
      resolved_mbid, last_checked_at, redirect_detected_at, last_http_status
    ) values (
      (v_alias->>'mbid')::uuid, v_recording_id, 'redirected', false,
      (v_alias->>'redirect_target_mbid')::uuid, v_recording_mbid, now(), now(), 301
    )
    on conflict (mbid) do update set
      identifier_status = 'redirected', is_canonical = false,
      redirect_target_mbid = excluded.redirect_target_mbid,
      resolved_mbid = excluded.resolved_mbid,
      last_checked_at = now(), last_http_status = 301;
  end loop;

  v_artist_id := public.music_worker_upsert_artist(v_album->'artist_credit'->0);
  v_album_mbid := (v_album->>'mbid')::uuid;
  select album_id into v_album_id from public.music_album_mbid where mbid = v_album_mbid for update;
  if v_album_id is null then
    insert into public.music_album(
      canonical_mbid, title, disambiguation, primary_type, secondary_types,
      artist_credit_name, primary_artist_id, first_release_date_text, last_mb_verified_at
    ) values (
      v_album_mbid, v_album->>'title', nullif(v_album->>'disambiguation',''),
      nullif(v_album->>'primary_type',''),
      coalesce(array(select jsonb_array_elements_text(coalesce(v_album->'secondary_types','[]'::jsonb))), '{}'),
      v_album->'artist_credit'->0->>'credited_name', v_artist_id,
      nullif(v_album->>'first_release_date_text',''), now()
    ) returning album_id into v_album_id;
    insert into public.music_album_mbid(
      mbid, album_id, identifier_status, is_canonical, resolved_mbid, last_checked_at, last_http_status
    ) values (v_album_mbid, v_album_id, 'current', true, v_album_mbid, now(), 200);
  end if;
  perform public.music_worker_upsert_tags('album', v_album_id, v_album->'tags', v_album->'genres');

  v_release_mbid := (v_release->>'mbid')::uuid;
  select release_id into v_release_id from public.music_release_mbid where mbid = v_release_mbid for update;
  if v_release_id is null then
    insert into public.music_release(
      album_id, canonical_mbid, title, artist_credit_name, status, quality, packaging,
      country_code, release_date_text, barcode, text_language, text_script,
      track_count, medium_count, is_representative, row_version
    ) values (
      v_album_id, v_release_mbid, v_release->>'title',
      v_release->'artist_credit'->0->>'credited_name',
      nullif(v_release->>'status',''), nullif(v_release->>'quality',''),
      nullif(v_release->>'packaging',''), nullif(v_release->>'country_code',''),
      nullif(v_release->>'release_date_text',''), nullif(v_release->>'barcode',''),
      nullif(v_release->>'text_language',''), nullif(v_release->>'text_script',''),
      1, 1, not exists (
        select 1 from public.music_release r where r.album_id = v_album_id and r.is_representative
      ), 0
    ) returning release_id into v_release_id;
    insert into public.music_release_mbid(
      mbid, release_id, identifier_status, is_canonical, resolved_mbid, last_checked_at, last_http_status
    ) values (v_release_mbid, v_release_id, 'current', true, v_release_mbid, now(), 200);
  end if;
  perform public.music_worker_upsert_tags('release', v_release_id, v_release->'tags', v_release->'genres');

  v_track_mbid := (v_track->>'mbid')::uuid;
  select track_id into v_track_id from public.music_track_mbid where mbid = v_track_mbid for update;
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
      (v_medium->>'position')::integer, nullif(v_medium->>'title',''), nullif(v_medium->>'format',''),
      (v_track->>'position')::integer, v_track->>'number', v_track->>'title',
      (v_track->>'length_ms')::integer, v_track->'artist_credit'->0->>'credited_name'
    ) returning track_id into v_track_id;
    insert into public.music_track_mbid(
      mbid, track_id, identifier_status, is_canonical, resolved_mbid, last_checked_at, last_http_status
    ) values (v_track_mbid, v_track_id, 'current', true, v_track_mbid, now(), 200);
  end if;

  select m.schedule_id, s.priority
  into v_other
  from public.music_schedule_catalog_recording m
  join public.music_collection_schedule s on s.schedule_id = m.schedule_id
  where m.recording_id = v_recording_id
    and m.is_enabled
    and m.membership_status in ('pending', 'active')
    and m.schedule_id <> v_schedule.schedule_id
  order by s.priority, s.schedule_id
  limit 1
  for update of m;
  if found and v_other.priority < v_schedule.priority then
    update public.music_catalog_track_candidate
    set recording_id = v_recording_id, recording_mbid = v_recording_mbid,
        match_status = 'skipped_exclusive', candidate_status = 'skipped', updated_at = now()
    where candidate_id = v_candidate.candidate_id;
    update public.music_sync_job
    set job_status = 'completed', completed_at = now(), lease_until = null, worker_id = null
    where job_id = p_job_id and fence_token = p_fence_token;
    return query select true, 'SKIPPED_EXCLUSIVE'::text, v_recording_id;
    return;
  end if;
  update public.music_schedule_catalog_recording
  set is_enabled = false, membership_status = 'retired', updated_at = now()
  where recording_id = v_recording_id
    and schedule_id <> v_schedule.schedule_id
    and is_enabled;

  insert into public.music_schedule_catalog_recording(
    schedule_id, recording_id, identity_key, chart_rank, membership_status, is_enabled, last_seen_run_id
  ) values (
    v_schedule.schedule_id, v_recording_id, v_candidate.identity_key,
    v_candidate.chart_rank, 'active', true, v_job.schedule_run_id
  )
  on conflict (schedule_id, recording_id) do update set
    identity_key = excluded.identity_key,
    chart_rank = excluded.chart_rank,
    membership_status = 'active',
    is_enabled = true,
    last_seen_run_id = excluded.last_seen_run_id,
    updated_at = now();

  update public.music_catalog_track_candidate
  set recording_id = v_recording_id, recording_mbid = v_recording_mbid,
      match_status = 'applied', candidate_status = 'applied', updated_at = now()
  where candidate_id = v_candidate.candidate_id;

  if v_new_recording then
    update public.music_schedule_run
    set inserted_count = inserted_count + 1,
        new_recording_count = new_recording_count + 1
    where schedule_run_id = v_job.schedule_run_id;
  else
    update public.music_schedule_run
    set updated_count = updated_count + 1
    where schedule_run_id = v_job.schedule_run_id;
  end if;

  insert into public.music_sync_job(
    job_kind, entity_type, entity_id, idempotency_key, priority,
    schedule_id, schedule_run_id
  ) values (
    'lastfm_tags', 'recording', v_recording_id,
    'lastfm-tags:' || v_job.schedule_run_id::text || ':' || v_recording_id::text,
    v_schedule.priority, v_schedule.schedule_id, v_job.schedule_run_id
  )
  on conflict (idempotency_key) do nothing;

  update public.music_sync_job
  set job_status = 'completed', completed_at = now(), lease_until = null, worker_id = null
  where job_id = p_job_id and fence_token = p_fence_token;
  return query select true, 'APPLIED'::text, v_recording_id;
end;
$$;

create or replace function public.music_rpc_apply_lastfm_tags(
  p_job_id uuid, p_fence_token uuid, p_payload jsonb
)
returns table(applied boolean, result_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.music_sync_job%rowtype;
  v_recording_id uuid;
  v_fetch_id uuid;
  v_attempt_id uuid;
  v_item jsonb;
  v_tag_id bigint;
  v_request_key text;
  v_eligible integer := 0;
begin
  perform public.music_reject_unknown_keys(p_payload, array[
    'recording_id','lookup_method','source_mbid','returned_mbid','returned_track_name',
    'returned_artist_name','received_tag_count','source_hash','match_status',
        'is_verified','tags','request_artist_name','request_track_name'
  ]);
  select * into v_job from public.music_sync_job where job_id = p_job_id for update;
  if not found or v_job.job_kind <> 'lastfm_tags'
     or v_job.job_status <> 'processing'
     or v_job.fence_token is distinct from p_fence_token
     or v_job.lease_until < now() then
    return query select false, 'FENCE_LOST'::text;
    return;
  end if;
  v_recording_id := coalesce(nullif(p_payload->>'recording_id','')::uuid, v_job.entity_id);
  if pg_catalog.jsonb_typeof(coalesce(p_payload->'tags','[]'::jsonb)) <> 'array'
     or pg_catalog.jsonb_array_length(coalesce(p_payload->'tags','[]'::jsonb)) > 20 then
    raise exception using errcode = '22023', message = 'invalid Last.fm tag payload';
  end if;
  v_request_key := pg_catalog.encode(extensions.digest(
    v_job.job_id::text || ':' || v_recording_id::text, 'sha256'
  ), 'hex');
  insert into public.lastfm_tag_fetch(recording_id, request_key, fetch_status, started_at, completed_at)
  values (v_recording_id, v_request_key, 'succeeded', now(), now())
  on conflict (request_key) do update
    set fetch_status = 'succeeded', completed_at = now()
  returning fetch_id into v_fetch_id;
  insert into public.lastfm_tag_fetch_attempt(
    fetch_id, attempt_no, candidate_kind, request_mbid, request_artist_name, request_track_name,
    result_status, returned_mbid, returned_track_name, returned_artist_name,
    tag_count, response_hash
  ) values (
    v_fetch_id, 1,
    coalesce(nullif(p_payload->>'lookup_method',''), 'canonical_mbid'),
    nullif(p_payload->>'source_mbid','')::uuid,
    case when coalesce(nullif(p_payload->>'lookup_method',''), 'canonical_mbid') = 'exact_name'
      then coalesce(nullif(p_payload->>'request_artist_name',''), nullif(p_payload->>'returned_artist_name','')) end,
    case when coalesce(nullif(p_payload->>'lookup_method',''), 'canonical_mbid') = 'exact_name'
      then coalesce(nullif(p_payload->>'request_track_name',''), nullif(p_payload->>'returned_track_name','')) end,
    case when coalesce((p_payload->>'received_tag_count')::integer, 0) = 0 then 'empty' else 'success' end,
    nullif(p_payload->>'returned_mbid','')::uuid,
    nullif(p_payload->>'returned_track_name',''),
    nullif(p_payload->>'returned_artist_name',''),
    coalesce((p_payload->>'received_tag_count')::integer, 0),
    case
      when coalesce(p_payload->>'source_hash','') ~ '^[0-9a-f]{64}$'
        then decode(p_payload->>'source_hash', 'hex')
      else null
    end
  )
  returning attempt_id into v_attempt_id;
  update public.lastfm_tag_fetch
  set selected_attempt_id = v_attempt_id
  where fetch_id = v_fetch_id;

  if pg_catalog.jsonb_array_length(coalesce(p_payload->'tags','[]'::jsonb)) >= 3 then
    delete from public.lastfm_recording_tag where recording_id = v_recording_id;
    for v_item in
      select value from jsonb_array_elements(p_payload->'tags')
      order by (value->>'vector_rank')::integer
    loop
      perform public.music_reject_unknown_keys(v_item, array[
        'canonical_name','source_tag_name','weighted_count','normalized_weight',
        'vector_rank','category','embedding_enabled'
      ]);
      insert into public.music_tag(
        canonical_name, normalized_name, category, embedding_enabled
      ) values (
        v_item->>'canonical_name',
        lower(v_item->>'canonical_name'),
        coalesce(nullif(v_item->>'category',''), 'unknown'),
        coalesce((v_item->>'embedding_enabled')::boolean, true)
      )
      on conflict (normalized_name) do update set
        canonical_name = excluded.canonical_name
      returning tag_id into v_tag_id;
      insert into public.lastfm_recording_tag(
        recording_id, tag_id, fetch_id, source_mbid, source_tag_name,
        weighted_count, normalized_weight, vector_rank
      ) values (
        v_recording_id, v_tag_id, v_fetch_id,
        nullif(p_payload->>'source_mbid','')::uuid,
        v_item->>'source_tag_name',
        (v_item->>'weighted_count')::integer,
        (v_item->>'normalized_weight')::real,
        (v_item->>'vector_rank')::smallint
      );
      v_eligible := v_eligible + 1;
    end loop;
  end if;

  insert into public.lastfm_recording_profile(
    recording_id, canonical_mbid_snapshot, active_source_mbid, lookup_method,
    match_status, is_verified, returned_mbid, returned_track_name, returned_artist_name,
    received_tag_count, persisted_tag_count, active_source_hash,
    last_attempt_at, last_success_at
  ) values (
    v_recording_id,
    (select canonical_mbid from public.music_recording where recording_id = v_recording_id),
    nullif(p_payload->>'source_mbid','')::uuid,
    coalesce(nullif(p_payload->>'lookup_method',''), 'canonical_mbid'),
    coalesce(nullif(p_payload->>'match_status',''), 'matched'),
    coalesce((p_payload->>'is_verified')::boolean, false),
    nullif(p_payload->>'returned_mbid','')::uuid,
    nullif(p_payload->>'returned_track_name',''),
    nullif(p_payload->>'returned_artist_name',''),
    coalesce((p_payload->>'received_tag_count')::integer, 0),
    v_eligible,
    case
      when coalesce(p_payload->>'source_hash','') ~ '^[0-9a-f]{64}$'
        then decode(p_payload->>'source_hash', 'hex')
      else null
    end,
    now(), now()
  )
  on conflict (recording_id) do update set
    lookup_method = excluded.lookup_method,
    match_status = excluded.match_status,
    is_verified = excluded.is_verified,
    returned_mbid = excluded.returned_mbid,
    returned_track_name = excluded.returned_track_name,
    returned_artist_name = excluded.returned_artist_name,
    received_tag_count = excluded.received_tag_count,
    persisted_tag_count = excluded.persisted_tag_count,
    active_source_hash = excluded.active_source_hash,
    last_attempt_at = now(),
    last_success_at = now(),
    updated_at = now();

  update public.music_recording
  set embedding_enabled = (v_eligible >= 3),
      lastfm_sync_enabled = true,
      row_version = row_version + 1
  where recording_id = v_recording_id;

  update public.music_sync_job
  set job_status = 'completed', completed_at = now(), lease_until = null, worker_id = null
  where job_id = p_job_id and fence_token = p_fence_token;
  return query select true, 'APPLIED'::text;
end;
$$;

create or replace function public.music_rpc_catalog_commit_snapshot(p_schedule_run_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fetch public.music_lastfm_track_pool_fetch%rowtype;
  v_run public.music_schedule_run%rowtype;
  v_retired integer := 0;
  v_purged integer := 0;
  v_rec record;
  v_album_id uuid;
  v_batch uuid;
  v_track_ids uuid[];
  v_release_ids uuid[];
begin
  select * into v_fetch
  from public.music_lastfm_track_pool_fetch
  where schedule_run_id = p_schedule_run_id
  for update;
  if not found or not v_fetch.snapshot_complete or v_fetch.committed_at is not null then
    return 0;
  end if;
  select * into v_run
  from public.music_schedule_run
  where schedule_run_id = p_schedule_run_id
  for update;
  if v_run.run_status = 'running' then
    return 0;
  end if;

  update public.music_schedule_catalog_recording
  set membership_status = 'retired', is_enabled = false, updated_at = now()
  where schedule_id = v_fetch.schedule_id
    and membership_status in ('pending', 'active')
    and (last_seen_run_id is distinct from p_schedule_run_id);
  get diagnostics v_retired = row_count;

  insert into public.music_purge_batch(reason, requested_album_count, is_dry_run)
  values ('catalog-rank-retire:' || p_schedule_run_id::text, 0, false)
  returning purge_batch_id into v_batch;

  for v_rec in
    select m.recording_id, r.canonical_mbid
    from public.music_schedule_catalog_recording m
    join public.music_recording r on r.recording_id = m.recording_id
    where m.schedule_id = v_fetch.schedule_id
      and m.membership_status = 'retired'
      and not exists (
        select 1 from public.music_schedule_catalog_recording o
        where o.recording_id = m.recording_id
          and o.is_enabled
          and o.membership_status in ('pending', 'active')
      )
      and not exists (
        select 1 from public.music_artist_allowlist al
        join public.music_artist_mbid am on am.mbid = al.artist_mbid
        where al.is_enabled and am.artist_id = r.primary_artist_id
      )
      and not exists (
        select 1 from public.music_entity_merge_audit x
        where x.entity_type = 'recording'
          and (x.loser_entity_id = m.recording_id or x.survivor_entity_id = m.recording_id)
      )
      and not exists (
        select 1 from public.music_upcoming_release u
        where u.staging_status in ('watching','deferred','promote_queued')
          and u.artist_mbid in (
            select am.mbid from public.music_artist_mbid am
            where am.artist_id = r.primary_artist_id
          )
      )
  loop
    insert into public.music_purge_entity_tombstone(entity_type, entity_id, canonical_mbid, purge_batch_id, purge_reason)
      values ('recording', v_rec.recording_id, v_rec.canonical_mbid, v_batch, 'catalog-rank-retire')
      on conflict do nothing;
    insert into public.music_recording_purge_tombstone(
      recording_id, canonical_mbid, vector_delete_status, purge_batch_id
    ) values (
      v_rec.recording_id, v_rec.canonical_mbid, 'not_required', v_batch
    ) on conflict (recording_id) do nothing;
    select array_agg(t.track_id) into v_track_ids
    from public.music_track t where t.recording_id = v_rec.recording_id;
    select array_agg(distinct t.release_id) into v_release_ids
    from public.music_track t where t.recording_id = v_rec.recording_id;
    perform pg_catalog.set_config('nrm.music_capacity_purge', 'on', true);
    delete from public.music_sync_job
    where entity_type = 'recording' and entity_id = v_rec.recording_id;
    delete from public.lastfm_recording_tag where recording_id = v_rec.recording_id;
    delete from public.lastfm_tag_fetch where recording_id = v_rec.recording_id;
    delete from public.lastfm_recording_profile where recording_id = v_rec.recording_id;
    delete from public.music_schedule_catalog_recording where recording_id = v_rec.recording_id;
    delete from public.music_catalog_track_candidate where recording_id = v_rec.recording_id;
    delete from public.music_track_mbid where track_id = any(coalesce(v_track_ids, '{}'::uuid[]));
    delete from public.music_track where recording_id = v_rec.recording_id;
    delete from public.music_recording_mbid where recording_id = v_rec.recording_id;
    delete from public.music_recording where recording_id = v_rec.recording_id;
    perform pg_catalog.set_config('nrm.music_capacity_purge', 'off', true);
    v_purged := v_purged + 1;
    if v_release_ids is not null then
      for v_album_id in
        select distinct r.album_id
        from public.music_release r
        where r.release_id = any(v_release_ids)
          and not exists (select 1 from public.music_track t where t.release_id = r.release_id)
          and not exists (
            select 1 from public.music_schedule_catalog_recording m
            join public.music_track t on t.recording_id = m.recording_id
            where m.is_enabled and t.release_id = r.release_id
          )
      loop
        perform pg_catalog.set_config('nrm.music_capacity_purge', 'on', true);
        delete from public.music_release_mbid
          where release_id in (select release_id from public.music_release where album_id = v_album_id);
        delete from public.music_release where album_id = v_album_id;
        delete from public.music_album_mbid where album_id = v_album_id;
        delete from public.music_album where album_id = v_album_id;
        perform pg_catalog.set_config('nrm.music_capacity_purge', 'off', true);
      end loop;
    end if;
  end loop;

  update public.music_purge_batch
  set purged_album_count = v_purged, completed_at = now()
  where purge_batch_id = v_batch;
  update public.music_lastfm_track_pool_fetch
  set committed_at = now(), updated_at = now()
  where schedule_run_id = p_schedule_run_id;
  return v_purged;
end;
$$;

create or replace function public.music_rpc_catalog_commit_pending()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run uuid;
  v_total integer := 0;
begin
  for v_run in
    select f.schedule_run_id
    from public.music_lastfm_track_pool_fetch f
    join public.music_schedule_run r on r.schedule_run_id = f.schedule_run_id
    where f.snapshot_complete and f.committed_at is null
      and r.run_status <> 'running'
  loop
    v_total := v_total + public.music_rpc_catalog_commit_snapshot(v_run);
  end loop;
  return v_total;
end;
$$;

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
      'lastfm_artist_pool', 'lastfm_track_pool',
      'mb_discovery', 'mb_release_hydrate', 'mb_recording_hydrate',
      'mb_catalog_track_resolve'
    )
      and job_status in ('pending', 'processing', 'retry')
  );
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
    where j.job_kind in (
        'lastfm_artist_pool','lastfm_track_pool','mb_catalog_track_resolve',
        'lastfm_tags','mb_discovery','mb_release_hydrate','mb_recording_hydrate',
        'mb_upcoming_verify'
      )
      and (
        (j.job_status in ('pending','retry') and j.available_at <= now())
        or (j.job_status = 'processing' and j.lease_until < now())
      )
    order by
      case j.job_kind
        when 'mb_upcoming_verify' then 0
        when 'lastfm_track_pool' then 1
        when 'lastfm_artist_pool' then 1
        when 'mb_catalog_track_resolve' then 2
        when 'lastfm_tags' then 3
        when 'mb_discovery' then 4
        when 'mb_release_hydrate' then 5
        when 'mb_recording_hydrate' then 6
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
  left join public.music_catalog_track_candidate cc on cc.candidate_id = c.entity_id
    and c.job_kind = 'mb_catalog_track_resolve'
  left join public.music_recording rec on rec.recording_id = c.entity_id
    and c.job_kind = 'lastfm_tags';
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

  perform public.music_rpc_recover_stale_collection();
  perform public.music_rpc_catalog_commit_pending();

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

    perform public.music_collection_enqueue_pool_job(
      v_schedule.schedule_id, v_run_id, v_request_key, v_schedule.priority,
      coalesce(v_schedule.collection_mode, 'upcoming')
    );

    return query
      select v_run_id, v_schedule.schedule_id, v_fence, v_from, v_to,
             v_schedule.max_request_count;
  end loop;
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
  perform public.music_rpc_catalog_commit_pending();
  return query select exists (
    select 1 from public.music_sync_job
    where job_kind in (
      'lastfm_artist_pool','lastfm_track_pool','mb_catalog_track_resolve','lastfm_tags',
      'mb_discovery','mb_release_hydrate','mb_recording_hydrate',
      'mb_upcoming_verify'
    )
      and job_status in ('pending','processing','retry')
  );
end;
$$;

create or replace function public.music_rpc_capacity_purge(
  p_max_albums integer, p_reason text, p_dry_run boolean default true
)
returns table(
  album_id uuid, canonical_mbid uuid, purged boolean,
  recording_count integer, estimated_bytes bigint
)
language plpgsql security definer set search_path = ''
as $$
declare
  v_album record;
  v_batch uuid;
  v_recording_ids uuid[];
  v_release_ids uuid[];
  v_track_ids uuid[];
  v_estimated bigint;
  v_album_total bigint;
begin
  if p_max_albums not between 1 and 100 or btrim(coalesce(p_reason,'')) = ''
     or char_length(p_reason) > 500 then
    raise exception using errcode = '22023', message = 'invalid purge parameters';
  end if;
  insert into public.music_purge_batch(reason, requested_album_count, is_dry_run)
  values (p_reason, p_max_albums, p_dry_run) returning purge_batch_id into v_batch;
  select coalesce(
    (pg_catalog.pg_total_relation_size('public.music_album'::regclass)
      + pg_catalog.pg_total_relation_size('public.music_release'::regclass)
      + pg_catalog.pg_total_relation_size('public.music_track'::regclass)
      + pg_catalog.pg_total_relation_size('public.music_recording'::regclass))
    / nullif((select count(*) from public.music_album), 0), 0
  ) into v_album_total;
  for v_album in
    select a.album_id, a.canonical_mbid
    from public.music_album a
    where a.entity_status = 'active'
      and not exists (
        select 1 from public.music_artist_allowlist al
        join public.music_artist_mbid am on am.mbid = al.artist_mbid
        where al.is_enabled and am.artist_id = a.primary_artist_id
      )
      and not exists (select 1 from public.music_album x where x.merged_into_album_id = a.album_id)
      and not exists (
        select 1 from public.music_release r join public.music_release x
          on x.merged_into_release_id = r.release_id where r.album_id = a.album_id
      )
      and not exists (
        select 1 from public.music_track t join public.music_track x
          on x.merged_into_track_id = t.track_id
        join public.music_release r on r.release_id = t.release_id where r.album_id = a.album_id
      )
      and not exists (
        select 1 from public.music_entity_merge_audit ma
        where (ma.entity_type = 'album' and (ma.loser_entity_id = a.album_id or ma.survivor_entity_id = a.album_id))
      )
      and not exists (
        select 1 from public.music_entity_merge_audit ma
        join public.music_release r on r.album_id = a.album_id
        where ma.entity_type = 'release'
          and (ma.loser_entity_id = r.release_id or ma.survivor_entity_id = r.release_id)
      )
      and not exists (
        select 1 from public.music_entity_merge_audit ma
        join public.music_track t on ma.loser_entity_id = t.track_id or ma.survivor_entity_id = t.track_id
        join public.music_release r on r.release_id = t.release_id
        where ma.entity_type = 'track' and r.album_id = a.album_id
      )
      and not exists (
        select 1
        from public.music_schedule_catalog_recording m
        join public.music_track t on t.recording_id = m.recording_id
        join public.music_release r on r.release_id = t.release_id
        where m.is_enabled
          and m.membership_status in ('pending','active')
          and r.album_id = a.album_id
      )
    order by
      coalesce((select min(al.priority) from public.music_artist_allowlist al
        join public.music_artist_mbid am on am.mbid = al.artist_mbid
        where am.artist_id = a.primary_artist_id), 2147483647) desc,
      a.last_mb_verified_at nulls first, a.created_at, a.album_id
    limit p_max_albums
  loop
    select array_agg(r.release_id) into v_release_ids from public.music_release r where r.album_id = v_album.album_id;
    select array_agg(t.track_id), array_agg(distinct t.recording_id) filter (where t.recording_id is not null)
      into v_track_ids, v_recording_ids
    from public.music_track t where t.release_id = any(coalesce(v_release_ids, '{}'::uuid[]));
    select coalesce(sum(pg_column_size(t)), 0) into v_estimated
      from public.music_track t where t.track_id = any(coalesce(v_track_ids, '{}'::uuid[]));
    v_estimated := greatest(v_estimated, v_album_total);
    if p_dry_run then
      return query select v_album.album_id, v_album.canonical_mbid, false,
        coalesce(cardinality(v_recording_ids), 0), v_estimated;
      continue;
    end if;
    -- Keep only recordings that are not shared outside this album and have no permanent merge/redirect references.
    select array_agg(rid) into v_recording_ids
    from unnest(coalesce(v_recording_ids, '{}'::uuid[])) rid
    where not exists (
      select 1 from public.music_track t
      where t.recording_id = rid and not (t.track_id = any(coalesce(v_track_ids, '{}'::uuid[])))
    )
      and not exists (select 1 from public.music_recording x where x.merged_into_recording_id = rid)
      and not exists (select 1 from public.music_recording_redirect x where x.old_recording_id = rid or x.new_recording_id = rid)
      and not exists (
        select 1 from public.music_entity_merge_audit x
        where x.entity_type = 'recording' and (x.loser_entity_id = rid or x.survivor_entity_id = rid)
      );
    insert into public.music_purge_entity_tombstone(entity_type, entity_id, canonical_mbid, purge_batch_id, purge_reason)
      select 'album', a.album_id, a.canonical_mbid, v_batch, p_reason
      from public.music_album a where a.album_id = v_album.album_id
      on conflict do nothing;
    insert into public.music_purge_entity_tombstone(entity_type, entity_id, canonical_mbid, purge_batch_id, purge_reason)
      select 'release', r.release_id, r.canonical_mbid, v_batch, p_reason
      from public.music_release r where r.release_id = any(coalesce(v_release_ids, '{}'::uuid[]))
      on conflict do nothing;
    insert into public.music_purge_entity_tombstone(entity_type, entity_id, canonical_mbid, purge_batch_id, purge_reason)
      select 'track', t.track_id, t.canonical_mbid, v_batch, p_reason
      from public.music_track t where t.track_id = any(coalesce(v_track_ids, '{}'::uuid[]))
      on conflict do nothing;
    insert into public.music_purge_entity_tombstone(entity_type, entity_id, canonical_mbid, purge_batch_id, purge_reason)
      select 'recording', r.recording_id, r.canonical_mbid, v_batch, p_reason
      from public.music_recording r where r.recording_id = any(coalesce(v_recording_ids, '{}'::uuid[]))
      on conflict do nothing;
    insert into public.music_recording_purge_tombstone(
      recording_id, canonical_mbid, vector_delete_status, purge_batch_id
    )
      select r.recording_id, r.canonical_mbid,
        case when r.embedding_enabled then 'pending' else 'not_required' end, v_batch
      from public.music_recording r where r.recording_id = any(coalesce(v_recording_ids, '{}'::uuid[]))
      on conflict (recording_id) do nothing;
    perform pg_catalog.set_config('nrm.music_capacity_purge', 'on', true);
    delete from public.music_sync_job where
      (entity_type = 'track' and entity_id = any(coalesce(v_track_ids, '{}'::uuid[])))
      or (entity_type = 'release' and entity_id = any(coalesce(v_release_ids, '{}'::uuid[])))
      or (entity_type = 'recording' and entity_id = any(coalesce(v_recording_ids, '{}'::uuid[])));
    delete from public.music_recording_duplicate_candidate
      where recording_id_low = any(coalesce(v_recording_ids, '{}'::uuid[]))
         or recording_id_high = any(coalesce(v_recording_ids, '{}'::uuid[]));
    delete from public.lastfm_recording_tag where recording_id = any(coalesce(v_recording_ids, '{}'::uuid[]));
    delete from public.lastfm_tag_fetch where recording_id = any(coalesce(v_recording_ids, '{}'::uuid[]));
    delete from public.lastfm_recording_profile where recording_id = any(coalesce(v_recording_ids, '{}'::uuid[]));
    delete from public.music_track_mbid where track_id = any(coalesce(v_track_ids, '{}'::uuid[]));
    delete from public.music_track where track_id = any(coalesce(v_track_ids, '{}'::uuid[]));
    delete from public.music_release_mbid where release_id = any(coalesce(v_release_ids, '{}'::uuid[]));
    delete from public.music_release where release_id = any(coalesce(v_release_ids, '{}'::uuid[]));
    delete from public.music_recording_mbid where recording_id = any(coalesce(v_recording_ids, '{}'::uuid[]));
    delete from public.music_recording where recording_id = any(coalesce(v_recording_ids, '{}'::uuid[]));
    delete from public.music_album_mbid where music_album_mbid.album_id = v_album.album_id;
    delete from public.music_album where music_album.album_id = v_album.album_id;
    perform pg_catalog.set_config('nrm.music_capacity_purge', 'off', true);
    update public.music_purge_batch set purged_album_count = purged_album_count + 1 where purge_batch_id = v_batch;
    return query select v_album.album_id, v_album.canonical_mbid, true,
      coalesce(cardinality(v_recording_ids), 0), v_estimated;
  end loop;
  update public.music_purge_batch set completed_at = now() where purge_batch_id = v_batch;
  insert into public.music_capacity_event(event_kind, detail)
    values (case when p_dry_run then 'purge_dry_run' else 'purge_completed' end,
      jsonb_build_object('purge_batch_id', v_batch, 'max_albums', p_max_albums));
end;
$$;

insert into public.music_collection_schedule(
  schedule_key, display_name, schedule_kind, daily_time_kst, interval_minutes,
  next_run_at, is_enabled, date_from_offset_days, date_to_offset_days,
  release_statuses, max_artist_count, max_request_count, max_new_recording_count,
  priority, lastfm_method, lastfm_param, lastfm_limit, collection_mode
)
select v.schedule_key, v.display_name, 'daily', v.daily_time_kst, null,
  public.nrm_system_schedule_next_daily_run(v.daily_time_kst, now()),
  true, 0, 0, array['Official']::text[], 100, 45, 5000,
  v.priority, v.lastfm_method, v.lastfm_param, 5000, 'catalog'
from (
  values
    ('musicbrainz-lastfm-korea-catalog', '한국 Top 트랙 카탈로그', time '00:00', 20, 'geo.getTopTracks', 'Korea, Republic of'),
    ('musicbrainz-lastfm-global-catalog', '글로벌 Top 트랙 카탈로그', time '01:00', 40, 'chart.getTopTracks', null),
    ('musicbrainz-lastfm-korean-hiphop-catalog', '한국 힙합 Top 트랙 카탈로그', time '02:00', 10, 'tag.getTopTracks', 'korean hip hop'),
    ('musicbrainz-lastfm-hiphop-catalog', '힙합 Top 트랙 카탈로그', time '03:00', 30, 'tag.getTopTracks', 'hip-hop')
) as v(schedule_key, display_name, daily_time_kst, priority, lastfm_method, lastfm_param)
where not exists (
  select 1 from public.music_collection_schedule s where s.schedule_key = v.schedule_key
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
where ms.schedule_key in (
  'musicbrainz-lastfm-korea-catalog',
  'musicbrainz-lastfm-global-catalog',
  'musicbrainz-lastfm-korean-hiphop-catalog',
  'musicbrainz-lastfm-hiphop-catalog'
)
on conflict (schedule_key) do update set
  display_name = excluded.display_name,
  job_kind = excluded.job_kind,
  is_enabled = excluded.is_enabled,
  schedule_kind = excluded.schedule_kind,
  daily_time_kst = excluded.daily_time_kst,
  interval_minutes = excluded.interval_minutes,
  next_run_at = excluded.next_run_at,
  config = excluded.config,
  updated_at = now();

grant select, insert, update, delete on table
  public.music_lastfm_track_pool_fetch,
  public.music_catalog_track_candidate,
  public.music_schedule_catalog_recording,
  public.lastfm_recording_profile,
  public.lastfm_tag_fetch,
  public.lastfm_tag_fetch_attempt,
  public.lastfm_recording_tag
to nrm_music_rpc_owner;

do $own$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'music_collection_pool_job_kind',
        'music_collection_enqueue_pool_job',
        'music_collection_is_busy',
        'music_rpc_catalog_capacity_budget',
        'music_rpc_continue_lastfm_track_pool',
        'music_rpc_apply_lastfm_track_pool_page',
        'music_rpc_apply_catalog_recording_bundle',
        'music_rpc_apply_lastfm_tags',
        'music_rpc_catalog_commit_snapshot',
        'music_rpc_catalog_commit_pending',
        'music_rpc_claim_mb_work',
        'music_rpc_claim_due_schedules',
        'music_rpc_admin_schedule_run_now',
        'music_rpc_finalize_mb_runs',
        'music_rpc_capacity_purge'
      )
  loop
    execute format('alter function %s owner to nrm_music_rpc_owner', r.sig);
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    if r.proname = 'music_rpc_admin_schedule_run_now' then
      execute format('grant execute on function %s to anon, authenticated, service_role', r.sig);
    else
      execute format('grant execute on function %s to service_role', r.sig);
    end if;
  end loop;
end
$own$;

grant execute on function public.music_collection_is_busy() to service_role, nrm_music_rpc_owner;
grant execute on function public.music_rpc_catalog_capacity_budget() to service_role;

comment on function public.music_rpc_apply_lastfm_track_pool_page(uuid, uuid, integer, integer, bytea, jsonb, boolean) is
  'Last.fm Top Tracks 페이지를 catalog 후보로 저장하고 배타 소유·resolve job을 큐잉한다';
comment on function public.music_rpc_apply_catalog_recording_bundle(uuid, uuid, jsonb) is
  '차트 Recording 최소 bundle(앨범·릴리스·트랙 1개)을 원장에 넣고 catalog 멤버십을 배타 갱신한다';
comment on function public.music_rpc_apply_lastfm_tags(uuid, uuid, jsonb) is
  'Last.fm track.getTopTags 선별 결과를 lastfm_recording_tag에 저장한다. 임베딩 worker는 만들지 않는다';

revoke create on schema public from nrm_music_rpc_owner;
