-- Admin failure-tab list: canonical last_error_message + artist/title.
-- No extra table. Reads music_sync_job.last_error_message and existing
-- catalog/upcoming/hydrate name columns.

create or replace function public.music_admin_canonical_failure_message(p_message text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_message is null or btrim(p_message) = '' then null
    when p_message ilike '%ck_music_release_representative_reti%'
      then 'ck_music_release_representative_retired'
    when p_message = 'catalog recording was not matched'
      then 'catalog recording was not matched'
    when p_message = 'catalog recording has no release'
      then 'catalog recording has no release'
    when p_message = 'catalog release does not contain the matched recording'
      then 'catalog release does not contain the matched recording'
    when p_message ~ 'release\.release-events\[[0-9]+\]\.date is required'
      then 'release.release-events.date is required'
    when p_message ~ 'recording\.releases\[[0-9]+\]\.date must be YYYY'
      then 'recording.releases.date must be YYYY, YYYY-MM, or YYYY-MM-DD'
    when p_message ~ 'track\[[0-9]+\]\.number must be non-empty'
      then 'track.number must be non-empty text'
    when p_message = 'HTTP 503' then 'HTTP 503'
    when p_message = 'request timeout' then 'request timeout'
    when p_message = 'worker request/time budget exhausted'
      then 'worker request/time budget exhausted'
    else left(btrim(p_message), 180)
  end;
$$;

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
        nullif(btrim(j.context->>'artist_name'), ''),
        nullif(btrim(u.artist_credit_name), ''),
        nullif(btrim(al.display_name), ''),
        nullif(btrim(rec.artist_credit_name), ''),
        '알 수 없음'
      ) as artist,
      coalesce(
        nullif(btrim(c.track_title), ''),
        nullif(btrim(j.context->>'track_title'), ''),
        nullif(btrim(j.context->>'title'), ''),
        nullif(btrim(rc.title), ''),
        nullif(btrim(u.title), ''),
        nullif(btrim(rec.title), ''),
        '알 수 없음'
      ) as title,
      public.music_admin_canonical_failure_message(j.last_error_message) as error_message,
      coalesce(j.completed_at, j.created_at) as created_at
    from public.music_sync_job j
    left join public.music_catalog_track_candidate c
      on c.candidate_id = j.entity_id
     and j.job_kind = 'mb_catalog_track_resolve'
    left join public.music_release_candidate rc
      on rc.candidate_id = j.entity_id
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

alter function public.music_admin_canonical_failure_message(text)
  owner to nrm_music_rpc_owner;
alter function public.music_rpc_admin_schedule_run_failures(text, uuid, integer, integer)
  owner to nrm_music_rpc_owner;

revoke all on function public.music_admin_canonical_failure_message(text)
  from public, anon, authenticated;
grant execute on function public.music_admin_canonical_failure_message(text)
  to nrm_music_rpc_owner, service_role;

revoke all on function public.music_rpc_admin_schedule_run_failures(text, uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.music_rpc_admin_schedule_run_failures(text, uuid, integer, integer)
  to anon, authenticated, service_role;

comment on function public.music_admin_canonical_failure_message(text) is
  '관리 UI용 대표 실패 메시지. last_error_message를 정규화하며 별도 테이블을 쓰지 않는다';
comment on function public.music_rpc_admin_schedule_run_failures(text, uuid, integer, integer) is
  '스케줄 실행의 실패 곡: 가수·제목·대표 실패 메시지. dead/quarantined/blocked job만. 페이지 조회';
