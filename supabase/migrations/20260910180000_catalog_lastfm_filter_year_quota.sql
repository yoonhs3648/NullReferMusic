-- Catalog Last.fm list is region/genre filtered before MusicBrainz.
-- Year quotas: pre-2000=100, 2000-2010=100/yr, 2011-2020=300/yr, 2021-now=500/yr.
-- Korea catalog Last.fm source is tag.getTopTracks(k-pop), not geo popular-in-Korea.

grant usage, create on schema public to nrm_music_rpc_owner;


create or replace function public.music_catalog_release_year(p_date text)
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(substring(btrim(coalesce(p_date, '')), '^([0-9]{4})'), '')::integer;
$$;

create or replace function public.music_catalog_era_quota(p_year integer)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_year is null then
    return 0;
  end if;
  if p_year < 2000 then
    return 100;
  end if;
  if p_year <= 2010 then
    return 100;
  end if;
  if p_year <= 2020 then
    return 300;
  end if;
  return 500;
end;
$$;

create or replace function public.music_rpc_catalog_year_quota_total(
  p_as_of date default ((now() at time zone 'Asia/Seoul')::date)
)
returns integer
language plpgsql
stable
set search_path = ''
as $$
declare
  v_now integer := extract(year from p_as_of)::integer;
begin
  return 100
    + (2010 - 2000 + 1) * 100
    + (2020 - 2011 + 1) * 300
    + greatest(0, v_now - 2020) * 500;
end;
$$;

create or replace function public.music_catalog_era_quota_full(
  p_schedule_id uuid,
  p_year integer
)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  v_quota integer := public.music_catalog_era_quota(p_year);
  v_count integer := 0;
begin
  if v_quota <= 0 then
    return true;
  end if;
  if p_year < 2000 then
    select count(*)::integer
    into v_count
    from public.music_schedule_catalog_recording m
    join public.music_recording r on r.recording_id = m.recording_id
    where m.schedule_id = p_schedule_id
      and m.is_enabled
      and m.membership_status in ('pending', 'active')
      and public.music_catalog_release_year(r.first_release_date_text) < 2000;
  else
    select count(*)::integer
    into v_count
    from public.music_schedule_catalog_recording m
    join public.music_recording r on r.recording_id = m.recording_id
    where m.schedule_id = p_schedule_id
      and m.is_enabled
      and m.membership_status in ('pending', 'active')
      and public.music_catalog_release_year(r.first_release_date_text) = p_year;
  end if;
  return v_count >= v_quota;
end;
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
  v_year_total integer;
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
  v_year_total := public.music_rpc_catalog_year_quota_total();
  v_limit := least(
    20000,
    (v_year_total * 3 / 2),
    (v_remaining / greatest(v_bpt, 1))::integer
  );
  if v_remaining = 0 then
    v_limit := 0;
  end if;
  return query select
    v_bytes, v_stop, v_remaining, v_bpt, v_members, v_limit, v_limit;
end;
$$;

alter table public.music_lastfm_track_pool_fetch
  drop constraint if exists ck_music_lastfm_track_pool_fetch_page;
alter table public.music_lastfm_track_pool_fetch
  add constraint ck_music_lastfm_track_pool_fetch_page check (
    page_size between 1 and 50 and next_page between 1 and 2000
    and track_limit between 0 and 20000
    and fetched_count >= 0 and queued_count >= 0
    and growth_budget >= 0 and bytes_per_track >= 1024
    and remaining_bytes >= 0
  );

alter table public.music_catalog_track_candidate
  drop constraint if exists ck_music_catalog_track_candidate_rank;
alter table public.music_catalog_track_candidate
  add constraint ck_music_catalog_track_candidate_rank check (
    chart_rank between 1 and 20000
  );

alter table public.music_collection_schedule
  drop constraint if exists ck_music_collection_schedule_lastfm_limit;
alter table public.music_collection_schedule
  add constraint ck_music_collection_schedule_lastfm_limit check (
    lastfm_limit between 1 and 20000
  );

alter table public.music_collection_schedule
  drop constraint if exists ck_music_collection_schedule_limits;
alter table public.music_collection_schedule
  add constraint ck_music_collection_schedule_limits check (
    max_artist_count between 1 and 100
    and max_request_count between 1 and 500
    and max_new_recording_count between 1 and 20000
  );

update public.music_collection_schedule
set lastfm_method = 'tag.getTopTracks',
    lastfm_param = 'k-pop',
    lastfm_limit = 20000,
    max_new_recording_count = 20000,
    updated_at = now()
where schedule_key = 'musicbrainz-lastfm-korea-catalog';

update public.music_collection_schedule
set lastfm_limit = 20000,
    max_new_recording_count = 20000,
    updated_at = now()
where schedule_key in (
  'musicbrainz-lastfm-global-catalog',
  'musicbrainz-lastfm-korean-hiphop-catalog',
  'musicbrainz-lastfm-hiphop-catalog'
);

create or replace function public.music_rpc_apply_catalog_recording_bundle(
  p_job_id uuid, p_fence_token uuid, p_payload jsonb
)
returns table(applied boolean, result_code text, applied_recording_id uuid)
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
  v_is_representative boolean;
  v_retired_at timestamptz;
  v_release_year integer;
begin
  perform public.music_reject_unknown_keys(p_payload, array[
    'candidate_id','requested_mbid','canonical_mbid','recording_aliases','album','release','recording'
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
  if v_release is not null and jsonb_typeof(v_release) = 'object'
     and nullif(v_release->>'mbid', '') is not null then
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
  else
    v_album := null;
    v_release := null;
    v_recording := p_payload->'recording';
  end if;
  if v_recording is null or jsonb_typeof(v_recording) <> 'object' then
    return query select false, 'INVALID_PAYLOAD'::text, null::uuid;
    return;
  end if;
  perform public.music_reject_unknown_keys(v_recording, array[
    'mbid','title','disambiguation','length_ms','video','first_release_date_text',
    'artist_credit','isrcs','tags','genres'
  ]);
  v_recording_mbid := (v_recording->>'mbid')::uuid;
  v_release_year := public.music_catalog_release_year(
    nullif(v_recording->>'first_release_date_text','')
  );
  select recording_id into v_recording_id
  from public.music_recording_mbid where mbid = v_recording_mbid for update;
  if not exists (
    select 1
    from public.music_schedule_catalog_recording m
    where m.schedule_id = v_schedule.schedule_id
      and m.recording_id = v_recording_id
      and m.is_enabled
      and m.membership_status in ('pending', 'active')
  ) and public.music_catalog_era_quota_full(v_schedule.schedule_id, v_release_year) then
    update public.music_catalog_track_candidate
    set match_status = 'quota_skipped', candidate_status = 'skipped', updated_at = now()
    where candidate_id = v_candidate.candidate_id;
    update public.music_sync_job
    set job_status = 'completed', completed_at = now(), lease_until = null, worker_id = null
    where job_id = p_job_id and fence_token = p_fence_token;
    return query select false, 'YEAR_QUOTA_SKIP'::text, null::uuid;
    return;
  end if;
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

  if v_release is not null and nullif(v_release->>'mbid', '') is not null then
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

  perform 1 from public.music_album a where a.album_id = v_album_id for update;
  v_release_mbid := (v_release->>'mbid')::uuid;
  select release_id into v_release_id from public.music_release_mbid where mbid = v_release_mbid for update;
  if v_release_id is null then
    v_is_representative := not exists (
      select 1 from public.music_release r
      where r.album_id = v_album_id and r.is_representative
    );
    v_retired_at := case when v_is_representative then null else now() end;
    insert into public.music_release(
      album_id, canonical_mbid, title, artist_credit_name, status, quality, packaging,
      country_code, release_date_text, barcode, text_language, text_script,
      track_count, medium_count, is_representative, retired_at, row_version
    ) values (
      v_album_id, v_release_mbid, v_release->>'title',
      v_release->'artist_credit'->0->>'credited_name',
      nullif(v_release->>'status',''), nullif(v_release->>'quality',''),
      nullif(v_release->>'packaging',''), nullif(v_release->>'country_code',''),
      nullif(v_release->>'release_date_text',''), nullif(v_release->>'barcode',''),
      nullif(v_release->>'text_language',''), nullif(v_release->>'text_script',''),
      1, 1, v_is_representative, v_retired_at, 0
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
      greatest(1, least(20000, coalesce(nullif((v_item->>'rank')::integer, 0), v_fetch.fetched_count))),
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
          chart_rank = greatest(1, least(20000, coalesce(nullif((v_item->>'rank')::integer, 0), chart_rank, 1))),
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


alter function public.music_catalog_release_year(text) owner to nrm_music_rpc_owner;
alter function public.music_catalog_era_quota(integer) owner to nrm_music_rpc_owner;
alter function public.music_rpc_catalog_year_quota_total(date) owner to nrm_music_rpc_owner;
alter function public.music_catalog_era_quota_full(uuid, integer) owner to nrm_music_rpc_owner;
alter function public.music_rpc_catalog_capacity_budget() owner to nrm_music_rpc_owner;
alter function public.music_rpc_apply_catalog_recording_bundle(uuid, uuid, jsonb)
  owner to nrm_music_rpc_owner;
alter function public.music_rpc_apply_lastfm_track_pool_page(uuid, uuid, integer, integer, bytea, jsonb, boolean)
  owner to nrm_music_rpc_owner;

grant execute on function public.music_catalog_release_year(text) to service_role;
grant execute on function public.music_catalog_era_quota(integer) to service_role;
grant execute on function public.music_rpc_catalog_year_quota_total(date) to service_role;
grant execute on function public.music_catalog_era_quota_full(uuid, integer) to service_role;
grant execute on function public.music_rpc_catalog_capacity_budget() to service_role;
grant execute on function public.music_rpc_apply_catalog_recording_bundle(uuid, uuid, jsonb)
  to service_role, nrm_music_rpc_owner;
grant execute on function public.music_rpc_apply_lastfm_track_pool_page(uuid, uuid, integer, integer, bytea, jsonb, boolean)
  to service_role, nrm_music_rpc_owner;

comment on function public.music_catalog_era_quota(integer) is
  '카탈로그 연도 쿼터. 2000 미만 버킷 100, 2000-2010년 100, 2011-2020년 300, 2021-현재 500';
comment on function public.music_rpc_catalog_year_quota_total(date) is
  '스케줄당 연도 쿼터 합. Last.fm 리스트 상한은 이 값의 1.5배와 용량 잔여 중 작은 값';
comment on function public.music_rpc_apply_lastfm_track_pool_page(uuid, uuid, integer, integer, bytea, jsonb, boolean) is
  'Last.fm에서 지역/장르 필터된 곡만 후보로 넣는다. 빈 페이지는 필터 결과가 아니라 p_is_last_page일 때만 스냅샷을 닫는다';
comment on function public.music_rpc_apply_catalog_recording_bundle(uuid, uuid, jsonb) is
  '차트 Recording을 원장에 넣는다. 연도 쿼터가 찬 곡은 YEAR_QUOTA_SKIP. album/release는 선택';
