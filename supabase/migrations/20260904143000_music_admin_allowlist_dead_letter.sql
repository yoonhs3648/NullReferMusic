-- Complete the MusicBrainz admin contract with pageable allowlist and dead-letter operations.
-- Depends on 20260904130000, 20260904132000, and 20260904140000.

grant usage, create on schema public to nrm_music_rpc_owner;

create function public.music_rpc_admin_allowlist_page(
  p_caller_serial text,
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_result jsonb;
begin
  if not public.nrm_is_admin_caller(p_caller_serial) then
    raise exception using errcode = '42501', message = 'admin required';
  end if;
  if p_limit not between 1 and 200 or p_offset < 0 or char_length(coalesce(p_search, '')) > 200 then
    raise exception using errcode = '22023', message = 'invalid pagination or search';
  end if;

  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.priority, x.display_name, x.artist_mbid)
      from (
        select a.*
        from public.music_artist_allowlist a
        where v_search is null
          or a.display_name ilike '%' || v_search || '%'
          or a.cohort ilike '%' || v_search || '%'
          or a.artist_mbid::text ilike '%' || v_search || '%'
        order by a.priority, a.display_name, a.artist_mbid
        limit p_limit offset p_offset
      ) x
    ), '[]'::jsonb),
    'total', (
      select count(*)
      from public.music_artist_allowlist a
      where v_search is null
        or a.display_name ilike '%' || v_search || '%'
        or a.cohort ilike '%' || v_search || '%'
        or a.artist_mbid::text ilike '%' || v_search || '%'
    )
  ) into v_result;
  return v_result;
end;
$$;

create function public.music_rpc_admin_dead_letter_page(
  p_caller_serial text,
  p_unresolved_only boolean default true,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql security definer set search_path = ''
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
    'items', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.failed_at desc, x.dead_letter_id)
      from (
        select
          d.dead_letter_id,
          d.source_kind,
          d.source_id,
          d.reason,
          d.sanitized_payload,
          d.failed_at,
          d.resolved_at,
          d.resolution_note,
          j.job_kind,
          j.entity_type,
          j.job_status,
          j.http_status,
          j.api_error_code,
          j.attempt_count,
          j.available_at
        from public.music_dead_letter d
        left join public.music_sync_job j
          on d.source_kind = 'sync_job' and j.job_id = d.source_id
        where not p_unresolved_only or d.resolved_at is null
        order by d.failed_at desc, d.dead_letter_id
        limit p_limit offset p_offset
      ) x
    ), '[]'::jsonb),
    'total', (
      select count(*)
      from public.music_dead_letter d
      where not p_unresolved_only or d.resolved_at is null
    )
  ) into v_result;
  return v_result;
end;
$$;

create function public.music_rpc_admin_dead_letter_resolve(
  p_caller_serial text,
  p_dead_letter_id uuid,
  p_resolution_note text
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.nrm_is_admin_caller(p_caller_serial) then
    raise exception using errcode = '42501', message = 'admin required';
  end if;
  if p_dead_letter_id is null
     or btrim(coalesce(p_resolution_note, '')) = ''
     or char_length(p_resolution_note) > 1000 then
    raise exception using errcode = '22023', message = 'invalid dead-letter resolution';
  end if;

  update public.music_dead_letter
  set resolved_at = now(), resolution_note = btrim(p_resolution_note)
  where dead_letter_id = p_dead_letter_id and resolved_at is null;
  return found;
end;
$$;

create function public.music_rpc_admin_dead_letter_retry(
  p_caller_serial text,
  p_dead_letter_id uuid,
  p_resolution_note text default '관리자 재처리'
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_letter public.music_dead_letter%rowtype;
  v_updated integer;
begin
  if not public.nrm_is_admin_caller(p_caller_serial) then
    raise exception using errcode = '42501', message = 'admin required';
  end if;
  if p_dead_letter_id is null
     or btrim(coalesce(p_resolution_note, '')) = ''
     or char_length(p_resolution_note) > 1000 then
    raise exception using errcode = '22023', message = 'invalid dead-letter retry';
  end if;

  select * into v_letter
  from public.music_dead_letter
  where dead_letter_id = p_dead_letter_id and resolved_at is null
  for update;
  if not found then
    return false;
  end if;

  if v_letter.source_kind = 'sync_job' then
    update public.music_sync_job
    set job_status = 'pending',
        attempt_count = 0,
        available_at = now(),
        lease_until = null,
        fence_token = null,
        worker_id = null,
        http_status = null,
        api_error_code = null,
        last_error_message = null,
        completed_at = null
    where job_id = v_letter.source_id
      and job_status in ('blocked', 'quarantined', 'dead');
  elsif v_letter.source_kind = 'lastfm_fetch' then
    update public.lastfm_tag_fetch
    set fetch_status = 'retry',
        retry_at = now(),
        lease_until = null,
        fence_token = null,
        last_error_code = null,
        last_error_message = null,
        completed_at = null
    where fetch_id = v_letter.source_id
      and fetch_status in ('blocked', 'quarantined', 'failed');
  else
    raise exception using errcode = '0A000', message = 'dead-letter source is not retryable in this deployment';
  end if;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return false;
  end if;

  update public.music_dead_letter
  set resolved_at = now(), resolution_note = btrim(p_resolution_note)
  where dead_letter_id = p_dead_letter_id;
  return true;
end;
$$;

alter function public.music_rpc_admin_allowlist_page(text, text, integer, integer)
  owner to nrm_music_rpc_owner;
alter function public.music_rpc_admin_dead_letter_page(text, boolean, integer, integer)
  owner to nrm_music_rpc_owner;
alter function public.music_rpc_admin_dead_letter_resolve(text, uuid, text)
  owner to nrm_music_rpc_owner;
alter function public.music_rpc_admin_dead_letter_retry(text, uuid, text)
  owner to nrm_music_rpc_owner;
revoke create on schema public from nrm_music_rpc_owner;

revoke all on function public.music_rpc_admin_allowlist_page(text, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.music_rpc_admin_dead_letter_page(text, boolean, integer, integer)
  from public, anon, authenticated;
revoke all on function public.music_rpc_admin_dead_letter_resolve(text, uuid, text)
  from public, anon, authenticated;
revoke all on function public.music_rpc_admin_dead_letter_retry(text, uuid, text)
  from public, anon, authenticated;

grant execute on function public.music_rpc_admin_allowlist_page(text, text, integer, integer)
  to anon, authenticated;
grant execute on function public.music_rpc_admin_dead_letter_page(text, boolean, integer, integer)
  to anon, authenticated;
grant execute on function public.music_rpc_admin_dead_letter_resolve(text, uuid, text)
  to anon, authenticated;
grant execute on function public.music_rpc_admin_dead_letter_retry(text, uuid, text)
  to anon, authenticated;

comment on function public.music_rpc_admin_allowlist_page(text, text, integer, integer)
  is '관리자 allowlist 전체 검색·페이지 조회';
comment on function public.music_rpc_admin_dead_letter_page(text, boolean, integer, integer)
  is '관리자 dead-letter와 원본 sync job 진단 페이지 조회';
comment on function public.music_rpc_admin_dead_letter_resolve(text, uuid, text)
  is '관리자 dead-letter 조치 완료 기록';
comment on function public.music_rpc_admin_dead_letter_retry(text, uuid, text)
  is '관리자 dead-letter 원본 작업 원자 재큐잉 및 해결 기록';
