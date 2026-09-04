-- Project 1 collection scheduler, allowlist, discovery, capacity and controlled purge contract.
-- SSOT: docs/supabase-tables/musicbrainz-lastfm-vector.md §§5.10-5.11, 7.10.
-- This migration intentionally contains no seed artists, Edge Function, project-2 or vector schema.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'nrm_music_rpc_owner') then
    create role nrm_music_rpc_owner nologin nosuperuser nocreatedb nocreaterole noinherit;
  end if;
  execute format(
    'grant nrm_music_rpc_owner to %I with set true',
    current_user
  );
end
$$;

create table public.music_collection_schedule (
  schedule_id uuid not null default extensions.gen_random_uuid(),
  schedule_key text not null,
  display_name text not null,
  schedule_kind text not null,
  daily_time_kst time,
  interval_minutes integer,
  next_run_at timestamptz not null default now(),
  is_enabled boolean not null default false,
  claimed_until timestamptz,
  claim_fence_token uuid,
  claimed_by uuid,
  date_from_offset_days integer not null default 0,
  date_to_offset_days integer not null default 365,
  country_codes text[] not null default '{}',
  primary_types text[] not null default '{}',
  secondary_types text[] not null default '{}',
  release_statuses text[] not null default array['Official']::text[],
  max_artist_count integer not null default 50,
  max_request_count integer not null default 45,
  max_new_recording_count integer not null default 500,
  priority integer not null default 100,
  last_disabled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pk_music_collection_schedule primary key (schedule_id),
  constraint ux_music_collection_schedule_key unique (schedule_key),
  constraint ck_music_collection_schedule_names check (btrim(schedule_key) <> '' and btrim(display_name) <> ''),
  constraint ck_music_collection_schedule_kind check (schedule_kind in ('daily','interval')),
  constraint ck_music_collection_schedule_timing check (
    (schedule_kind = 'daily' and daily_time_kst is not null and interval_minutes is null)
    or (schedule_kind = 'interval' and daily_time_kst is null and interval_minutes between 5 and 10080)
  ),
  constraint ck_music_collection_schedule_offsets check (
    date_from_offset_days between -30 and 730
    and date_to_offset_days between -30 and 730
    and date_from_offset_days <= date_to_offset_days
  ),
  constraint ck_music_collection_schedule_limits check (
    max_artist_count between 1 and 100
    and max_request_count between 1 and 500
    and max_new_recording_count between 1 and 5000
  )
);

create table public.music_artist_allowlist (
  artist_mbid uuid not null,
  display_name text not null,
  cohort text not null,
  priority integer not null default 100,
  is_pinned boolean not null default false,
  is_enabled boolean not null default true,
  verified_at timestamptz,
  selection_note text,
  artist_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pk_music_artist_allowlist primary key (artist_mbid),
  constraint fk_music_artist_allowlist_artist foreign key (artist_id)
    references public.music_artist(artist_id) on delete restrict,
  constraint ck_music_artist_allowlist_name check (btrim(display_name) <> ''),
  constraint ck_music_artist_allowlist_cohort check (btrim(cohort) <> '' and char_length(cohort) <= 80),
  constraint ck_music_artist_allowlist_note check (selection_note is null or char_length(selection_note) <= 1000)
);

create table public.music_schedule_artist (
  schedule_id uuid not null,
  artist_mbid uuid not null,
  priority_override integer,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  constraint pk_music_schedule_artist primary key (schedule_id, artist_mbid),
  constraint fk_music_schedule_artist_schedule foreign key (schedule_id)
    references public.music_collection_schedule(schedule_id) on delete cascade,
  constraint fk_music_schedule_artist_allowlist foreign key (artist_mbid)
    references public.music_artist_allowlist(artist_mbid) on delete restrict
);

create table public.music_schedule_run (
  schedule_run_id uuid not null default extensions.gen_random_uuid(),
  schedule_id uuid not null,
  request_key text not null,
  run_status text not null default 'running',
  fence_token uuid not null default extensions.gen_random_uuid(),
  worker_id uuid not null,
  lease_until timestamptz not null,
  date_from date not null,
  date_to date not null,
  request_count integer not null default 0,
  discovered_count integer not null default 0,
  inserted_count integer not null default 0,
  updated_count integer not null default 0,
  duplicate_count integer not null default 0,
  failure_count integer not null default 0,
  capacity_before_bytes bigint,
  capacity_after_bytes bigint,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error_message text,
  constraint pk_music_schedule_run primary key (schedule_run_id),
  constraint ux_music_schedule_run_request_key unique (request_key),
  constraint ux_music_schedule_run_fence unique (schedule_run_id, fence_token),
  constraint fk_music_schedule_run_schedule foreign key (schedule_id)
    references public.music_collection_schedule(schedule_id) on delete restrict,
  constraint ck_music_schedule_run_status check (run_status in ('running','completed','partial','failed','cancelled')),
  constraint ck_music_schedule_run_dates check (date_from <= date_to),
  constraint ck_music_schedule_run_counts check (
    request_count >= 0 and discovered_count >= 0 and inserted_count >= 0
    and updated_count >= 0 and duplicate_count >= 0 and failure_count >= 0
  ),
  constraint ck_music_schedule_run_capacity check (
    (capacity_before_bytes is null or capacity_before_bytes >= 0)
    and (capacity_after_bytes is null or capacity_after_bytes >= 0)
  )
);

create table public.music_discovery_scan (
  discovery_scan_id uuid not null default extensions.gen_random_uuid(),
  schedule_run_id uuid not null,
  schedule_id uuid not null,
  artist_mbid uuid not null,
  request_key text not null,
  scan_status text not null default 'pending',
  next_offset integer not null default 0,
  last_page_size integer,
  total_count integer,
  page_count integer not null default 0,
  response_hash bytea,
  lease_until timestamptz,
  fence_token uuid,
  worker_id uuid,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pk_music_discovery_scan primary key (discovery_scan_id),
  constraint ux_music_discovery_scan_run_artist unique (schedule_run_id, schedule_id, artist_mbid),
  constraint ux_music_discovery_scan_request_key unique (request_key),
  constraint fk_music_discovery_scan_run foreign key (schedule_run_id)
    references public.music_schedule_run(schedule_run_id) on delete cascade,
  constraint fk_music_discovery_scan_schedule_artist foreign key (schedule_id, artist_mbid)
    references public.music_schedule_artist(schedule_id, artist_mbid) on delete restrict,
  constraint ck_music_discovery_scan_status check (scan_status in ('pending','processing','completed','retry','quarantined','failed')),
  constraint ck_music_discovery_scan_counts check (
    next_offset >= 0 and page_count >= 0
    and (last_page_size is null or last_page_size between 0 and 100)
    and (total_count is null or total_count >= 0)
  ),
  constraint ck_music_discovery_scan_hash check (response_hash is null or octet_length(response_hash) = 32)
);

create table public.music_release_candidate (
  candidate_id uuid not null default extensions.gen_random_uuid(),
  schedule_id uuid not null,
  schedule_run_id uuid not null,
  discovery_scan_id uuid not null,
  artist_mbid uuid not null,
  release_mbid uuid not null,
  release_group_mbid uuid,
  request_key text not null,
  title text,
  release_date_text text,
  release_status text,
  country_code text,
  primary_type text,
  secondary_types text[] not null default '{}',
  candidate_status text not null default 'discovered',
  representative_release_mbid uuid,
  validation_result text,
  discovered_at timestamptz not null default now(),
  queued_at timestamptz,
  applied_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint pk_music_release_candidate primary key (candidate_id),
  constraint ux_music_release_candidate_schedule_release unique (schedule_id, release_mbid),
  constraint ux_music_release_candidate_request_key unique (request_key),
  constraint fk_music_release_candidate_schedule foreign key (schedule_id)
    references public.music_collection_schedule(schedule_id) on delete restrict,
  constraint fk_music_release_candidate_run foreign key (schedule_run_id)
    references public.music_schedule_run(schedule_run_id) on delete restrict,
  constraint fk_music_release_candidate_scan foreign key (discovery_scan_id)
    references public.music_discovery_scan(discovery_scan_id) on delete restrict,
  constraint fk_music_release_candidate_artist foreign key (artist_mbid)
    references public.music_artist_allowlist(artist_mbid) on delete restrict,
  constraint ck_music_release_candidate_title check (title is null or btrim(title) <> ''),
  constraint ck_music_release_candidate_date check (
    release_date_text is null or release_date_text ~ '^[0-9]{4}(-[0-9]{2}(-[0-9]{2})?)?$'
  ),
  constraint ck_music_release_candidate_status check (
    candidate_status in ('discovered','queued','hydrating','applied','rejected','quarantined')
  )
);

create table public.music_api_limiter (
  limiter_key text not null,
  minimum_interval_ms integer not null default 1100,
  next_allowed_at timestamptz not null default now(),
  permit_token uuid,
  permit_worker_id uuid,
  permit_expires_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint pk_music_api_limiter primary key (limiter_key),
  constraint ck_music_api_limiter_key check (limiter_key = 'musicbrainz'),
  constraint ck_music_api_limiter_interval check (minimum_interval_ms between 1100 and 60000)
);

insert into public.music_api_limiter(limiter_key) values ('musicbrainz')
on conflict (limiter_key) do nothing;

create table public.music_capacity_policy (
  policy_key text not null,
  warning_bytes bigint not null default 367001600,
  disable_discovery_bytes bigint not null default 398458880,
  write_stop_bytes bigint not null default 419430400,
  hard_limit_bytes bigint not null default 524288000,
  is_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint pk_music_capacity_policy primary key (policy_key),
  constraint ck_music_capacity_policy_key check (policy_key = 'project1'),
  constraint ck_music_capacity_policy_thresholds check (
    warning_bytes > 0 and warning_bytes < disable_discovery_bytes
    and disable_discovery_bytes < write_stop_bytes
    and write_stop_bytes < hard_limit_bytes
  )
);

insert into public.music_capacity_policy(policy_key) values ('project1')
on conflict (policy_key) do nothing;

create table public.music_capacity_snapshot (
  snapshot_id uuid not null default extensions.gen_random_uuid(),
  source text not null,
  database_bytes bigint not null,
  relation_bytes jsonb not null default '{}'::jsonb,
  capacity_state text not null,
  captured_at timestamptz not null default now(),
  constraint pk_music_capacity_snapshot primary key (snapshot_id),
  constraint ck_music_capacity_snapshot_source check (btrim(source) <> ''),
  constraint ck_music_capacity_snapshot_bytes check (database_bytes >= 0),
  constraint ck_music_capacity_snapshot_state check (capacity_state in ('normal','warning','discovery_disabled','write_stopped'))
);

create table public.music_capacity_event (
  capacity_event_id uuid not null default extensions.gen_random_uuid(),
  snapshot_id uuid,
  event_kind text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint pk_music_capacity_event primary key (capacity_event_id),
  constraint fk_music_capacity_event_snapshot foreign key (snapshot_id)
    references public.music_capacity_snapshot(snapshot_id) on delete restrict,
  constraint ck_music_capacity_event_kind check (
    event_kind in ('threshold_entered','schedules_disabled','retention_cleanup','purge_dry_run','purge_completed')
  )
);

create table public.music_retention_policy (
  policy_key text not null,
  successful_run_days integer not null default 30,
  successful_detail_days integer not null default 30,
  failed_detail_days integer not null default 90,
  resolved_dead_letter_days integer not null default 180,
  updated_at timestamptz not null default now(),
  constraint pk_music_retention_policy primary key (policy_key),
  constraint ck_music_retention_policy_key check (policy_key = 'project1'),
  constraint ck_music_retention_policy_days check (
    successful_run_days between 1 and 3650
    and successful_detail_days between 1 and 3650
    and failed_detail_days between 1 and 3650
    and resolved_dead_letter_days between 1 and 3650
  )
);

insert into public.music_retention_policy(policy_key) values ('project1')
on conflict (policy_key) do nothing;

create table public.music_purge_batch (
  purge_batch_id uuid not null default extensions.gen_random_uuid(),
  reason text not null,
  requested_album_count integer not null,
  is_dry_run boolean not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  purged_album_count integer not null default 0,
  constraint pk_music_purge_batch primary key (purge_batch_id),
  constraint ck_music_purge_batch_reason check (btrim(reason) <> '' and char_length(reason) <= 500),
  constraint ck_music_purge_batch_counts check (requested_album_count between 1 and 100 and purged_album_count >= 0)
);

create table public.music_purge_entity_tombstone (
  entity_type text not null,
  entity_id uuid not null,
  canonical_mbid uuid,
  purge_batch_id uuid not null,
  purge_reason text not null,
  purged_at timestamptz not null default now(),
  constraint pk_music_purge_entity_tombstone primary key (entity_type, entity_id),
  constraint fk_music_purge_entity_tombstone_batch foreign key (purge_batch_id)
    references public.music_purge_batch(purge_batch_id) on delete restrict,
  constraint ck_music_purge_entity_tombstone_type check (entity_type in ('album','release','track','recording')),
  constraint ck_music_purge_entity_tombstone_reason check (btrim(purge_reason) <> '')
);

create table public.music_recording_purge_tombstone (
  recording_id uuid not null,
  canonical_mbid uuid,
  source_version bigint not null default 1,
  vector_delete_status text not null default 'pending',
  purge_batch_id uuid not null,
  purged_at timestamptz not null default now(),
  vector_deleted_at timestamptz,
  constraint pk_music_recording_purge_tombstone primary key (recording_id),
  constraint fk_music_recording_purge_tombstone_batch foreign key (purge_batch_id)
    references public.music_purge_batch(purge_batch_id) on delete restrict,
  constraint ck_music_recording_purge_tombstone_version check (source_version > 0),
  constraint ck_music_recording_purge_tombstone_status check (
    vector_delete_status in ('pending','delivered','not_required')
  )
);

-- Connect the existing durable job/run ledgers to schedule discovery.
alter table public.music_sync_job
  drop constraint ck_music_sync_job_kind,
  add constraint ck_music_sync_job_kind check (
    job_kind in (
      'mb_lookup','mb_redirect','mb_discovery','mb_release_hydrate','mb_recording_hydrate',
      'lastfm_tags','embedding','reconcile'
    )
  ),
  add column schedule_id uuid,
  add column schedule_run_id uuid,
  add column candidate_id uuid,
  add column discovery_scan_id uuid,
  add constraint fk_music_sync_job_schedule foreign key (schedule_id)
    references public.music_collection_schedule(schedule_id) on delete restrict,
  add constraint fk_music_sync_job_schedule_run foreign key (schedule_run_id)
    references public.music_schedule_run(schedule_run_id) on delete restrict,
  add constraint fk_music_sync_job_candidate foreign key (candidate_id)
    references public.music_release_candidate(candidate_id) on delete restrict,
  add constraint fk_music_sync_job_discovery_scan foreign key (discovery_scan_id)
    references public.music_discovery_scan(discovery_scan_id) on delete restrict,
  add constraint ck_music_sync_job_collection_links check (
    (job_kind = 'mb_discovery' and schedule_id is not null and schedule_run_id is not null
      and discovery_scan_id is not null and candidate_id is null)
    or (job_kind = 'mb_release_hydrate' and schedule_id is not null and schedule_run_id is not null
      and candidate_id is not null)
    or job_kind not in ('mb_discovery','mb_release_hydrate')
  );

alter table public.music_sync_run
  drop constraint ck_music_sync_run_kind,
  add constraint ck_music_sync_run_kind check (run_kind in ('musicbrainz','discovery','lastfm','reconcile','retention','purge')),
  add column schedule_id uuid,
  add column schedule_run_id uuid,
  add column discovered_count integer not null default 0,
  add column inserted_count integer not null default 0,
  add column updated_count integer not null default 0,
  add column duplicate_count integer not null default 0,
  add column capacity_before_bytes bigint,
  add column capacity_after_bytes bigint,
  add constraint fk_music_sync_run_schedule foreign key (schedule_id)
    references public.music_collection_schedule(schedule_id) on delete restrict,
  add constraint fk_music_sync_run_schedule_run foreign key (schedule_run_id)
    references public.music_schedule_run(schedule_run_id) on delete restrict,
  add constraint ck_music_sync_run_collection_counts check (
    discovered_count >= 0 and inserted_count >= 0 and updated_count >= 0 and duplicate_count >= 0
  );

create index ix_music_collection_schedule_due on public.music_collection_schedule(priority, next_run_at)
  where is_enabled;
create index ix_music_collection_schedule_claim on public.music_collection_schedule(claimed_until)
  where claimed_until is not null;
create index ix_music_artist_allowlist_enabled on public.music_artist_allowlist(cohort, priority, artist_mbid)
  where is_enabled;
create index ix_music_artist_allowlist_artist on public.music_artist_allowlist(artist_id)
  where artist_id is not null;
create index ix_music_schedule_artist_artist on public.music_schedule_artist(artist_mbid);
create index ix_music_schedule_run_schedule_started on public.music_schedule_run(schedule_id, started_at desc);
create index ix_music_schedule_run_lease on public.music_schedule_run(lease_until) where run_status = 'running';
create index ix_music_discovery_scan_claim on public.music_discovery_scan(scan_status, lease_until, created_at);
create index ix_music_discovery_scan_schedule on public.music_discovery_scan(schedule_id, artist_mbid);
create index ix_music_release_candidate_run on public.music_release_candidate(schedule_run_id);
create index ix_music_release_candidate_scan on public.music_release_candidate(discovery_scan_id);
create index ix_music_release_candidate_artist on public.music_release_candidate(artist_mbid);
create index ix_music_release_candidate_status on public.music_release_candidate(candidate_status, discovered_at);
create index ix_music_capacity_snapshot_captured on public.music_capacity_snapshot(captured_at desc);
create index ix_music_capacity_event_created on public.music_capacity_event(created_at desc);
create index ix_music_purge_entity_tombstone_mbid on public.music_purge_entity_tombstone(canonical_mbid)
  where canonical_mbid is not null;
create index ix_music_recording_purge_tombstone_pending on public.music_recording_purge_tombstone(purged_at)
  where vector_delete_status = 'pending';
create index ix_music_sync_job_schedule on public.music_sync_job(schedule_id) where schedule_id is not null;
create index ix_music_sync_job_schedule_run on public.music_sync_job(schedule_run_id) where schedule_run_id is not null;
create index ix_music_sync_job_candidate on public.music_sync_job(candidate_id) where candidate_id is not null;
create index ix_music_sync_job_discovery_scan on public.music_sync_job(discovery_scan_id) where discovery_scan_id is not null;
create index ix_music_sync_run_schedule on public.music_sync_run(schedule_id) where schedule_id is not null;
create index ix_music_sync_run_schedule_run on public.music_sync_run(schedule_run_id) where schedule_run_id is not null;

create trigger trg_music_collection_schedule_updated_at before update on public.music_collection_schedule
  for each row execute function public.music_set_updated_at();
create trigger trg_music_artist_allowlist_updated_at before update on public.music_artist_allowlist
  for each row execute function public.music_set_updated_at();
create trigger trg_music_discovery_scan_updated_at before update on public.music_discovery_scan
  for each row execute function public.music_set_updated_at();
create trigger trg_music_release_candidate_updated_at before update on public.music_release_candidate
  for each row execute function public.music_set_updated_at();
create trigger trg_music_api_limiter_updated_at before update on public.music_api_limiter
  for each row execute function public.music_set_updated_at();
create trigger trg_music_capacity_policy_updated_at before update on public.music_capacity_policy
  for each row execute function public.music_set_updated_at();
create trigger trg_music_retention_policy_updated_at before update on public.music_retention_policy
  for each row execute function public.music_set_updated_at();

-- Keep the existing trigger in place; permit deletion only inside the dedicated owner's purge transaction.
create or replace function public.music_prevent_hard_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'nrm_music_rpc_owner'
     and pg_catalog.current_setting('nrm.music_capacity_purge', true) = 'on' then
    return old;
  end if;
  raise exception using
    errcode = '23503',
    message = format('hard delete is forbidden for authoritative ledger table %I.%I', tg_table_schema, tg_table_name);
end;
$$;

create function public.music_reject_unknown_keys(p_payload jsonb, p_allowed text[])
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare v_key text;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'payload must be a JSON object';
  end if;
  for v_key in select jsonb_object_keys(p_payload)
  loop
    if not (v_key = any(p_allowed)) then
      raise exception using errcode = '22023', message = format('unknown payload key: %s', v_key);
    end if;
  end loop;
end;
$$;

create function public.music_rpc_capture_capacity(p_source text)
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
      and (c.relname like 'music_%' or c.relname like 'lastfm_%')
    order by pg_catalog.pg_total_relation_size(c.oid) desc
    limit 40
  ) s;
  v_state := case
    when v_bytes >= v_policy.write_stop_bytes then 'write_stopped'
    when v_bytes >= v_policy.disable_discovery_bytes then 'discovery_disabled'
    when v_bytes >= v_policy.warning_bytes then 'warning'
    else 'normal'
  end;
  insert into public.music_capacity_snapshot(source, database_bytes, relation_bytes, capacity_state)
  values (p_source, v_bytes, v_relations, v_state) returning music_capacity_snapshot.snapshot_id into v_snapshot;
  return query select v_snapshot, v_bytes, v_state,
    v_bytes < v_policy.write_stop_bytes, v_bytes < v_policy.disable_discovery_bytes;
end;
$$;

create function public.music_rpc_claim_due_schedules(
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
    update public.music_collection_schedule
      set is_enabled = false, last_disabled_reason = 'capacity_threshold', claimed_until = null,
          claim_fence_token = null, claimed_by = null
      where is_enabled;
    if found then
      insert into public.music_capacity_event(event_kind, detail)
      values ('schedules_disabled', jsonb_build_object('database_bytes', v_bytes));
    end if;
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

create function public.music_rpc_finish_schedule_run(
  p_schedule_run_id uuid, p_fence_token uuid, p_status text, p_stats jsonb
)
returns table(applied boolean, result_code text)
language plpgsql security definer set search_path = ''
as $$
declare v_updated integer;
begin
  perform public.music_reject_unknown_keys(p_stats, array[
    'request_count','discovered_count','inserted_count','updated_count',
    'duplicate_count','failure_count','error_message'
  ]);
  if p_status not in ('completed','partial','failed','cancelled') then
    raise exception using errcode = '22023', message = 'invalid schedule run status';
  end if;
  update public.music_schedule_run set
    run_status = p_status, finished_at = now(),
    request_count = coalesce((p_stats->>'request_count')::integer, request_count),
    discovered_count = coalesce((p_stats->>'discovered_count')::integer, discovered_count),
    inserted_count = coalesce((p_stats->>'inserted_count')::integer, inserted_count),
    updated_count = coalesce((p_stats->>'updated_count')::integer, updated_count),
    duplicate_count = coalesce((p_stats->>'duplicate_count')::integer, duplicate_count),
    failure_count = coalesce((p_stats->>'failure_count')::integer, failure_count),
    error_message = left(p_stats->>'error_message', 1000),
    capacity_after_bytes = pg_catalog.pg_database_size(pg_catalog.current_database())
  where schedule_run_id = p_schedule_run_id and fence_token = p_fence_token and run_status = 'running';
  get diagnostics v_updated = row_count;
  if v_updated = 0 then return query select false, 'FENCE_LOST'::text; return; end if;
  update public.music_collection_schedule s set claimed_until = null, claim_fence_token = null, claimed_by = null
  from public.music_schedule_run r
  where r.schedule_run_id = p_schedule_run_id and s.schedule_id = r.schedule_id
    and s.claim_fence_token = p_fence_token;
  return query select true, 'APPLIED'::text;
end;
$$;

create function public.music_rpc_acquire_mb_permit(
  p_worker_id uuid, p_lease_seconds integer default 15
)
returns table(granted boolean, retry_at timestamptz, permit_token uuid)
language plpgsql security definer set search_path = ''
as $$
declare v_row public.music_api_limiter%rowtype; v_token uuid;
begin
  if p_worker_id is null or p_lease_seconds not between 5 and 60 then
    raise exception using errcode = '22023', message = 'invalid permit parameters';
  end if;
  select * into v_row from public.music_api_limiter where limiter_key = 'musicbrainz' for update;
  if v_row.next_allowed_at > clock_timestamp() then
    return query select false, v_row.next_allowed_at, null::uuid; return;
  end if;
  v_token := extensions.gen_random_uuid();
  update public.music_api_limiter set
    next_allowed_at = clock_timestamp() + (minimum_interval_ms * interval '1 millisecond'),
    permit_token = v_token, permit_worker_id = p_worker_id,
    permit_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds)
  where limiter_key = 'musicbrainz';
  return query select true,
    clock_timestamp() + (v_row.minimum_interval_ms * interval '1 millisecond'), v_token;
end;
$$;

create function public.music_rpc_claim_jobs(
  p_worker_id uuid, p_job_kind text, p_batch_size integer, p_lease_seconds integer
)
returns table(job_id uuid, entity_type text, entity_id uuid, fence_token uuid, expected_row_version bigint)
language plpgsql security definer set search_path = ''
as $$
begin
  if p_worker_id is null or p_job_kind is null or p_batch_size not between 1 and 50
     or p_lease_seconds not between 15 and 300 then
    raise exception using errcode = '22023', message = 'invalid job claim parameters';
  end if;
  if p_job_kind not in ('reconcile') and exists (
    select 1 from public.music_capacity_policy p
    where p.policy_key = 'project1' and p.is_enabled
      and pg_catalog.pg_database_size(pg_catalog.current_database()) >= p.write_stop_bytes
  ) then
    return;
  end if;
  return query
  with picked as (
    select j.job_id from public.music_sync_job j
    where j.job_kind = p_job_kind
      and (
        (j.job_status in ('pending','retry') and j.available_at <= now())
        or (j.job_status = 'processing' and j.lease_until < now())
      )
    order by j.priority desc, j.available_at, j.created_at
    for update skip locked limit p_batch_size
  ), claimed as (
    update public.music_sync_job j set
      job_status = 'processing', worker_id = p_worker_id,
      fence_token = extensions.gen_random_uuid(),
      lease_until = now() + make_interval(secs => p_lease_seconds),
      attempt_count = attempt_count + 1
    from picked p where j.job_id = p.job_id
    returning j.*
  ), scans as (
    update public.music_discovery_scan d set
      scan_status = 'processing', worker_id = p_worker_id,
      fence_token = c.fence_token, lease_until = c.lease_until,
      started_at = coalesce(d.started_at, now())
    from claimed c where d.discovery_scan_id = c.discovery_scan_id
    returning d.discovery_scan_id
  )
  select c.job_id, c.entity_type, c.entity_id, c.fence_token, c.expected_row_version from claimed c;
end;
$$;

create function public.music_rpc_finish_job(
  p_job_id uuid, p_fence_token uuid, p_outcome text,
  p_http_status integer default null, p_api_error_code integer default null,
  p_error_message text default null, p_retry_at timestamptz default null
)
returns table(applied boolean, result_code text)
language plpgsql security definer set search_path = ''
as $$
declare v_updated integer;
begin
  if p_outcome not in ('completed','retry','blocked','quarantined','dead') then
    raise exception using errcode = '22023', message = 'invalid job outcome';
  end if;
  if p_outcome = 'retry' and p_retry_at is null then
    raise exception using errcode = '22023', message = 'retry_at required';
  end if;
  update public.music_sync_job set
    job_status = p_outcome, http_status = p_http_status, api_error_code = p_api_error_code,
    last_error_message = left(p_error_message, 1000),
    available_at = case when p_outcome = 'retry' then p_retry_at else available_at end,
    completed_at = case when p_outcome = 'completed' then now() else null end,
    lease_until = null, worker_id = null
  where music_sync_job.job_id = p_job_id and fence_token = p_fence_token and job_status = 'processing';
  get diagnostics v_updated = row_count;
  if v_updated = 0 then return query select false, 'FENCE_LOST'::text; return; end if;
  return query select true, 'APPLIED'::text;
end;
$$;

create function public.music_rpc_apply_discovery_page(
  p_scan_id uuid, p_fence_token uuid, p_offset integer, p_page_size integer,
  p_total_count integer, p_response_hash bytea, p_candidates jsonb, p_is_last_page boolean
)
returns table(applied boolean, result_code text, candidate_count integer, next_offset integer)
language plpgsql security definer set search_path = ''
as $$
declare
  v_scan public.music_discovery_scan%rowtype;
  v_item jsonb;
  v_count integer := 0;
  v_candidate_id uuid;
  v_key text;
begin
  if p_offset < 0 or p_page_size not between 0 and 100 or p_total_count < 0
     or octet_length(p_response_hash) <> 32 or jsonb_typeof(p_candidates) <> 'array'
     or jsonb_array_length(p_candidates) > 100 then
    raise exception using errcode = '22023', message = 'invalid discovery page';
  end if;
  if exists (
    select 1 from public.music_capacity_policy p
    where p.policy_key = 'project1' and p.is_enabled
      and pg_catalog.pg_database_size(pg_catalog.current_database()) >= p.write_stop_bytes
  ) then
    return query select false, 'CAPACITY_WRITE_STOPPED'::text, 0, p_offset; return;
  end if;
  select * into v_scan from public.music_discovery_scan
  where discovery_scan_id = p_scan_id for update;
  if not found or v_scan.scan_status <> 'processing' or v_scan.fence_token is distinct from p_fence_token
     or v_scan.lease_until < now() then
    return query select false, 'FENCE_LOST'::text, 0, coalesce(v_scan.next_offset, 0); return;
  end if;
  if v_scan.next_offset <> p_offset then
    return query select false, 'VERSION_CONFLICT'::text, 0, v_scan.next_offset; return;
  end if;
  for v_item in select value from jsonb_array_elements(p_candidates)
  loop
    perform public.music_reject_unknown_keys(v_item, array[
      'release_mbid','release_group_mbid','title','release_date_text','release_status',
      'country_code','primary_type','secondary_types'
    ]);
    v_key := encode(extensions.digest(
      v_scan.schedule_id::text || ':' || (v_item->>'release_mbid'), 'sha256'), 'hex');
    insert into public.music_release_candidate(
      schedule_id, schedule_run_id, discovery_scan_id, artist_mbid,
      release_mbid, release_group_mbid, request_key, title, release_date_text,
      release_status, country_code, primary_type, secondary_types, candidate_status, queued_at
    ) values (
      v_scan.schedule_id, v_scan.schedule_run_id, v_scan.discovery_scan_id, v_scan.artist_mbid,
      (v_item->>'release_mbid')::uuid, nullif(v_item->>'release_group_mbid','')::uuid,
      v_key, nullif(v_item->>'title',''), nullif(v_item->>'release_date_text',''),
      nullif(v_item->>'release_status',''), nullif(v_item->>'country_code',''),
      nullif(v_item->>'primary_type',''),
      coalesce(array(select jsonb_array_elements_text(coalesce(v_item->'secondary_types','[]'::jsonb))), '{}'),
      'queued', now()
    )
    on conflict (schedule_id, release_mbid) do update set
      updated_at = now()
    returning candidate_id into v_candidate_id;
    insert into public.music_sync_job(
      job_kind, entity_type, entity_id, idempotency_key, priority,
      schedule_id, schedule_run_id, candidate_id
    ) values (
      'mb_release_hydrate', 'release', (v_item->>'release_mbid')::uuid,
      'release-hydrate:' || v_key, 0, v_scan.schedule_id, v_scan.schedule_run_id, v_candidate_id
    ) on conflict (idempotency_key) do nothing;
    v_count := v_count + 1;
  end loop;
  update public.music_discovery_scan set
    next_offset = p_offset + p_page_size, last_page_size = p_page_size,
    total_count = p_total_count, page_count = page_count + 1, response_hash = p_response_hash,
    scan_status = case when p_is_last_page then 'completed' else 'processing' end,
    completed_at = case when p_is_last_page then now() else null end,
    lease_until = case when p_is_last_page then null else lease_until end
  where discovery_scan_id = p_scan_id;
  update public.music_schedule_run set discovered_count = discovered_count + v_count
  where schedule_run_id = v_scan.schedule_run_id;
  return query select true, 'APPLIED'::text, v_count, p_offset + p_page_size;
end;
$$;

create function public.music_rpc_apply_release_bundle(
  p_job_id uuid, p_fence_token uuid, p_payload jsonb
)
returns table(applied boolean, result_code text, candidate_id uuid)
language plpgsql security definer set search_path = ''
as $$
declare v_job public.music_sync_job%rowtype; v_status text;
begin
  perform public.music_reject_unknown_keys(p_payload, array[
    'candidate_id','release_mbid','release_group_mbid','validation_status',
    'representative_release_mbid','inserted_count','updated_count','duplicate_count'
  ]);
  if exists (
    select 1 from public.music_capacity_policy p
    where p.policy_key = 'project1' and p.is_enabled
      and pg_catalog.pg_database_size(pg_catalog.current_database()) >= p.write_stop_bytes
  ) then
    return query select false, 'CAPACITY_WRITE_STOPPED'::text, null::uuid; return;
  end if;
  select * into v_job from public.music_sync_job where job_id = p_job_id for update;
  if not found or v_job.job_kind <> 'mb_release_hydrate' or v_job.job_status <> 'processing'
     or v_job.fence_token is distinct from p_fence_token or v_job.lease_until < now() then
    return query select false, 'FENCE_LOST'::text, v_job.candidate_id; return;
  end if;
  if (p_payload->>'candidate_id')::uuid is distinct from v_job.candidate_id then
    return query select false, 'INVALID_PAYLOAD'::text, v_job.candidate_id; return;
  end if;
  v_status := p_payload->>'validation_status';
  if v_status is null or v_status not in ('applied','rejected','quarantined') then
    return query select false, 'INVALID_PAYLOAD'::text, v_job.candidate_id; return;
  end if;
  update public.music_release_candidate set
    release_group_mbid = coalesce(nullif(p_payload->>'release_group_mbid','')::uuid, release_group_mbid),
    representative_release_mbid = nullif(p_payload->>'representative_release_mbid','')::uuid,
    validation_result = v_status, candidate_status = v_status,
    applied_at = case when v_status = 'applied' then now() else null end
  where music_release_candidate.candidate_id = v_job.candidate_id
    and release_mbid = (p_payload->>'release_mbid')::uuid;
  if not found then
    return query select false, 'INVALID_PAYLOAD'::text, v_job.candidate_id; return;
  end if;
  update public.music_schedule_run set
    inserted_count = inserted_count + coalesce((p_payload->>'inserted_count')::integer, 0),
    updated_count = updated_count + coalesce((p_payload->>'updated_count')::integer, 0),
    duplicate_count = duplicate_count + coalesce((p_payload->>'duplicate_count')::integer, 0),
    failure_count = failure_count + case when v_status = 'applied' then 0 else 1 end
  where schedule_run_id = v_job.schedule_run_id;
  update public.music_sync_job set job_status = 'completed', completed_at = now(), lease_until = null
  where job_id = p_job_id and fence_token = p_fence_token;
  return query select true, 'APPLIED'::text, v_job.candidate_id;
end;
$$;

create function public.music_rpc_run_retention(p_batch_size integer default 1000)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_policy public.music_retention_policy%rowtype; v_runs integer; v_dead integer;
begin
  if p_batch_size not between 1 and 10000 then
    raise exception using errcode = '22023', message = 'invalid retention batch size';
  end if;
  select * into v_policy from public.music_retention_policy where policy_key = 'project1';
  with doomed as (
    select run_id from public.music_sync_run
    where run_status = 'completed'
      and finished_at < now() - make_interval(days => v_policy.successful_run_days)
    order by finished_at limit p_batch_size
  )
  delete from public.music_sync_run r using doomed d where r.run_id = d.run_id;
  get diagnostics v_runs = row_count;
  with doomed as (
    select dead_letter_id from public.music_dead_letter
    where resolved_at < now() - make_interval(days => v_policy.resolved_dead_letter_days)
    order by resolved_at limit p_batch_size
  )
  delete from public.music_dead_letter d using doomed x where d.dead_letter_id = x.dead_letter_id;
  get diagnostics v_dead = row_count;
  insert into public.music_capacity_event(event_kind, detail)
    values ('retention_cleanup', jsonb_build_object('sync_runs', v_runs, 'dead_letters', v_dead));
  return jsonb_build_object('sync_runs', v_runs, 'dead_letters', v_dead);
end;
$$;

create function public.music_rpc_capacity_purge(
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

create function public.music_rpc_admin_schedule_upsert(
  p_caller_serial text, p_schedule_id uuid, p_payload jsonb
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid := coalesce(p_schedule_id, extensions.gen_random_uuid());
begin
  if not public.nrm_is_admin_caller(p_caller_serial) then
    raise exception using errcode = '42501', message = 'admin required';
  end if;
  perform public.music_reject_unknown_keys(p_payload, array[
    'schedule_key','display_name','schedule_kind','daily_time_kst','interval_minutes',
    'next_run_at','is_enabled','date_from_offset_days','date_to_offset_days',
    'country_codes','primary_types','secondary_types','release_statuses',
    'max_artist_count','max_request_count','max_new_recording_count','priority'
  ]);
  insert into public.music_collection_schedule(
    schedule_id, schedule_key, display_name, schedule_kind, daily_time_kst, interval_minutes,
    next_run_at, is_enabled, date_from_offset_days, date_to_offset_days,
    country_codes, primary_types, secondary_types, release_statuses,
    max_artist_count, max_request_count, max_new_recording_count, priority
  ) values (
    v_id, p_payload->>'schedule_key', p_payload->>'display_name', p_payload->>'schedule_kind',
    nullif(p_payload->>'daily_time_kst','')::time, (p_payload->>'interval_minutes')::integer,
    coalesce((p_payload->>'next_run_at')::timestamptz, now()),
    coalesce((p_payload->>'is_enabled')::boolean, false),
    coalesce((p_payload->>'date_from_offset_days')::integer, 0),
    coalesce((p_payload->>'date_to_offset_days')::integer, 365),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'country_codes','[]'::jsonb))), '{}'),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'primary_types','[]'::jsonb))), '{}'),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'secondary_types','[]'::jsonb))), '{}'),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'release_statuses','["Official"]'::jsonb))), '{}'),
    coalesce((p_payload->>'max_artist_count')::integer, 50),
    coalesce((p_payload->>'max_request_count')::integer, 45),
    coalesce((p_payload->>'max_new_recording_count')::integer, 500),
    coalesce((p_payload->>'priority')::integer, 100)
  )
  on conflict (schedule_id) do update set
    schedule_key = excluded.schedule_key, display_name = excluded.display_name,
    schedule_kind = excluded.schedule_kind, daily_time_kst = excluded.daily_time_kst,
    interval_minutes = excluded.interval_minutes, next_run_at = excluded.next_run_at,
    is_enabled = excluded.is_enabled, date_from_offset_days = excluded.date_from_offset_days,
    date_to_offset_days = excluded.date_to_offset_days, country_codes = excluded.country_codes,
    primary_types = excluded.primary_types, secondary_types = excluded.secondary_types,
    release_statuses = excluded.release_statuses, max_artist_count = excluded.max_artist_count,
    max_request_count = excluded.max_request_count,
    max_new_recording_count = excluded.max_new_recording_count, priority = excluded.priority;
  return v_id;
end;
$$;

create function public.music_rpc_admin_schedule_set_enabled(
  p_caller_serial text, p_schedule_id uuid, p_enabled boolean
)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
  if not public.nrm_is_admin_caller(p_caller_serial) then
    raise exception using errcode = '42501', message = 'admin required';
  end if;
  update public.music_collection_schedule set is_enabled = p_enabled,
    last_disabled_reason = case when p_enabled then null else 'admin' end
  where schedule_id = p_schedule_id;
  return found;
end;
$$;

create function public.music_rpc_admin_schedule_run_now(
  p_caller_serial text, p_schedule_id uuid
)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
  if not public.nrm_is_admin_caller(p_caller_serial) then
    raise exception using errcode = '42501', message = 'admin required';
  end if;
  update public.music_collection_schedule set next_run_at = now(), claimed_until = null,
    claim_fence_token = null, claimed_by = null where schedule_id = p_schedule_id and is_enabled;
  return found;
end;
$$;

create function public.music_rpc_admin_allowlist_upsert(
  p_caller_serial text, p_payload jsonb
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_mbid uuid;
begin
  if not public.nrm_is_admin_caller(p_caller_serial) then
    raise exception using errcode = '42501', message = 'admin required';
  end if;
  perform public.music_reject_unknown_keys(p_payload, array[
    'artist_mbid','display_name','cohort','priority','is_pinned','is_enabled',
    'verified_at','selection_note','artist_id'
  ]);
  v_mbid := (p_payload->>'artist_mbid')::uuid;
  insert into public.music_artist_allowlist(
    artist_mbid, display_name, cohort, priority, is_pinned, is_enabled,
    verified_at, selection_note, artist_id
  ) values (
    v_mbid, p_payload->>'display_name', p_payload->>'cohort',
    coalesce((p_payload->>'priority')::integer, 100),
    coalesce((p_payload->>'is_pinned')::boolean, false),
    coalesce((p_payload->>'is_enabled')::boolean, true),
    (p_payload->>'verified_at')::timestamptz, nullif(p_payload->>'selection_note',''),
    nullif(p_payload->>'artist_id','')::uuid
  )
  on conflict (artist_mbid) do update set
    display_name = excluded.display_name, cohort = excluded.cohort, priority = excluded.priority,
    is_pinned = excluded.is_pinned, is_enabled = excluded.is_enabled,
    verified_at = excluded.verified_at, selection_note = excluded.selection_note,
    artist_id = excluded.artist_id;
  return v_mbid;
end;
$$;

create function public.music_rpc_admin_allowlist_set_enabled(
  p_caller_serial text, p_artist_mbid uuid, p_enabled boolean
)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
  if not public.nrm_is_admin_caller(p_caller_serial) then
    raise exception using errcode = '42501', message = 'admin required';
  end if;
  update public.music_artist_allowlist set is_enabled = p_enabled where artist_mbid = p_artist_mbid;
  return found;
end;
$$;

create function public.music_rpc_admin_overview(
  p_caller_serial text, p_limit integer default 50, p_offset integer default 0
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_result jsonb;
begin
  if not public.nrm_is_admin_caller(p_caller_serial) then
    raise exception using errcode = '42501', message = 'admin required';
  end if;
  if p_limit not between 1 and 200 or p_offset < 0 then
    raise exception using errcode = '22023', message = 'invalid pagination';
  end if;
  select jsonb_build_object(
    'schedules', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select * from public.music_collection_schedule order by priority, schedule_key limit p_limit offset p_offset
    ) x), '[]'::jsonb),
    'allowlist_count', (select count(*) from public.music_artist_allowlist),
    'pending_jobs', (select count(*) from public.music_sync_job where job_status in ('pending','retry','processing')),
    'recent_runs', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select * from public.music_schedule_run order by started_at desc limit least(p_limit, 50)
    ) x), '[]'::jsonb),
    'capacity', (select to_jsonb(x) from (
      select * from public.music_capacity_snapshot order by captured_at desc limit 1
    ) x)
  ) into v_result;
  return v_result;
end;
$$;

-- Owner and least-privilege execution contract.
grant usage, create on schema public to nrm_music_rpc_owner;
grant usage on schema extensions to nrm_music_rpc_owner;
alter function public.music_rpc_capture_capacity(text) owner to nrm_music_rpc_owner;
alter function public.music_rpc_claim_due_schedules(uuid, integer, integer) owner to nrm_music_rpc_owner;
alter function public.music_rpc_finish_schedule_run(uuid, uuid, text, jsonb) owner to nrm_music_rpc_owner;
alter function public.music_rpc_acquire_mb_permit(uuid, integer) owner to nrm_music_rpc_owner;
alter function public.music_rpc_claim_jobs(uuid, text, integer, integer) owner to nrm_music_rpc_owner;
alter function public.music_rpc_finish_job(uuid, uuid, text, integer, integer, text, timestamptz) owner to nrm_music_rpc_owner;
alter function public.music_rpc_apply_discovery_page(uuid, uuid, integer, integer, integer, bytea, jsonb, boolean) owner to nrm_music_rpc_owner;
alter function public.music_rpc_apply_release_bundle(uuid, uuid, jsonb) owner to nrm_music_rpc_owner;
alter function public.music_rpc_run_retention(integer) owner to nrm_music_rpc_owner;
alter function public.music_rpc_capacity_purge(integer, text, boolean) owner to nrm_music_rpc_owner;
alter function public.music_rpc_admin_schedule_upsert(text, uuid, jsonb) owner to nrm_music_rpc_owner;
alter function public.music_rpc_admin_schedule_set_enabled(text, uuid, boolean) owner to nrm_music_rpc_owner;
alter function public.music_rpc_admin_schedule_run_now(text, uuid) owner to nrm_music_rpc_owner;
alter function public.music_rpc_admin_allowlist_upsert(text, jsonb) owner to nrm_music_rpc_owner;
alter function public.music_rpc_admin_allowlist_set_enabled(text, uuid, boolean) owner to nrm_music_rpc_owner;
alter function public.music_rpc_admin_overview(text, integer, integer) owner to nrm_music_rpc_owner;

grant usage on schema public, extensions to nrm_music_rpc_owner;
grant execute on function public.nrm_is_admin_caller(text) to nrm_music_rpc_owner;
grant execute on function public.music_reject_unknown_keys(jsonb, text[]) to nrm_music_rpc_owner;
grant execute on function public.music_set_updated_at() to nrm_music_rpc_owner;
grant select, insert, update, delete on table
  public.music_collection_schedule, public.music_artist_allowlist, public.music_schedule_artist,
  public.music_schedule_run, public.music_discovery_scan, public.music_release_candidate,
  public.music_api_limiter, public.music_capacity_policy, public.music_capacity_snapshot,
  public.music_capacity_event, public.music_retention_policy, public.music_purge_batch,
  public.music_purge_entity_tombstone, public.music_recording_purge_tombstone,
  public.music_sync_job, public.music_sync_run, public.music_dead_letter
to nrm_music_rpc_owner;
grant select, delete on table
  public.music_album, public.music_release, public.music_recording, public.music_track,
  public.music_album_mbid, public.music_release_mbid, public.music_recording_mbid,
  public.music_track_mbid, public.music_recording_duplicate_candidate,
  public.lastfm_recording_profile, public.lastfm_tag_fetch, public.lastfm_recording_tag
to nrm_music_rpc_owner;
grant select on table
  public.music_artist, public.music_artist_mbid, public.music_recording_redirect,
  public.music_entity_merge_audit
to nrm_music_rpc_owner;
revoke create on schema public from nrm_music_rpc_owner;

-- service_role may mutate through RPCs, but cannot directly hard-delete authority rows.
revoke delete on table
  public.music_artist, public.music_album, public.music_release, public.music_recording, public.music_track,
  public.music_artist_mbid, public.music_album_mbid, public.music_release_mbid,
  public.music_recording_mbid, public.music_track_mbid,
  public.music_recording_redirect, public.music_entity_merge_audit
from service_role;

do $$
declare v_table text;
begin
  foreach v_table in array array[
    'music_collection_schedule','music_artist_allowlist','music_schedule_artist',
    'music_schedule_run','music_discovery_scan','music_release_candidate','music_api_limiter',
    'music_capacity_policy','music_capacity_snapshot','music_capacity_event',
    'music_retention_policy','music_purge_batch','music_purge_entity_tombstone',
    'music_recording_purge_tombstone'
  ] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('revoke all on table public.%I from public, anon, authenticated', v_table);
  end loop;
end
$$;

-- The NOLOGIN owner is not a BYPASSRLS role; explicit policies keep SECURITY DEFINER
-- functions operational while table privileges still limit each relation's commands.
do $$
declare v_table text;
begin
  foreach v_table in array array[
    'music_collection_schedule','music_artist_allowlist','music_schedule_artist',
    'music_schedule_run','music_discovery_scan','music_release_candidate','music_api_limiter',
    'music_capacity_policy','music_capacity_snapshot','music_capacity_event',
    'music_retention_policy','music_purge_batch','music_purge_entity_tombstone',
    'music_recording_purge_tombstone','music_sync_job','music_sync_run','music_dead_letter',
    'music_artist','music_album','music_release','music_recording','music_track',
    'music_artist_mbid','music_album_mbid','music_release_mbid','music_recording_mbid',
    'music_track_mbid','music_recording_redirect','music_recording_duplicate_candidate',
    'music_entity_merge_audit','lastfm_recording_profile','lastfm_tag_fetch',
    'lastfm_recording_tag'
  ] loop
    execute format(
      'create policy %I on public.%I for all to nrm_music_rpc_owner using (true) with check (true)',
      'pl_' || v_table || '_music_rpc_owner', v_table
    );
  end loop;
end
$$;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'music_rpc_%'
      and p.proname in (
        'music_rpc_capture_capacity','music_rpc_claim_due_schedules','music_rpc_finish_schedule_run',
        'music_rpc_acquire_mb_permit','music_rpc_claim_jobs','music_rpc_finish_job',
        'music_rpc_apply_discovery_page','music_rpc_apply_release_bundle','music_rpc_run_retention',
        'music_rpc_capacity_purge','music_rpc_admin_schedule_upsert',
        'music_rpc_admin_schedule_set_enabled','music_rpc_admin_schedule_run_now',
        'music_rpc_admin_allowlist_upsert','music_rpc_admin_allowlist_set_enabled',
        'music_rpc_admin_overview'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.signature);
    execute format('grant execute on function %s to service_role', r.signature);
  end loop;
end
$$;

-- Admin entry points are callable by app roles but still re-check nrm_is_admin_caller.
grant execute on function public.music_rpc_admin_schedule_upsert(text, uuid, jsonb) to anon, authenticated;
grant execute on function public.music_rpc_admin_schedule_set_enabled(text, uuid, boolean) to anon, authenticated;
grant execute on function public.music_rpc_admin_schedule_run_now(text, uuid) to anon, authenticated;
grant execute on function public.music_rpc_admin_allowlist_upsert(text, jsonb) to anon, authenticated;
grant execute on function public.music_rpc_admin_allowlist_set_enabled(text, uuid, boolean) to anon, authenticated;
grant execute on function public.music_rpc_admin_overview(text, integer, integer) to anon, authenticated;

revoke all on function public.music_reject_unknown_keys(jsonb, text[]) from public, anon, authenticated;
revoke all on function public.music_prevent_hard_delete() from public, anon, authenticated;

comment on table public.music_collection_schedule is '관리자 설정 MusicBrainz 수집 스케줄 권위 원장';
comment on table public.music_artist_allowlist is '검증된 Artist MBID 기반 수집 allowlist; 초기 seed는 별도 단계';
comment on table public.music_schedule_artist is '스케줄과 allowlist Artist 연결';
comment on table public.music_schedule_run is 'dispatcher가 생성한 스케줄 실행 및 fence 집계';
comment on table public.music_discovery_scan is '한 실행 안에서만 이어지는 Artist release search page cursor';
comment on table public.music_release_candidate is '검색 후 lookup 검증 전 Release 후보';
comment on table public.music_api_limiter is '전체 MusicBrainz worker 공유 1.1초 요청 시작 limiter';
comment on table public.music_capacity_policy is '프로젝트 1 350/380/400/500MiB 용량 정책';
comment on table public.music_capacity_snapshot is 'DB 및 음악 relation 용량 시점 snapshot';
comment on table public.music_capacity_event is '용량 경계·정리·purge 감사 event';
comment on table public.music_retention_policy is '성공·실패·해결 로그 보존 일수';
comment on table public.music_purge_entity_tombstone is 'capacity purge된 내부 ID와 MBID 최소 영구 tombstone';
comment on table public.music_recording_purge_tombstone is 'purge Recording 및 향후 vector delete 대기 영구 tombstone';

do $$
declare r record;
begin
  for r in
    select c.table_name, c.column_name
    from information_schema.columns c
    where c.table_schema = 'public' and c.table_name in (
      'music_collection_schedule','music_artist_allowlist','music_schedule_artist',
      'music_schedule_run','music_discovery_scan','music_release_candidate','music_api_limiter',
      'music_capacity_policy','music_capacity_snapshot','music_capacity_event',
      'music_retention_policy','music_purge_batch','music_purge_entity_tombstone',
      'music_recording_purge_tombstone'
    )
  loop
    execute format('comment on column public.%I.%I is %L', r.table_name, r.column_name,
      r.table_name || ' — ' || r.column_name || ' (SSOT §5.10 정의 컬럼)');
  end loop;
end
$$;
