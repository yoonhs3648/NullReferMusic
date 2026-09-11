-- 실행 상세: job 종류·상태 집계 + catalog/upcoming 삽입 곡 목록.

create or replace function public.music_rpc_admin_schedule_run_jobs(
  p_caller_serial text,
  p_schedule_run_id uuid
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
  if p_schedule_run_id is null then
    raise exception using errcode = '22023', message = 'schedule_run_id required';
  end if;
  if not exists (
    select 1 from public.music_schedule_run where schedule_run_id = p_schedule_run_id
  ) then
    raise exception using errcode = 'P0002', message = 'schedule run not found';
  end if;

  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.job_kind, x.job_status)
      from (
        select j.job_kind, j.job_status, count(*)::integer as job_count
        from public.music_sync_job j
        where j.schedule_run_id = p_schedule_run_id
        group by j.job_kind, j.job_status
      ) x
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.music_rpc_admin_schedule_run_jobs(text, uuid)
  from public, anon, authenticated;
grant execute on function public.music_rpc_admin_schedule_run_jobs(text, uuid)
  to anon, authenticated, service_role;

comment on function public.music_rpc_admin_schedule_run_jobs(text, uuid) is
  '스케줄 실행의 job_kind·job_status 건수. 관리 UI 상세의 세분 집계';

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

  with inserted as (
    select
      r.recording_id as item_id,
      r.artist_credit_name as artist,
      r.title,
      r.created_at
    from public.music_catalog_track_candidate c
    join public.music_recording r on r.recording_id = c.recording_id
    where c.schedule_run_id = p_schedule_run_id
      and c.candidate_status = 'applied'
      and c.recording_id is not null
    union
    select
      r.recording_id,
      r.artist_credit_name,
      r.title,
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
    union
    select
      u.upcoming_id,
      u.artist_credit_name,
      u.title,
      u.created_at
    from public.music_upcoming_release u
    where u.first_seen_schedule_run_id = p_schedule_run_id
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc, x.recording_id)
      from (
        select i.item_id as recording_id, i.artist, i.title, i.created_at
        from inserted i
        order by i.created_at desc, i.item_id
        limit p_limit offset p_offset
      ) x
    ), '[]'::jsonb),
    'total', (select count(*)::integer from inserted)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.music_rpc_admin_schedule_run_inserts(text, uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.music_rpc_admin_schedule_run_inserts(text, uuid, integer, integer)
  to anon, authenticated, service_role;

comment on function public.music_rpc_admin_schedule_run_inserts(text, uuid, integer, integer) is
  '스케줄 실행에서 DB에 들어간 가수·곡 제목 목록. catalog·upcoming·원장 hydrate를 포함한다';

alter function public.music_rpc_admin_schedule_run_jobs(text, uuid)
  owner to nrm_music_rpc_owner;
alter function public.music_rpc_admin_schedule_run_inserts(text, uuid, integer, integer)
  owner to nrm_music_rpc_owner;
