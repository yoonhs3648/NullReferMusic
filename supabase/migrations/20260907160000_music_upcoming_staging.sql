-- Upcoming-release staging + verify/promote hooks.
-- Authority ledger remains for confirmed releases only; 4 Last.fm schedules stage here.

grant usage, create on schema public to nrm_music_rpc_owner;

-- ---------------------------------------------------------------------------
-- Schedule collection mode
-- ---------------------------------------------------------------------------
alter table public.music_collection_schedule
  add column if not exists collection_mode text not null default 'upcoming';

alter table public.music_collection_schedule
  drop constraint if exists ck_music_collection_schedule_collection_mode;

alter table public.music_collection_schedule
  add constraint ck_music_collection_schedule_collection_mode
  check (collection_mode in ('upcoming', 'catalog'));

comment on column public.music_collection_schedule.collection_mode is
  'upcoming=발매예정 스테이징 적재, catalog=원장 직접 적용(향후 과거 발매 수집)';

update public.music_collection_schedule
set collection_mode = 'upcoming'
where lastfm_method is not null;

-- ---------------------------------------------------------------------------
-- Staging table
-- ---------------------------------------------------------------------------
create table if not exists public.music_upcoming_release (
  upcoming_id uuid not null default extensions.gen_random_uuid(),
  release_mbid uuid not null,
  release_group_mbid uuid,
  title text not null,
  artist_credit_name text not null default '',
  artist_mbid uuid,
  release_date_text text,
  release_status text,
  country_code text,
  primary_type text,
  secondary_types text[] not null default '{}',
  schedule_id uuid not null,
  first_seen_schedule_run_id uuid,
  last_schedule_run_id uuid,
  staging_status text not null default 'watching',
  last_verified_at timestamptz,
  last_mb_http_status integer,
  last_verify_note text,
  promoted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pk_music_upcoming_release primary key (upcoming_id),
  constraint ux_music_upcoming_release_mbid unique (release_mbid),
  constraint fk_music_upcoming_release_schedule foreign key (schedule_id)
    references public.music_collection_schedule(schedule_id) on delete restrict,
  constraint fk_music_upcoming_release_artist foreign key (artist_mbid)
    references public.music_artist_allowlist(artist_mbid) on delete set null,
  constraint ck_music_upcoming_release_title check (btrim(title) <> ''),
  constraint ck_music_upcoming_release_date check (
    release_date_text is null
    or release_date_text ~ '^[0-9]{4}(-[0-9]{2}(-[0-9]{2})?)?$'
  ),
  constraint ck_music_upcoming_release_status check (
    staging_status in ('watching', 'deferred', 'cancelled', 'promoted', 'promote_queued')
  )
);

create index if not exists ix_music_upcoming_release_status_date
  on public.music_upcoming_release (staging_status, release_date_text);
create index if not exists ix_music_upcoming_release_schedule
  on public.music_upcoming_release (schedule_id, updated_at desc);
create index if not exists ix_music_upcoming_release_verify
  on public.music_upcoming_release (staging_status, last_verified_at nulls first)
  where staging_status in ('watching', 'deferred');

drop trigger if exists trg_music_upcoming_release_updated_at on public.music_upcoming_release;
create trigger trg_music_upcoming_release_updated_at
  before update on public.music_upcoming_release
  for each row execute function public.music_set_updated_at();

alter table public.music_upcoming_release enable row level security;
revoke all on table public.music_upcoming_release from public, anon, authenticated;
grant select, insert, update, delete on table public.music_upcoming_release to nrm_music_rpc_owner;
drop policy if exists pl_music_upcoming_release_music_rpc_owner on public.music_upcoming_release;
create policy pl_music_upcoming_release_music_rpc_owner
  on public.music_upcoming_release for all to nrm_music_rpc_owner
  using (true) with check (true);

comment on table public.music_upcoming_release is
  '발매예정 스테이징. 확정 발매만 원장(music_*)으로 promote';

-- Partial date → inclusive end date (KST calendar semantics for verify).
create or replace function public.music_partial_date_end(p_text text)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := nullif(btrim(coalesce(p_text, '')), '');
  y int;
  m int;
begin
  if v is null then
    return null;
  end if;
  if v ~ '^[0-9]{4}$' then
    y := v::int;
    return make_date(y, 12, 31);
  end if;
  if v ~ '^[0-9]{4}-[0-9]{2}$' then
    y := substr(v, 1, 4)::int;
    m := substr(v, 6, 2)::int;
    if m < 1 or m > 12 then
      return null;
    end if;
    return (make_date(y, m, 1) + interval '1 month - 1 day')::date;
  end if;
  if v ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return v::date;
  end if;
  return null;
end;
$$;

alter function public.music_partial_date_end(text) owner to nrm_music_rpc_owner;
revoke all on function public.music_partial_date_end(text) from public, anon, authenticated;
grant execute on function public.music_partial_date_end(text) to nrm_music_rpc_owner, service_role;

-- ---------------------------------------------------------------------------
-- Expand sync job kinds for verify / promote
-- ---------------------------------------------------------------------------
alter table public.music_sync_job drop constraint if exists ck_music_sync_job_kind;
alter table public.music_sync_job
  add constraint ck_music_sync_job_kind check (job_kind in (
    'mb_lookup','mb_redirect','lastfm_artist_pool','mb_discovery',
    'mb_release_hydrate','mb_recording_hydrate','mb_upcoming_verify',
    'lastfm_tags','embedding','reconcile'
  ));

-- ---------------------------------------------------------------------------
-- Stage upcoming release (replaces ledger apply for collection_mode=upcoming)
-- ---------------------------------------------------------------------------
create or replace function public.music_rpc_stage_upcoming_release(
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
  v_candidate public.music_release_candidate%rowtype;
  v_schedule public.music_collection_schedule%rowtype;
  v_upcoming_id uuid;
  v_release_mbid uuid;
  v_title text;
  v_artist text;
  v_date text;
begin
  perform public.music_reject_unknown_keys(p_payload, array[
    'candidate_id','release_mbid','release_group_mbid','title','artist_credit_name',
    'artist_mbid','release_date_text','release_status','country_code',
    'primary_type','secondary_types'
  ]);

  select * into v_job from public.music_sync_job where job_id = p_job_id for update;
  if not found or v_job.job_kind <> 'mb_release_hydrate' or v_job.job_status <> 'processing'
     or v_job.fence_token is distinct from p_fence_token or v_job.lease_until < now() then
    return query select false, 'FENCE_LOST'::text, null::uuid;
    return;
  end if;

  select * into v_candidate
  from public.music_release_candidate
  where candidate_id = coalesce(v_job.candidate_id, (p_payload->>'candidate_id')::uuid)
  for update;
  if not found then
    return query select false, 'CANDIDATE_MISSING'::text, null::uuid;
    return;
  end if;

  select * into v_schedule
  from public.music_collection_schedule
  where schedule_id = v_job.schedule_id;
  if not found or v_schedule.collection_mode <> 'upcoming' then
    return query select false, 'NOT_UPCOMING_MODE'::text, null::uuid;
    return;
  end if;

  v_release_mbid := coalesce((p_payload->>'release_mbid')::uuid, v_candidate.release_mbid);
  v_title := coalesce(nullif(btrim(p_payload->>'title'), ''), nullif(btrim(v_candidate.title), ''), 'Unknown');
  v_artist := coalesce(nullif(btrim(p_payload->>'artist_credit_name'), ''), '');
  v_date := nullif(btrim(coalesce(p_payload->>'release_date_text', v_candidate.release_date_text)), '');

  insert into public.music_upcoming_release(
    release_mbid, release_group_mbid, title, artist_credit_name, artist_mbid,
    release_date_text, release_status, country_code, primary_type, secondary_types,
    schedule_id, first_seen_schedule_run_id, last_schedule_run_id, staging_status
  ) values (
    v_release_mbid,
    coalesce(nullif(p_payload->>'release_group_mbid','')::uuid, v_candidate.release_group_mbid),
    v_title,
    v_artist,
    coalesce(nullif(p_payload->>'artist_mbid','')::uuid, v_candidate.artist_mbid),
    v_date,
    coalesce(nullif(p_payload->>'release_status',''), v_candidate.release_status),
    coalesce(nullif(p_payload->>'country_code',''), v_candidate.country_code),
    coalesce(nullif(p_payload->>'primary_type',''), v_candidate.primary_type),
    case
      when pg_catalog.jsonb_typeof(p_payload->'secondary_types') = 'array'
           and pg_catalog.jsonb_array_length(p_payload->'secondary_types') > 0
        then array(
          select jsonb_array_elements_text(p_payload->'secondary_types')
        )
      else coalesce(v_candidate.secondary_types, '{}')
    end,
    v_job.schedule_id,
    v_job.schedule_run_id,
    v_job.schedule_run_id,
    'watching'
  )
  on conflict (release_mbid) do update set
    release_group_mbid = coalesce(excluded.release_group_mbid, music_upcoming_release.release_group_mbid),
    title = excluded.title,
    artist_credit_name = case
      when excluded.artist_credit_name <> '' then excluded.artist_credit_name
      else music_upcoming_release.artist_credit_name
    end,
    artist_mbid = coalesce(excluded.artist_mbid, music_upcoming_release.artist_mbid),
    release_date_text = coalesce(excluded.release_date_text, music_upcoming_release.release_date_text),
    release_status = coalesce(excluded.release_status, music_upcoming_release.release_status),
    country_code = coalesce(excluded.country_code, music_upcoming_release.country_code),
    primary_type = coalesce(excluded.primary_type, music_upcoming_release.primary_type),
    secondary_types = case
      when cardinality(excluded.secondary_types) > 0 then excluded.secondary_types
      else music_upcoming_release.secondary_types
    end,
    last_schedule_run_id = excluded.last_schedule_run_id,
    staging_status = case
      when music_upcoming_release.staging_status in ('promoted', 'cancelled')
        then music_upcoming_release.staging_status
      else 'watching'
    end,
    updated_at = now()
  returning music_upcoming_release.upcoming_id into v_upcoming_id;

  update public.music_release_candidate
  set candidate_status = 'applied',
      validation_result = 'staged_upcoming',
      representative_release_mbid = v_release_mbid,
      applied_at = now(),
      updated_at = now()
  where candidate_id = v_candidate.candidate_id;

  update public.music_schedule_run
  set inserted_count = inserted_count + 1
  where schedule_run_id = v_job.schedule_run_id;

  update public.music_sync_job
  set job_status = 'completed', completed_at = now(), lease_until = null, worker_id = null
  where job_id = p_job_id and fence_token = p_fence_token;

  return query select true, 'STAGED'::text, v_upcoming_id;
end;
$$;

alter function public.music_rpc_stage_upcoming_release(uuid, uuid, jsonb)
  owner to nrm_music_rpc_owner;
revoke all on function public.music_rpc_stage_upcoming_release(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.music_rpc_stage_upcoming_release(uuid, uuid, jsonb)
  to service_role;

-- Discovery duplicate: also treat staged upcoming as seen.
drop function if exists public.music_rpc_apply_discovery_page(
  uuid, uuid, integer, integer, integer, bytea, jsonb, boolean
);
create or replace function public.music_rpc_apply_discovery_page(
  p_scan_id uuid,
  p_fence_token uuid,
  p_offset integer,
  p_page_size integer,
  p_total_count integer,
  p_response_hash bytea,
  p_candidates jsonb,
  p_is_last_page boolean
)
returns table(applied boolean, result_code text, candidate_count integer, next_offset integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scan public.music_discovery_scan%rowtype;
  v_item jsonb;
  v_key text;
  v_candidate_id uuid;
  v_count integer := 0;
  v_duplicate integer := 0;
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
        select 1 from public.music_upcoming_release u
        where u.release_mbid = (v_item->>'release_mbid')::uuid
          and u.staging_status in ('watching', 'deferred', 'promote_queued', 'promoted')
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

alter function public.music_rpc_apply_discovery_page(
  uuid, uuid, integer, integer, integer, bytea, jsonb, boolean
) owner to nrm_music_rpc_owner;
revoke all on function public.music_rpc_apply_discovery_page(
  uuid, uuid, integer, integer, integer, bytea, jsonb, boolean
) from public, anon, authenticated;
grant execute on function public.music_rpc_apply_discovery_page(
  uuid, uuid, integer, integer, integer, bytea, jsonb, boolean
) to service_role;

revoke create on schema public from nrm_music_rpc_owner;
