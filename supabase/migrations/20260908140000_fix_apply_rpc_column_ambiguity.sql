-- RETURNS TABLE OUT 컬럼과 테이블 컬럼이 겹쳐 PostgREST 400(42702)이 나던 apply RPC를 고친다.
-- discovery: next_offset, catalog: recording_id

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
  update public.music_discovery_scan as s
  set next_offset = p_offset + p_page_size,
      last_page_size = p_page_size,
      total_count = p_total_count,
      page_count = s.page_count + 1,
      response_hash = p_response_hash,
      scan_status = case when p_is_last_page then 'completed' else 'processing' end,
      completed_at = case when p_is_last_page then now() else null end,
      lease_until = case when p_is_last_page then null else s.lease_until end
  where s.discovery_scan_id = p_scan_id;
  update public.music_schedule_run
  set discovered_count = discovered_count + v_count,
      duplicate_count = duplicate_count + v_duplicate
  where schedule_run_id = v_scan.schedule_run_id;
  return query select true, 'APPLIED'::text, v_count, p_offset + p_page_size;
end;
$$;


revoke all on function public.music_rpc_apply_discovery_page(
  uuid, uuid, integer, integer, integer, bytea, jsonb, boolean
) from public, anon, authenticated;
grant execute on function public.music_rpc_apply_discovery_page(
  uuid, uuid, integer, integer, integer, bytea, jsonb, boolean
) to service_role;

drop function if exists public.music_rpc_apply_catalog_recording_bundle(uuid, uuid, jsonb);

create or replace function public.music_rpc_apply_catalog_recording_bundle(
  p_job_id uuid, p_fence_token uuid, p_payload jsonb
)
returns table(applied boolean, result_code text, applied_recording_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.music_sync_job%rowtype;
  v_schedule public.music_collection_schedule%rowtype;
  v_candidate public.music_catalog_track_candidate%rowtype;
  v_album jsonb; v_release jsonb; v_medium jsonb; v_track jsonb; v_recording jsonb;
  v_credit jsonb; v_alias jsonb; v_isrc jsonb;
  v_album_id uuid; v_release_id uuid; v_recording_id uuid; v_track_id uuid; v_artist_id uuid;
  v_album_mbid uuid; v_release_mbid uuid; v_recording_mbid uuid; v_track_mbid uuid;
  v_position integer; v_new_recording boolean := false;
  v_other record;
  v_stop bigint;
  v_headroom bigint := 8 * 1024 * 1024;
begin
  perform public.music_reject_unknown_keys(p_payload, array[
    'candidate_id','requested_mbid','canonical_mbid','recording_aliases','album','release'
  ]);
  select * into v_job from public.music_sync_job where job_id = p_job_id for update;
  if not found or v_job.job_kind <> 'mb_catalog_track_resolve'
     or v_job.job_status <> 'processing'
     or v_job.fence_token is distinct from p_fence_token
     or v_job.lease_until < now() then
    return query select false, 'FENCE_LOST'::text, null::uuid;
    return;
  end if;
  select * into v_schedule
  from public.music_collection_schedule where schedule_id = v_job.schedule_id for update;
  select * into v_candidate
  from public.music_catalog_track_candidate
  where candidate_id = v_job.entity_id
  for update;
  if not found or (p_payload->>'candidate_id')::uuid is distinct from v_candidate.candidate_id then
    return query select false, 'INVALID_PAYLOAD'::text, null::uuid;
    return;
  end if;
  v_album := p_payload->'album';
  v_release := p_payload->'release';
  perform public.music_reject_unknown_keys(v_album, array[
    'mbid','aliases','title','disambiguation','primary_type','secondary_types',
    'first_release_date_text','artist_credit','tags','genres'
  ]);
  perform public.music_reject_unknown_keys(v_release, array[
    'mbid','title','status','quality','packaging','country_code','release_date_text',
    'barcode','text_language','text_script','artist_credit','tags','genres','media'
  ]);
  v_medium := v_release->'media'->0;
  v_track := v_medium->'tracks'->0;
  v_recording := v_track->'recording';
  perform public.music_reject_unknown_keys(v_medium, array['position','title','format','tracks']);
  perform public.music_reject_unknown_keys(v_track, array[
    'mbid','position','number','title','length_ms','artist_credit','recording'
  ]);
  perform public.music_reject_unknown_keys(v_recording, array[
    'mbid','title','disambiguation','length_ms','video','first_release_date_text',
    'artist_credit','isrcs','tags','genres'
  ]);
  v_recording_mbid := (v_recording->>'mbid')::uuid;
  select recording_id into v_recording_id
  from public.music_recording_mbid where mbid = v_recording_mbid for update;
  if v_recording_id is null then
    select disable_discovery_bytes into v_stop
    from public.music_capacity_policy where policy_key = 'project1';
    if pg_catalog.pg_database_size(pg_catalog.current_database())
         >= coalesce(v_stop, 471859200) - v_headroom then
      update public.music_catalog_track_candidate
      set match_status = 'quota_skipped', candidate_status = 'skipped', updated_at = now()
      where candidate_id = v_candidate.candidate_id;
      update public.music_sync_job
      set job_status = 'completed', completed_at = now(), lease_until = null, worker_id = null
      where job_id = p_job_id and fence_token = p_fence_token;
      return query select false, 'QUOTA_SKIP'::text, null::uuid;
      return;
    end if;
    v_artist_id := public.music_worker_upsert_artist(v_recording->'artist_credit'->0);
    insert into public.music_recording(
      canonical_mbid, title, disambiguation, artist_credit_name, primary_artist_id,
      length_ms, is_video, first_release_date_text, last_mb_verified_at
    ) values (
      v_recording_mbid, v_recording->>'title', nullif(v_recording->>'disambiguation',''),
      v_recording->'artist_credit'->0->>'credited_name', v_artist_id,
      (v_recording->>'length_ms')::integer, coalesce((v_recording->>'video')::boolean, false),
      nullif(v_recording->>'first_release_date_text',''), now()
    ) returning recording_id into v_recording_id;
    insert into public.music_recording_mbid(
      mbid, recording_id, identifier_status, is_canonical, resolved_mbid, last_checked_at, last_http_status
    ) values (v_recording_mbid, v_recording_id, 'current', true, v_recording_mbid, now(), 200);
    v_new_recording := true;
  end if;

  delete from public.music_recording_artist_credit where recording_id = v_recording_id;
  v_position := 0;
  for v_credit in select value from jsonb_array_elements(v_recording->'artist_credit')
  loop
    v_artist_id := public.music_worker_upsert_artist(v_credit);
    insert into public.music_recording_artist_credit(recording_id, position, artist_id, credited_name, join_phrase)
      values (v_recording_id, v_position, v_artist_id, v_credit->>'credited_name', coalesce(v_credit->>'join_phrase',''));
    v_position := v_position + 1;
  end loop;
  delete from public.music_recording_isrc where recording_id = v_recording_id;
  for v_isrc in select value from jsonb_array_elements(coalesce(v_recording->'isrcs', '[]'::jsonb))
  loop
    insert into public.music_recording_isrc(recording_id, isrc)
      values (v_recording_id, upper(v_isrc #>> '{}')) on conflict do nothing;
  end loop;
  perform public.music_worker_upsert_tags('recording', v_recording_id, v_recording->'tags', v_recording->'genres');

  for v_alias in select value from jsonb_array_elements(coalesce(p_payload->'recording_aliases','[]'::jsonb))
  loop
    perform public.music_reject_unknown_keys(v_alias, array['mbid','redirect_target_mbid']);
    insert into public.music_recording_mbid(
      mbid, recording_id, identifier_status, is_canonical, redirect_target_mbid,
      resolved_mbid, last_checked_at, redirect_detected_at, last_http_status
    ) values (
      (v_alias->>'mbid')::uuid, v_recording_id, 'redirected', false,
      (v_alias->>'redirect_target_mbid')::uuid, v_recording_mbid, now(), now(), 301
    )
    on conflict (mbid) do update set
      identifier_status = 'redirected', is_canonical = false,
      redirect_target_mbid = excluded.redirect_target_mbid,
      resolved_mbid = excluded.resolved_mbid,
      last_checked_at = now(), last_http_status = 301;
  end loop;

  v_artist_id := public.music_worker_upsert_artist(v_album->'artist_credit'->0);
  v_album_mbid := (v_album->>'mbid')::uuid;
  select album_id into v_album_id from public.music_album_mbid where mbid = v_album_mbid for update;
  if v_album_id is null then
    insert into public.music_album(
      canonical_mbid, title, disambiguation, primary_type, secondary_types,
      artist_credit_name, primary_artist_id, first_release_date_text, last_mb_verified_at
    ) values (
      v_album_mbid, v_album->>'title', nullif(v_album->>'disambiguation',''),
      nullif(v_album->>'primary_type',''),
      coalesce(array(select jsonb_array_elements_text(coalesce(v_album->'secondary_types','[]'::jsonb))), '{}'),
      v_album->'artist_credit'->0->>'credited_name', v_artist_id,
      nullif(v_album->>'first_release_date_text',''), now()
    ) returning album_id into v_album_id;
    insert into public.music_album_mbid(
      mbid, album_id, identifier_status, is_canonical, resolved_mbid, last_checked_at, last_http_status
    ) values (v_album_mbid, v_album_id, 'current', true, v_album_mbid, now(), 200);
  end if;
  perform public.music_worker_upsert_tags('album', v_album_id, v_album->'tags', v_album->'genres');

  v_release_mbid := (v_release->>'mbid')::uuid;
  select release_id into v_release_id from public.music_release_mbid where mbid = v_release_mbid for update;
  if v_release_id is null then
    insert into public.music_release(
      album_id, canonical_mbid, title, artist_credit_name, status, quality, packaging,
      country_code, release_date_text, barcode, text_language, text_script,
      track_count, medium_count, is_representative, row_version
    ) values (
      v_album_id, v_release_mbid, v_release->>'title',
      v_release->'artist_credit'->0->>'credited_name',
      nullif(v_release->>'status',''), nullif(v_release->>'quality',''),
      nullif(v_release->>'packaging',''), nullif(v_release->>'country_code',''),
      nullif(v_release->>'release_date_text',''), nullif(v_release->>'barcode',''),
      nullif(v_release->>'text_language',''), nullif(v_release->>'text_script',''),
      1, 1, not exists (
        select 1 from public.music_release r where r.album_id = v_album_id and r.is_representative
      ), 0
    ) returning release_id into v_release_id;
    insert into public.music_release_mbid(
      mbid, release_id, identifier_status, is_canonical, resolved_mbid, last_checked_at, last_http_status
    ) values (v_release_mbid, v_release_id, 'current', true, v_release_mbid, now(), 200);
  end if;
  perform public.music_worker_upsert_tags('release', v_release_id, v_release->'tags', v_release->'genres');

  v_track_mbid := (v_track->>'mbid')::uuid;
  select track_id into v_track_id from public.music_track_mbid where mbid = v_track_mbid for update;
  if v_track_id is null then
    select track_id into v_track_id
    from public.music_track
    where release_id = v_release_id
      and medium_position = (v_medium->>'position')::integer
      and track_position = (v_track->>'position')::integer
    for update;
  end if;
  if v_track_id is null then
    insert into public.music_track(
      release_id, album_id, recording_id, canonical_mbid, source_recording_mbid,
      medium_position, medium_title, medium_format, track_position, track_number,
      title, length_ms, artist_credit_name
    ) values (
      v_release_id, v_album_id, v_recording_id, v_track_mbid, v_recording_mbid,
      (v_medium->>'position')::integer, nullif(v_medium->>'title',''), nullif(v_medium->>'format',''),
      (v_track->>'position')::integer, v_track->>'number', v_track->>'title',
      (v_track->>'length_ms')::integer, v_track->'artist_credit'->0->>'credited_name'
    ) returning track_id into v_track_id;
    insert into public.music_track_mbid(
      mbid, track_id, identifier_status, is_canonical, resolved_mbid, last_checked_at, last_http_status
    ) values (v_track_mbid, v_track_id, 'current', true, v_track_mbid, now(), 200);
  end if;

  select m.schedule_id, s.priority
  into v_other
  from public.music_schedule_catalog_recording m
  join public.music_collection_schedule s on s.schedule_id = m.schedule_id
  where m.recording_id = v_recording_id
    and m.is_enabled
    and m.membership_status in ('pending', 'active')
    and m.schedule_id <> v_schedule.schedule_id
  order by s.priority, s.schedule_id
  limit 1
  for update of m;
  if found and v_other.priority < v_schedule.priority then
    update public.music_catalog_track_candidate
    set recording_id = v_recording_id, recording_mbid = v_recording_mbid,
        match_status = 'skipped_exclusive', candidate_status = 'skipped', updated_at = now()
    where candidate_id = v_candidate.candidate_id;
    update public.music_sync_job
    set job_status = 'completed', completed_at = now(), lease_until = null, worker_id = null
    where job_id = p_job_id and fence_token = p_fence_token;
    return query select true, 'SKIPPED_EXCLUSIVE'::text, v_recording_id;
    return;
  end if;
  update public.music_schedule_catalog_recording
  set is_enabled = false, membership_status = 'retired', updated_at = now()
  where recording_id = v_recording_id
    and schedule_id <> v_schedule.schedule_id
    and is_enabled;

  insert into public.music_schedule_catalog_recording(
    schedule_id, recording_id, identity_key, chart_rank, membership_status, is_enabled, last_seen_run_id
  ) values (
    v_schedule.schedule_id, v_recording_id, v_candidate.identity_key,
    v_candidate.chart_rank, 'active', true, v_job.schedule_run_id
  )
  on conflict (schedule_id, recording_id) do update set
    identity_key = excluded.identity_key,
    chart_rank = excluded.chart_rank,
    membership_status = 'active',
    is_enabled = true,
    last_seen_run_id = excluded.last_seen_run_id,
    updated_at = now();

  update public.music_catalog_track_candidate
  set recording_id = v_recording_id, recording_mbid = v_recording_mbid,
      match_status = 'applied', candidate_status = 'applied', updated_at = now()
  where candidate_id = v_candidate.candidate_id;

  if v_new_recording then
    update public.music_schedule_run
    set inserted_count = inserted_count + 1,
        new_recording_count = new_recording_count + 1
    where schedule_run_id = v_job.schedule_run_id;
  else
    update public.music_schedule_run
    set updated_count = updated_count + 1
    where schedule_run_id = v_job.schedule_run_id;
  end if;

  insert into public.music_sync_job(
    job_kind, entity_type, entity_id, idempotency_key, priority,
    schedule_id, schedule_run_id
  ) values (
    'lastfm_tags', 'recording', v_recording_id,
    'lastfm-tags:' || v_job.schedule_run_id::text || ':' || v_recording_id::text,
    v_schedule.priority, v_schedule.schedule_id, v_job.schedule_run_id
  )
  on conflict (idempotency_key) do nothing;

  update public.music_sync_job
  set job_status = 'completed', completed_at = now(), lease_until = null, worker_id = null
  where job_id = p_job_id and fence_token = p_fence_token;
  return query select true, 'APPLIED'::text, v_recording_id;
end;
$$;


revoke all on function public.music_rpc_apply_catalog_recording_bundle(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.music_rpc_apply_catalog_recording_bundle(uuid, uuid, jsonb)
  to service_role;

comment on function public.music_rpc_apply_discovery_page(
  uuid, uuid, integer, integer, integer, bytea, jsonb, boolean
) is
  'MusicBrainz discovery 페이지를 후보로 저장한다. next_offset는 테이블 alias로만 갱신한다.';
comment on function public.music_rpc_apply_catalog_recording_bundle(uuid, uuid, jsonb) is
  '차트 Recording 최소 bundle을 원장에 넣는다. OUT은 applied_recording_id로 테이블 recording_id와 분리한다.';
