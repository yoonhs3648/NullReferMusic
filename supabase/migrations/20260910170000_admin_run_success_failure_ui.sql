-- Admin run detail: failures RPC must not read music_sync_job.context
-- (column does not exist). MusicBrainz 503-retry runs with any terminal
-- job failure close as failed, not completed.

create or replace function public.music_rpc_admin_schedule_run_failures(
  p_caller_serial text,
  p_schedule_run_id uuid,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not public.nrm_is_admin_caller(p_caller_serial) then
    raise exception using errcode = '42501', message = 'admin required';
  end if;
  if p_schedule_run_id is null
     or p_limit not between 1 and 200
     or p_offset < 0 then
    raise exception using errcode = '22023', message = 'invalid schedule_run_id or pagination';
  end if;
  if not exists (
    select 1 from public.music_schedule_run where schedule_run_id = p_schedule_run_id
  ) then
    raise exception using errcode = 'P0002', message = 'schedule run not found';
  end if;

  with failed as (
    select distinct on (j.job_id)
      j.job_id,
      coalesce(
        nullif(btrim(c.artist_name), ''),
        nullif(btrim(u.artist_credit_name), ''),
        nullif(btrim(al.display_name), ''),
        nullif(btrim(rec.artist_credit_name), ''),
        '알 수 없음'
      ) as artist,
      coalesce(
        nullif(btrim(c.track_title), ''),
        nullif(btrim(rc.title), ''),
        nullif(btrim(u.title), ''),
        nullif(btrim(rec.title), ''),
        '알 수 없음'
      ) as title,
      public.music_admin_canonical_failure_message(j.last_error_message) as error_message,
      coalesce(j.completed_at, j.created_at) as created_at
    from public.music_sync_job j
    left join public.music_catalog_track_candidate c
      on c.candidate_id = coalesce(j.candidate_id, j.entity_id)
    left join public.music_release_candidate rc
      on rc.candidate_id = coalesce(j.candidate_id, j.entity_id)
     and j.job_kind in ('mb_release_hydrate', 'mb_discovery')
    left join public.music_artist_allowlist al
      on al.artist_mbid = rc.artist_mbid
    left join public.music_upcoming_release u
      on j.job_kind = 'mb_upcoming_verify'
     and u.release_mbid = j.entity_id
    left join public.music_recording rec
      on rec.recording_id = j.entity_id
     and j.job_kind in ('lastfm_tags', 'mb_recording_hydrate')
    where j.schedule_run_id = p_schedule_run_id
      and j.job_status in ('dead', 'quarantined', 'blocked')
      and public.music_admin_canonical_failure_message(j.last_error_message) is not null
    order by j.job_id
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc, x.job_id)
      from (
        select f.job_id, f.artist, f.title, f.error_message, f.created_at
        from failed f
        order by f.created_at desc, f.job_id
        limit p_limit offset p_offset
      ) x
    ), '[]'::jsonb),
    'total', (select count(*)::integer from failed)
  ) into v_result;
  return v_result;
end;
$$;

alter function public.music_rpc_admin_schedule_run_failures(text, uuid, integer, integer)
  owner to nrm_music_rpc_owner;

revoke all on function public.music_rpc_admin_schedule_run_failures(text, uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.music_rpc_admin_schedule_run_failures(text, uuid, integer, integer)
  to anon, authenticated, service_role;

comment on function public.music_rpc_admin_schedule_run_failures(text, uuid, integer, integer) is
  '스케줄 실행의 실패 곡: 가수·제목·대표 실패 메시지. dead/quarantined/blocked job만. job.context 없음';

create or replace function public.music_rpc_recover_stale_collection()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_finalized integer := 0;
  v_cleared integer := 0;
  v_pruned integer := 0;
begin
  update public.music_schedule_run r
  set run_status = case
        when exists (
          select 1
          from public.music_collection_schedule s
          where s.schedule_id = r.schedule_id
            and s.collection_mode = 'mb_transient_retry'
        ) and (
          r.failure_count > 0
          or exists (
            select 1
            from public.music_sync_job j
            where j.schedule_run_id = r.schedule_run_id
              and j.job_status in ('dead', 'quarantined', 'blocked')
          )
        ) then 'failed'
        when r.failure_count > 0 then 'partial'
        else 'completed'
      end,
      finished_at = coalesce(r.finished_at, now()),
      capacity_after_bytes = coalesce(
        r.capacity_after_bytes,
        pg_catalog.pg_database_size(pg_catalog.current_database())
      )
  where r.run_status = 'running'
    and not exists (
      select 1
      from public.music_sync_job j
      where j.schedule_run_id = r.schedule_run_id
        and j.job_status in ('pending', 'processing', 'retry')
    );
  get diagnostics v_finalized = row_count;

  update public.music_collection_schedule s
  set claimed_until = null,
      claim_fence_token = null,
      claimed_by = null
  where (s.claimed_until is not null and s.claimed_until < now())
     or exists (
       select 1
       from public.music_schedule_run r
       where r.schedule_id = s.schedule_id
         and r.fence_token is not distinct from s.claim_fence_token
         and r.run_status <> 'running'
     );
  get diagnostics v_cleared = row_count;

  delete from public.nrm_system_schedule_log
  where created_at < now() - interval '1 month'
     or log_id in (
       select log_id
       from public.nrm_system_schedule_log
       order by created_at desc
       offset 4000
     );
  get diagnostics v_pruned = row_count;

  if v_finalized > 0 or v_cleared > 0 then
    perform public.nrm_system_schedule_log_write(
      'rpc', 'recover_stale', 'info',
      jsonb_build_object(
        'finalized_runs', v_finalized,
        'cleared_leases', v_cleared,
        'pruned_logs', v_pruned
      )
    );
  end if;

  return jsonb_build_object(
    'finalized_runs', v_finalized,
    'cleared_leases', v_cleared,
    'pruned_logs', v_pruned,
    'collection_busy', public.music_collection_is_busy()
  );
end;
$$;

alter function public.music_rpc_recover_stale_collection()
  owner to nrm_music_rpc_owner;
grant execute on function public.music_rpc_recover_stale_collection()
  to service_role, nrm_music_rpc_owner, postgres;

create or replace function public.music_rpc_finalize_mb_runs(p_worker_id uuid)
returns table(has_more boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_done integer := 0;
begin
  if p_worker_id is null then
    raise exception using errcode = '22023', message = 'worker id required';
  end if;
  update public.music_schedule_run r
  set run_status = case
        when exists (
          select 1
          from public.music_collection_schedule s
          where s.schedule_id = r.schedule_id
            and s.collection_mode = 'mb_transient_retry'
        ) and (
          r.failure_count > 0
          or exists (
            select 1
            from public.music_sync_job j
            where j.schedule_run_id = r.schedule_run_id
              and j.job_status in ('dead', 'quarantined', 'blocked')
          )
        ) then 'failed'
        when r.failure_count > 0 then 'partial'
        else 'completed'
      end,
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

alter function public.music_rpc_finalize_mb_runs(uuid)
  owner to nrm_music_rpc_owner;

update public.music_schedule_run r
set run_status = 'failed'
from public.music_collection_schedule s
where s.schedule_id = r.schedule_id
  and s.collection_mode = 'mb_transient_retry'
  and r.run_status = 'completed'
  and (
    r.failure_count > 0
    or exists (
      select 1
      from public.music_sync_job j
      where j.schedule_run_id = r.schedule_run_id
        and j.job_status in ('dead', 'quarantined', 'blocked')
    )
  );
