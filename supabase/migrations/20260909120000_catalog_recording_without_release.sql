-- Catalog may persist a Recording without album/release.
-- Last.fm tag vectors key off recording_id; standalone tracks are valid.

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
  v_is_representative boolean;
  v_retired_at timestamptz;
begin
  perform public.music_reject_unknown_keys(p_payload, array[
    'candidate_id','requested_mbid','canonical_mbid','recording_aliases','album','release','recording'
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
  if v_release is not null and jsonb_typeof(v_release) = 'object'
     and nullif(v_release->>'mbid', '') is not null then
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
  else
    v_album := null;
    v_release := null;
    v_recording := p_payload->'recording';
  end if;
  if v_recording is null or jsonb_typeof(v_recording) <> 'object' then
    return query select false, 'INVALID_PAYLOAD'::text, null::uuid;
    return;
  end if;
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

  if v_release is not null and nullif(v_release->>'mbid', '') is not null then
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

  perform 1 from public.music_album a where a.album_id = v_album_id for update;
  v_release_mbid := (v_release->>'mbid')::uuid;
  select release_id into v_release_id from public.music_release_mbid where mbid = v_release_mbid for update;
  if v_release_id is null then
    v_is_representative := not exists (
      select 1 from public.music_release r
      where r.album_id = v_album_id and r.is_representative
    );
    v_retired_at := case when v_is_representative then null else now() end;
    insert into public.music_release(
      album_id, canonical_mbid, title, artist_credit_name, status, quality, packaging,
      country_code, release_date_text, barcode, text_language, text_script,
      track_count, medium_count, is_representative, retired_at, row_version
    ) values (
      v_album_id, v_release_mbid, v_release->>'title',
      v_release->'artist_credit'->0->>'credited_name',
      nullif(v_release->>'status',''), nullif(v_release->>'quality',''),
      nullif(v_release->>'packaging',''), nullif(v_release->>'country_code',''),
      nullif(v_release->>'release_date_text',''), nullif(v_release->>'barcode',''),
      nullif(v_release->>'text_language',''), nullif(v_release->>'text_script',''),
      1, 1, v_is_representative, v_retired_at, 0
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

alter function public.music_rpc_apply_catalog_recording_bundle(uuid, uuid, jsonb)
  owner to nrm_music_rpc_owner;
revoke all on function public.music_rpc_apply_catalog_recording_bundle(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.music_rpc_apply_catalog_recording_bundle(uuid, uuid, jsonb)
  to service_role, nrm_music_rpc_owner;
comment on function public.music_rpc_apply_catalog_recording_bundle(uuid, uuid, jsonb) is
  '차트 Recording을 원장에 넣는다. album/release는 있으면 저장하고, 없으면 Recording만 넣은 뒤 Last.fm 태그를 큐잉한다';
