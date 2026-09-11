-- lastfm_tag_refresh claim/apply + weekly next_run + 태그 upsert 교체.

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
        'lastfm_tag_refresh','lastfm_tags','mb_discovery','mb_release_hydrate',
        'mb_recording_hydrate','mb_upcoming_verify'
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
        when 'lastfm_tags' then 2
        when 'lastfm_tag_refresh' then 3
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
      'lastfm_artist_pool','lastfm_track_pool','mb_catalog_track_resolve',
      'lastfm_tag_refresh','lastfm_tags',
      'mb_discovery','mb_release_hydrate','mb_recording_hydrate',
      'mb_upcoming_verify'
    )
      and job_status in ('pending','processing','retry')
  );
end;
$$;
