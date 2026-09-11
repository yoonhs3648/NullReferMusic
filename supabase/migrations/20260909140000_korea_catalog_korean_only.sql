-- korea/korean-hiphop: 한국 작품만. global/hiphop: 한글·KR ISRC·K-pop·KR 아티스트는 건너뛴다.

alter table public.music_catalog_track_candidate
  drop constraint ck_music_catalog_track_candidate_match;

alter table public.music_catalog_track_candidate
  add constraint ck_music_catalog_track_candidate_match check (
    match_status in (
      'pending','lastfm_mbid','mb_search','unmatched','skipped_exclusive',
      'quota_skipped','applied','rejected','skipped_not_korean','skipped_korean'
    )
  );

create or replace function public.music_rpc_skip_catalog_recording(
  p_job_id uuid,
  p_fence_token uuid,
  p_reason text default 'not_korean_work'
)
returns table(applied boolean, result_code text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_job public.music_sync_job%rowtype;
  v_candidate public.music_catalog_track_candidate%rowtype;
  v_match text;
  v_code text;
begin
  if p_job_id is null or p_fence_token is null then
    raise exception using errcode = '22023', message = 'invalid catalog skip parameters';
  end if;
  if p_reason is distinct from 'korean_work' and p_reason is distinct from 'not_korean_work' then
    raise exception using errcode = '22023', message = 'invalid catalog skip reason';
  end if;
  if p_reason = 'korean_work' then
    v_match := 'skipped_korean';
    v_code := 'SKIPPED_KOREAN';
  else
    v_match := 'skipped_not_korean';
    v_code := 'SKIPPED_NOT_KOREAN';
  end if;
  select * into v_job
  from public.music_sync_job
  where job_id = p_job_id
  for update;
  if not found or v_job.job_kind <> 'mb_catalog_track_resolve'
     or v_job.job_status <> 'processing'
     or v_job.fence_token is distinct from p_fence_token
     or v_job.lease_until < now() then
    return query select false, 'FENCE_LOST'::text;
    return;
  end if;
  select * into v_candidate
  from public.music_catalog_track_candidate
  where candidate_id = v_job.entity_id
  for update;
  if not found or v_candidate.candidate_status = 'applied' then
    return query select false, 'VERSION_CONFLICT'::text;
    return;
  end if;
  update public.music_catalog_track_candidate
  set match_status = v_match,
      candidate_status = 'skipped',
      updated_at = now()
  where candidate_id = v_candidate.candidate_id;
  update public.music_sync_job
  set job_status = 'completed', completed_at = now(),
      lease_until = null, worker_id = null, fence_token = null
  where job_id = p_job_id and fence_token = p_fence_token;
  return query select true, v_code;
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
        'chart_rank', cc.chart_rank,
        'schedule_key', s.schedule_key
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


alter function public.music_rpc_skip_catalog_recording(uuid, uuid, text) owner to nrm_music_rpc_owner;
alter function public.music_rpc_claim_mb_work(uuid, integer, integer) owner to nrm_music_rpc_owner;

revoke all on function public.music_rpc_skip_catalog_recording(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.music_rpc_claim_mb_work(uuid, integer, integer)
  from public, anon, authenticated;

grant execute on function public.music_rpc_skip_catalog_recording(uuid, uuid, text) to service_role;
grant execute on function public.music_rpc_claim_mb_work(uuid, integer, integer) to service_role;

comment on function public.music_rpc_skip_catalog_recording(uuid, uuid, text) is
  '지역 필터로 catalog 후보를 원장에 넣지 않고 닫는다. not_korean_work=skipped_not_korean, korean_work=skipped_korean. Last.fm 태그는 큐잉하지 않는다';
comment on function public.music_rpc_claim_mb_work(uuid, integer, integer) is
  'Last.fm 리스트 → catalog MusicBrainz 한 곡 → Last.fm 태그 순. catalog context에 schedule_key를 넣는다';
comment on constraint ck_music_catalog_track_candidate_match on public.music_catalog_track_candidate is
  'skipped_not_korean: 한국 스케줄이 외국 작품 skip. skipped_korean: 글로벌/힙합이 한국 작품 skip';
