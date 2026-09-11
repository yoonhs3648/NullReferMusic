-- Admin UI: split schedule runs by status; expose inserted tracks and failure causes.

grant usage, create on schema public to nrm_music_rpc_owner;

create or replace function public.music_rpc_admin_overview(
  p_caller_serial text,
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
  v_run_limit integer;
begin
  if not public.nrm_is_admin_caller(p_caller_serial) then
    raise exception using errcode = '42501', message = 'admin required';
  end if;
  if p_limit not between 1 and 200 or p_offset < 0 then
    raise exception using errcode = '22023', message = 'invalid pagination';
  end if;

  v_run_limit := least(p_limit, 50);

  select jsonb_build_object(
    'schedules', coalesce((
      select jsonb_agg(to_jsonb(x))
      from (
        select *
        from public.music_collection_schedule
        order by priority, schedule_key
        limit p_limit offset p_offset
      ) x
    ), '[]'::jsonb),
    'allowlist_count', (select count(*)::integer from public.music_artist_allowlist),
    'pending_jobs', (
      select count(*)::integer
      from public.music_sync_job
      where job_status in ('pending', 'retry', 'processing')
    ),
    'running_runs', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.started_at desc)
      from (
        select *
        from public.music_schedule_run
        where run_status = 'running'
        order by started_at desc
        limit 100
      ) x
    ), '[]'::jsonb),
    'completed_runs', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.started_at desc)
      from (
        select *
        from public.music_schedule_run
        where run_status = 'completed'
        order by started_at desc
        limit v_run_limit
      ) x
    ), '[]'::jsonb),
    'failure_runs', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.started_at desc)
      from (
        select *
        from public.music_schedule_run
        where run_status in ('partial', 'failed', 'cancelled')
        order by started_at desc
        limit v_run_limit
      ) x
    ), '[]'::jsonb),
    'capacity', (
      select to_jsonb(x)
      from (
        select *
        from public.music_capacity_snapshot
        order by captured_at desc
        limit 1
      ) x
    )
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.music_rpc_admin_schedule_run_inserts(
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
  v_run public.music_schedule_run%rowtype;
  v_end timestamptz;
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

  select * into v_run
  from public.music_schedule_run
  where schedule_run_id = p_schedule_run_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'schedule run not found';
  end if;

  v_end := coalesce(v_run.finished_at, now());

  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc, x.recording_id)
      from (
        select
          r.recording_id,
          r.artist_credit_name as artist,
          r.title,
          min(coalesce(rel.title, c.title, '')) as release_title,
          r.created_at
        from public.music_release_candidate c
        join public.music_release_mbid rm
          on rm.mbid = coalesce(c.representative_release_mbid, c.release_mbid)
        join public.music_release rel
          on rel.release_id = rm.release_id
        join public.music_track t
          on t.release_id = rel.release_id
         and t.recording_id is not null
        join public.music_recording r
          on r.recording_id = t.recording_id
        where c.schedule_run_id = p_schedule_run_id
          and c.candidate_status = 'applied'
          and r.created_at >= v_run.started_at
          and r.created_at <= v_end
        group by r.recording_id, r.artist_credit_name, r.title, r.created_at
        order by r.created_at desc, r.recording_id
        limit p_limit offset p_offset
      ) x
    ), '[]'::jsonb),
    'total', (
      select count(distinct r.recording_id)::integer
      from public.music_release_candidate c
      join public.music_release_mbid rm
        on rm.mbid = coalesce(c.representative_release_mbid, c.release_mbid)
      join public.music_track t
        on t.release_id = rm.release_id
       and t.recording_id is not null
      join public.music_recording r
        on r.recording_id = t.recording_id
      where c.schedule_run_id = p_schedule_run_id
        and c.candidate_status = 'applied'
        and r.created_at >= v_run.started_at
        and r.created_at <= v_end
    )
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.music_rpc_admin_schedule_run_errors(
  p_caller_serial text,
  p_schedule_run_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.music_schedule_run%rowtype;
  v_result jsonb;
begin
  if not public.nrm_is_admin_caller(p_caller_serial) then
    raise exception using errcode = '42501', message = 'admin required';
  end if;
  if p_schedule_run_id is null then
    raise exception using errcode = '22023', message = 'schedule_run_id required';
  end if;

  select * into v_run
  from public.music_schedule_run
  where schedule_run_id = p_schedule_run_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'schedule run not found';
  end if;

  select jsonb_build_object(
    'error_message', v_run.error_message,
    'failure_count', v_run.failure_count,
    'job_errors', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.completed_at desc nulls last, x.created_at desc)
      from (
        select
          j.job_id,
          j.job_kind,
          j.job_status,
          j.entity_type,
          j.http_status,
          j.api_error_code,
          j.last_error_message,
          j.attempt_count,
          j.created_at,
          j.completed_at
        from public.music_sync_job j
        where j.schedule_run_id = p_schedule_run_id
          and (
            j.job_status in ('dead', 'quarantined', 'blocked')
            or nullif(btrim(coalesce(j.last_error_message, '')), '') is not null
          )
        order by j.completed_at desc nulls last, j.created_at desc
        limit 50
      ) x
    ), '[]'::jsonb),
    'dead_letters', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.failed_at desc, x.dead_letter_id)
      from (
        select
          d.dead_letter_id,
          d.source_kind,
          d.source_id,
          d.reason,
          d.failed_at,
          d.resolved_at,
          j.job_kind,
          j.job_status
        from public.music_dead_letter d
        join public.music_sync_job j
          on d.source_kind = 'sync_job'
         and j.job_id = d.source_id
        where j.schedule_run_id = p_schedule_run_id
        order by d.failed_at desc, d.dead_letter_id
        limit 50
      ) x
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

alter function public.music_rpc_admin_overview(text, integer, integer)
  owner to nrm_music_rpc_owner;
alter function public.music_rpc_admin_schedule_run_inserts(text, uuid, integer, integer)
  owner to nrm_music_rpc_owner;
alter function public.music_rpc_admin_schedule_run_errors(text, uuid)
  owner to nrm_music_rpc_owner;

revoke all on function public.music_rpc_admin_overview(text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.music_rpc_admin_schedule_run_inserts(text, uuid, integer, integer)
  from public, anon, authenticated;
revoke all on function public.music_rpc_admin_schedule_run_errors(text, uuid)
  from public, anon, authenticated;

grant execute on function public.music_rpc_admin_overview(text, integer, integer)
  to anon, authenticated;
grant execute on function public.music_rpc_admin_schedule_run_inserts(text, uuid, integer, integer)
  to anon, authenticated;
grant execute on function public.music_rpc_admin_schedule_run_errors(text, uuid)
  to anon, authenticated;

grant execute on function public.nrm_is_admin_caller(text) to nrm_music_rpc_owner;

comment on function public.music_rpc_admin_overview(text, integer, integer) is
  '관리자 개요: running/completed/failure runs를 분리 반환';
comment on function public.music_rpc_admin_schedule_run_inserts(text, uuid, integer, integer) is
  '스케줄 실행에서 신규 삽입된 Recording 간략 목록';
comment on function public.music_rpc_admin_schedule_run_errors(text, uuid) is
  '스케줄 실행 실패 원인(run error + job + dead letter)';

revoke create on schema public from nrm_music_rpc_owner;
