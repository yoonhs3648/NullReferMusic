-- 매주 Last.fm 태그 전곡 upsert 스케줄 + weekly 주기 + 태그 페이지 워커.

-- ---------------------------------------------------------------------------
-- 1) weekly 주기
-- ---------------------------------------------------------------------------
alter table public.nrm_system_schedule
  add column if not exists weekly_weekday smallint;

alter table public.music_collection_schedule
  add column if not exists weekly_weekday smallint;

alter table public.nrm_system_schedule
  drop constraint if exists ck_nrm_system_schedule_kind;
alter table public.nrm_system_schedule
  add constraint ck_nrm_system_schedule_kind
  check (schedule_kind in ('daily', 'interval', 'weekly'));

alter table public.music_collection_schedule
  drop constraint if exists ck_music_collection_schedule_kind;
alter table public.music_collection_schedule
  add constraint ck_music_collection_schedule_kind
  check (schedule_kind in ('daily', 'interval', 'weekly'));

alter table public.nrm_system_schedule
  drop constraint if exists ck_nrm_system_schedule_timing;
alter table public.nrm_system_schedule
  add constraint ck_nrm_system_schedule_timing check (
    (schedule_kind = 'daily' and daily_time_kst is not null
      and interval_minutes is null and weekly_weekday is null)
    or (schedule_kind = 'interval' and daily_time_kst is null
      and interval_minutes between 1 and 1440 and weekly_weekday is null)
    or (schedule_kind = 'weekly' and daily_time_kst is not null
      and interval_minutes is null and weekly_weekday between 0 and 6)
  );

alter table public.music_collection_schedule
  drop constraint if exists ck_music_collection_schedule_timing;
alter table public.music_collection_schedule
  add constraint ck_music_collection_schedule_timing check (
    (schedule_kind = 'daily' and daily_time_kst is not null
      and interval_minutes is null and weekly_weekday is null)
    or (schedule_kind = 'interval' and daily_time_kst is null
      and interval_minutes between 1 and 1440 and weekly_weekday is null)
    or (schedule_kind = 'weekly' and daily_time_kst is not null
      and interval_minutes is null and weekly_weekday between 0 and 6)
  );

comment on column public.nrm_system_schedule.weekly_weekday is
  'weekly일 때 요일. 0=일요일 … 6=토요일 (KST)';
comment on column public.music_collection_schedule.weekly_weekday is
  'weekly일 때 요일. 0=일요일 … 6=토요일 (KST)';

create or replace function public.nrm_system_schedule_next_weekly_run(
  p_weekday smallint,
  p_time_kst time,
  p_from timestamptz default now()
)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_local timestamp;
  v_date date;
  v_dow integer;
  v_delta integer;
begin
  if p_weekday not between 0 and 6 or p_time_kst is null then
    raise exception using errcode = '22023', message = 'invalid weekly weekday or time';
  end if;
  v_local := p_from at time zone 'Asia/Seoul';
  v_date := v_local::date;
  v_dow := extract(dow from v_date)::integer;
  v_delta := (p_weekday - v_dow + 7) % 7;
  if v_delta = 0 and v_local::time >= p_time_kst then
    v_delta := 7;
  end if;
  return ((v_date + v_delta) + p_time_kst) at time zone 'Asia/Seoul';
end;
$$;

create or replace function public.nrm_system_schedule_compute_next_run(
  p_kind text,
  p_daily_time time,
  p_interval_minutes integer,
  p_weekly_weekday smallint,
  p_from timestamptz default now()
)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_kind = 'interval' then
    return p_from + pg_catalog.make_interval(mins => coalesce(p_interval_minutes, 60));
  end if;
  if p_kind = 'weekly' then
    return public.nrm_system_schedule_next_weekly_run(p_weekly_weekday, p_daily_time, p_from);
  end if;
  return public.nrm_system_schedule_next_daily_run(p_daily_time, p_from);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) collection_mode=tag_refresh + lastfm_tag_refresh job
-- ---------------------------------------------------------------------------
alter table public.music_collection_schedule
  drop constraint if exists ck_music_collection_schedule_collection_mode;
alter table public.music_collection_schedule
  add constraint ck_music_collection_schedule_collection_mode
  check (collection_mode in ('upcoming', 'catalog', 'tag_refresh'));

comment on column public.music_collection_schedule.collection_mode is
  'upcoming=발매예정 스테이징, catalog=원장 직행, tag_refresh=원장 전곡 Last.fm 태그 upsert';

alter table public.music_sync_job
  drop constraint if exists ck_music_sync_job_kind,
  drop constraint if exists ck_music_sync_job_collection_links;

alter table public.music_sync_job
  add constraint ck_music_sync_job_kind check (job_kind in (
    'mb_lookup','mb_redirect','lastfm_artist_pool','lastfm_track_pool',
    'mb_discovery','mb_release_hydrate','mb_recording_hydrate',
    'mb_catalog_track_resolve','mb_upcoming_verify',
    'lastfm_tags','lastfm_tag_refresh','embedding','reconcile'
  )),
  add constraint ck_music_sync_job_collection_links check (
    (job_kind = 'lastfm_artist_pool'
      and schedule_id is not null and schedule_run_id is not null
      and discovery_scan_id is null and candidate_id is null)
    or (job_kind = 'lastfm_track_pool'
      and schedule_id is not null and schedule_run_id is not null
      and discovery_scan_id is null and candidate_id is null)
    or (job_kind = 'lastfm_tag_refresh'
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
      'lastfm_artist_pool','lastfm_track_pool','lastfm_tag_refresh','mb_discovery',
      'mb_release_hydrate','mb_catalog_track_resolve','lastfm_tags'
    )
  );

create table if not exists public.music_lastfm_tag_refresh_state (
  schedule_run_id uuid not null,
  after_recording_id uuid,
  queued_count integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint pk_music_lastfm_tag_refresh_state primary key (schedule_run_id),
  constraint fk_music_lastfm_tag_refresh_state_run foreign key (schedule_run_id)
    references public.music_schedule_run(schedule_run_id) on delete restrict,
  constraint ck_music_lastfm_tag_refresh_queued check (queued_count >= 0)
);

comment on table public.music_lastfm_tag_refresh_state is
  '전곡 Last.fm 태그 갱신 커서. after_recording_id 다음부터 페이지 단위로 lastfm_tags를 큐잉한다';

alter table public.music_lastfm_tag_refresh_state enable row level security;
revoke all on table public.music_lastfm_tag_refresh_state from public, anon, authenticated;
grant select, insert, update, delete on table public.music_lastfm_tag_refresh_state
  to nrm_music_rpc_owner;
drop policy if exists pl_music_lastfm_tag_refresh_state_music_rpc_owner
  on public.music_lastfm_tag_refresh_state;
create policy pl_music_lastfm_tag_refresh_state_music_rpc_owner
  on public.music_lastfm_tag_refresh_state
  for all to nrm_music_rpc_owner using (true) with check (true);

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

create or replace function public.music_rpc_apply_lastfm_tag_refresh_page(
  p_job_id uuid,
  p_fence_token uuid,
  p_limit integer default 50
)
returns table(applied boolean, result_code text, has_more boolean, queued integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.music_sync_job%rowtype;
  v_after uuid;
  v_last uuid;
  v_batch integer := 0;
  v_more boolean := false;
begin
  if p_limit not between 1 and 200 then
    raise exception using errcode = '22023', message = 'invalid tag refresh page size';
  end if;
  select * into v_job
  from public.music_sync_job
  where job_id = p_job_id
  for update;
  if not found or v_job.job_kind <> 'lastfm_tag_refresh'
     or v_job.job_status <> 'processing'
     or v_job.fence_token is distinct from p_fence_token
     or v_job.lease_until < now() then
    return query select false, 'FENCE_LOST'::text, false, 0;
    return;
  end if;

  insert into public.music_lastfm_tag_refresh_state(schedule_run_id, after_recording_id, queued_count)
  values (v_job.schedule_run_id, null, 0)
  on conflict (schedule_run_id) do nothing;

  select after_recording_id into v_after
  from public.music_lastfm_tag_refresh_state
  where schedule_run_id = v_job.schedule_run_id
  for update;

  with batch as (
    select r.recording_id
    from public.music_recording r
    where r.entity_status = 'active'
      and r.lastfm_sync_enabled
      and (v_after is null or r.recording_id > v_after)
    order by r.recording_id
    limit p_limit
  ), ins as (
    insert into public.music_sync_job(
      job_kind, entity_type, entity_id, idempotency_key, priority,
      schedule_id, schedule_run_id
    )
    select
      'lastfm_tags', 'recording', b.recording_id,
      'lastfm-tags:' || v_job.schedule_run_id::text || ':' || b.recording_id::text,
      v_job.priority, v_job.schedule_id, v_job.schedule_run_id
    from batch b
    on conflict (idempotency_key) do nothing
    returning entity_id
  )
  select coalesce((select count(*)::integer from batch), 0),
         (select max(recording_id) from batch)
    into v_batch, v_last;

  if v_last is not null then
    update public.music_lastfm_tag_refresh_state
    set after_recording_id = v_last,
        queued_count = queued_count + v_batch,
        updated_at = now()
    where schedule_run_id = v_job.schedule_run_id;
    update public.music_schedule_run
    set request_count = request_count + v_batch
    where schedule_run_id = v_job.schedule_run_id;
    select exists (
      select 1
      from public.music_recording r
      where r.entity_status = 'active'
        and r.lastfm_sync_enabled
        and r.recording_id > v_last
    ) into v_more;
  end if;

  if v_more then
    update public.music_sync_job
    set job_status = 'pending',
        available_at = now(),
        lease_until = null,
        worker_id = null,
        fence_token = null,
        attempt_count = 0
    where job_id = p_job_id;
  else
    update public.music_sync_job
    set job_status = 'completed',
        completed_at = now(),
        lease_until = null,
        worker_id = null
    where job_id = p_job_id and fence_token = p_fence_token;
  end if;

  return query select true, 'APPLIED'::text, coalesce(v_more, false), v_batch;
end;
$$;
