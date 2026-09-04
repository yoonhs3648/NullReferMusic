-- Durable MusicBrainz worker RPC expansion.
-- Depends on 20260904130000 and 20260904132000.
-- No allowlist/schedule seed and no raw MusicBrainz response storage.

grant usage, create on schema public to nrm_music_rpc_owner;

create function public.music_rpc_claim_mb_work(
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
    where j.job_kind in ('mb_discovery','mb_release_hydrate','mb_recording_hydrate')
      and (
        (j.job_status in ('pending','retry') and j.available_at <= now())
        or (j.job_status = 'processing' and j.lease_until < now())
      )
    order by
      case j.job_kind when 'mb_discovery' then 0 when 'mb_release_hydrate' then 1 else 2 end,
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
      when c.job_kind = 'mb_discovery' then jsonb_build_object(
        'discovery_scan_id', d.discovery_scan_id,
        'artist_mbid', d.artist_mbid,
        'next_offset', d.next_offset,
        'date_from', sr.date_from,
        'date_to', sr.date_to
      )
      when c.job_kind = 'mb_release_hydrate' then jsonb_build_object(
        'candidate_id', rc.candidate_id,
        'release_mbid', rc.release_mbid,
        'artist_mbid', rc.artist_mbid,
        'date_from', sr.date_from,
        'date_to', sr.date_to,
        'country_codes', s.country_codes,
        'release_statuses', s.release_statuses,
        'primary_types', s.primary_types,
        'secondary_types', s.secondary_types
      )
      else jsonb_build_object(
        'recording_mbid', c.entity_id,
        'schedule_run_id', c.schedule_run_id
      )
    end
  from claimed c
  left join public.music_discovery_scan d on d.discovery_scan_id = c.discovery_scan_id
  left join public.music_release_candidate rc on rc.candidate_id = c.candidate_id
  left join public.music_schedule_run sr on sr.schedule_run_id = c.schedule_run_id
  left join public.music_collection_schedule s on s.schedule_id = c.schedule_id;
end;
$$;

create function public.music_rpc_continue_discovery_job(
  p_job_id uuid, p_fence_token uuid
)
returns table(applied boolean, result_code text)
language plpgsql security definer set search_path = ''
as $$
declare v_updated integer;
begin
  update public.music_sync_job
  set job_status = 'retry', available_at = now(), lease_until = null,
      worker_id = null, fence_token = null
  where job_id = p_job_id and job_kind = 'mb_discovery'
    and job_status = 'processing' and fence_token = p_fence_token;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return query select false, 'FENCE_LOST'::text;
  else
    return query select true, 'APPLIED'::text;
  end if;
end;
$$;

create or replace function public.music_rpc_finish_job(
  p_job_id uuid, p_fence_token uuid, p_outcome text,
  p_http_status integer default null, p_api_error_code integer default null,
  p_error_message text default null, p_retry_at timestamptz default null
)
returns table(applied boolean, result_code text)
language plpgsql security definer set search_path = ''
as $$
declare v_job public.music_sync_job%rowtype;
begin
  if p_outcome not in ('completed','retry','blocked','quarantined','dead')
     or (p_outcome = 'retry' and p_retry_at is null)
     or char_length(coalesce(p_error_message,'')) > 1000 then
    raise exception using errcode = '22023', message = 'invalid job finish parameters';
  end if;
  select * into v_job from public.music_sync_job
    where job_id = p_job_id for update;
  if not found or v_job.job_status <> 'processing'
     or v_job.fence_token is distinct from p_fence_token
     or v_job.lease_until < now() then
    return query select false, 'FENCE_LOST'::text; return;
  end if;
  update public.music_sync_job set
    job_status = p_outcome,
    http_status = p_http_status,
    api_error_code = p_api_error_code,
    last_error_message = nullif(left(p_error_message, 1000), ''),
    available_at = case when p_outcome = 'retry' then p_retry_at else available_at end,
    completed_at = case when p_outcome = 'completed' then now() else null end,
    lease_until = null, worker_id = null, fence_token = null
  where job_id = p_job_id;
  if v_job.job_kind = 'mb_discovery' then
    update public.music_discovery_scan set
      scan_status = case p_outcome
        when 'retry' then 'retry'
        when 'completed' then 'completed'
        when 'quarantined' then 'quarantined'
        else 'failed'
      end,
      lease_until = null, worker_id = null, fence_token = null,
      completed_at = case when p_outcome in ('completed','quarantined','dead','blocked')
        then coalesce(completed_at, now()) else completed_at end
    where discovery_scan_id = v_job.discovery_scan_id;
  elsif v_job.job_kind = 'mb_release_hydrate'
        and p_outcome in ('blocked','quarantined','dead') then
    update public.music_release_candidate set
      candidate_status = case when p_outcome = 'quarantined' then 'quarantined' else 'rejected' end,
      validation_result = p_outcome, updated_at = now()
    where candidate_id = v_job.candidate_id;
  end if;
  if p_outcome in ('blocked','quarantined','dead') then
    update public.music_schedule_run set failure_count = failure_count + 1
      where schedule_run_id = v_job.schedule_run_id;
    insert into public.music_dead_letter(source_kind, source_id, reason, sanitized_payload)
      values (
        'sync_job', p_job_id, coalesce(nullif(left(p_error_message, 1000), ''), p_outcome),
        jsonb_build_object(
          'job_kind', v_job.job_kind,
          'entity_type', v_job.entity_type,
          'http_status', p_http_status,
          'api_error_code', p_api_error_code
        )
      )
      on conflict (source_kind, source_id) where resolved_at is null
      do update set reason = excluded.reason, sanitized_payload = excluded.sanitized_payload,
        failed_at = now();
  end if;
  return query select true, 'APPLIED'::text;
end;
$$;

-- Internal helpers are deliberately static SQL per entity type; no dynamic SQL is used.
create function public.music_worker_upsert_artist(p_credit jsonb)
returns uuid
language plpgsql set search_path = ''
as $$
declare v_id uuid; v_mbid uuid;
begin
  perform public.music_reject_unknown_keys(
    p_credit, array['artist_mbid','name','sort_name','credited_name','join_phrase']
  );
  v_mbid := (p_credit->>'artist_mbid')::uuid;
  select artist_id into v_id from public.music_artist_mbid where mbid = v_mbid for update;
  if v_id is null then
    insert into public.music_artist(
      canonical_mbid, name, sort_name, last_mb_verified_at
    ) values (
      v_mbid, p_credit->>'name', nullif(p_credit->>'sort_name',''), now()
    ) returning artist_id into v_id;
    insert into public.music_artist_mbid(
      mbid, artist_id, identifier_status, is_canonical, resolved_mbid,
      last_checked_at, last_http_status
    ) values (v_mbid, v_id, 'current', true, v_mbid, now(), 200);
  else
    update public.music_artist
      set name = p_credit->>'name',
          sort_name = nullif(p_credit->>'sort_name',''),
          last_mb_verified_at = now(),
          row_version = row_version + 1
      where artist_id = v_id and entity_status = 'active';
  end if;
  return v_id;
end;
$$;

create function public.music_worker_upsert_tags(
  p_entity_type text, p_entity_id uuid, p_tags jsonb, p_genres jsonb
)
returns void
language plpgsql set search_path = ''
as $$
declare v_item jsonb; v_tag_id bigint; v_name text; v_normalized text; v_genre uuid;
begin
  if p_entity_type not in ('album','release','recording') or
     jsonb_typeof(coalesce(p_tags, '[]'::jsonb)) <> 'array' or
     jsonb_typeof(coalesce(p_genres, '[]'::jsonb)) <> 'array' or
     jsonb_array_length(coalesce(p_tags, '[]'::jsonb)) > 200 or
     jsonb_array_length(coalesce(p_genres, '[]'::jsonb)) > 200 then
    raise exception using errcode = '22023', message = 'invalid MusicBrainz tag/genre payload';
  end if;
  if p_entity_type = 'album' then
    delete from public.music_album_mb_tag where album_id = p_entity_id;
    delete from public.music_album_genre where album_id = p_entity_id;
  elsif p_entity_type = 'release' then
    delete from public.music_release_mb_tag where release_id = p_entity_id;
    delete from public.music_release_genre where release_id = p_entity_id;
  else
    delete from public.music_recording_mb_tag where recording_id = p_entity_id;
    delete from public.music_recording_genre where recording_id = p_entity_id;
  end if;
  for v_item in select value from jsonb_array_elements(coalesce(p_tags, '[]'::jsonb))
  loop
    perform public.music_reject_unknown_keys(v_item, array['name','count']);
    v_name := btrim(v_item->>'name');
    v_normalized := lower(v_name);
    insert into public.music_tag(canonical_name, normalized_name)
      values (v_name, v_normalized)
      on conflict (normalized_name) do update set canonical_name = excluded.canonical_name
      returning tag_id into v_tag_id;
    if p_entity_type = 'album' then
      insert into public.music_album_mb_tag(album_id, tag_id, source_tag_name, vote_count)
        values (p_entity_id, v_tag_id, v_name, (v_item->>'count')::integer);
    elsif p_entity_type = 'release' then
      insert into public.music_release_mb_tag(release_id, tag_id, source_tag_name, vote_count)
        values (p_entity_id, v_tag_id, v_name, (v_item->>'count')::integer);
    else
      insert into public.music_recording_mb_tag(recording_id, tag_id, source_tag_name, vote_count)
        values (p_entity_id, v_tag_id, v_name, (v_item->>'count')::integer);
    end if;
  end loop;
  for v_item in select value from jsonb_array_elements(coalesce(p_genres, '[]'::jsonb))
  loop
    perform public.music_reject_unknown_keys(v_item, array['id','name','count']);
    v_genre := (v_item->>'id')::uuid;
    v_name := btrim(v_item->>'name');
    v_normalized := lower(v_name);
    insert into public.music_genre(genre_mbid, name, normalized_name)
      values (v_genre, v_name, v_normalized)
      on conflict (genre_mbid) do update set name = excluded.name, normalized_name = excluded.normalized_name;
    if p_entity_type = 'album' then
      insert into public.music_album_genre(album_id, genre_mbid, vote_count)
        values (p_entity_id, v_genre, (v_item->>'count')::integer);
    elsif p_entity_type = 'release' then
      insert into public.music_release_genre(release_id, genre_mbid, vote_count)
        values (p_entity_id, v_genre, (v_item->>'count')::integer);
    else
      insert into public.music_recording_genre(recording_id, genre_mbid, vote_count)
        values (p_entity_id, v_genre, (v_item->>'count')::integer);
    end if;
  end loop;
end;
$$;

create function public.music_rpc_apply_release_bundle_v2(
  p_job_id uuid, p_fence_token uuid, p_payload jsonb
)
returns table(applied boolean, result_code text, candidate_id uuid)
language plpgsql security definer set search_path = ''
as $$
declare
  v_job public.music_sync_job%rowtype;
  v_candidate public.music_release_candidate%rowtype;
  v_album jsonb; v_release jsonb; v_medium jsonb; v_track jsonb; v_recording jsonb;
  v_credit jsonb; v_alias jsonb;
  v_album_id uuid; v_release_id uuid; v_recording_id uuid; v_track_id uuid; v_artist_id uuid;
  v_album_mbid uuid; v_release_mbid uuid; v_recording_mbid uuid; v_track_mbid uuid;
  v_position integer; v_track_count integer := 0; v_medium_count integer := 0;
  v_inserted integer := 0; v_updated integer := 0;
begin
  perform public.music_reject_unknown_keys(p_payload, array[
    'candidate_id','source_release_mbid','source_release_final_mbid',
    'release_aliases','validation_status','album','release'
  ]);
  if p_payload->>'validation_status' <> 'applied' then
    return query select false, 'INVALID_PAYLOAD'::text, null::uuid; return;
  end if;
  if exists (
    select 1 from public.music_capacity_policy p where p.policy_key = 'project1' and p.is_enabled
      and pg_catalog.pg_database_size(pg_catalog.current_database()) >= p.write_stop_bytes
  ) then
    return query select false, 'CAPACITY_WRITE_STOPPED'::text, null::uuid; return;
  end if;
  select * into v_job from public.music_sync_job where job_id = p_job_id for update;
  if not found or v_job.job_kind <> 'mb_release_hydrate' or v_job.job_status <> 'processing'
     or v_job.fence_token is distinct from p_fence_token or v_job.lease_until < now() then
    return query select false, 'FENCE_LOST'::text, v_job.candidate_id; return;
  end if;
  select * into v_candidate from public.music_release_candidate
    where music_release_candidate.candidate_id = v_job.candidate_id for update;
  if (p_payload->>'candidate_id')::uuid is distinct from v_job.candidate_id
     or (p_payload->>'source_release_mbid')::uuid is distinct from v_candidate.release_mbid then
    return query select false, 'INVALID_PAYLOAD'::text, v_job.candidate_id; return;
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
  if jsonb_typeof(v_album->'artist_credit') <> 'array'
     or jsonb_array_length(v_album->'artist_credit') = 0
     or jsonb_typeof(v_release->'artist_credit') <> 'array'
     or jsonb_array_length(v_release->'artist_credit') = 0
     or jsonb_typeof(v_release->'media') <> 'array' then
    return query select false, 'INVALID_PAYLOAD'::text, v_job.candidate_id; return;
  end if;

  v_album_mbid := (v_album->>'mbid')::uuid;
  for v_credit in select value from jsonb_array_elements(v_album->'artist_credit')
  loop
    v_artist_id := public.music_worker_upsert_artist(v_credit);
    exit;
  end loop;
  select album_id into v_album_id from public.music_album_mbid where mbid = v_album_mbid for update;
  if v_album_id is null then
    insert into public.music_album(
      canonical_mbid, title, disambiguation, primary_type, secondary_types,
      artist_credit_name, primary_artist_id, first_release_date_text, last_mb_verified_at
    ) values (
      v_album_mbid, v_album->>'title', nullif(v_album->>'disambiguation',''),
      nullif(v_album->>'primary_type',''),
      coalesce(array(select jsonb_array_elements_text(v_album->'secondary_types')), '{}'),
      (v_album->'artist_credit'->0->>'credited_name'), v_artist_id,
      nullif(v_album->>'first_release_date_text',''), now()
    ) returning album_id into v_album_id;
    insert into public.music_album_mbid(
      mbid, album_id, identifier_status, is_canonical, resolved_mbid, last_checked_at, last_http_status
    ) values (v_album_mbid, v_album_id, 'current', true, v_album_mbid, now(), 200);
    v_inserted := v_inserted + 1;
  else
    update public.music_album set
      title = v_album->>'title', disambiguation = nullif(v_album->>'disambiguation',''),
      primary_type = nullif(v_album->>'primary_type',''),
      secondary_types = coalesce(array(select jsonb_array_elements_text(v_album->'secondary_types')), '{}'),
      artist_credit_name = v_album->'artist_credit'->0->>'credited_name',
      primary_artist_id = v_artist_id,
      first_release_date_text = nullif(v_album->>'first_release_date_text',''),
      last_mb_verified_at = now(), row_version = row_version + 1
    where album_id = v_album_id and entity_status = 'active';
    v_updated := v_updated + 1;
  end if;
  delete from public.music_album_artist_credit where album_id = v_album_id;
  v_position := 0;
  for v_credit in select value from jsonb_array_elements(v_album->'artist_credit')
  loop
    v_artist_id := public.music_worker_upsert_artist(v_credit);
    insert into public.music_album_artist_credit(album_id, position, artist_id, credited_name, join_phrase)
      values (v_album_id, v_position, v_artist_id, v_credit->>'credited_name', coalesce(v_credit->>'join_phrase',''));
    v_position := v_position + 1;
  end loop;
  perform public.music_worker_upsert_tags('album', v_album_id, v_album->'tags', v_album->'genres');
  for v_alias in select value from jsonb_array_elements(coalesce(v_album->'aliases','[]'::jsonb))
  loop
    perform public.music_reject_unknown_keys(v_alias, array['mbid','redirect_target_mbid']);
    if exists (
      select 1 from public.music_album_mbid
      where mbid = (v_alias->>'mbid')::uuid and album_id <> v_album_id
    ) then
      return query select false, 'QUARANTINED'::text, v_job.candidate_id; return;
    end if;
    insert into public.music_album_mbid(
      mbid, album_id, identifier_status, is_canonical, redirect_target_mbid,
      resolved_mbid, last_checked_at, redirect_detected_at, last_http_status
    ) values (
      (v_alias->>'mbid')::uuid, v_album_id, 'redirected', false,
      (v_alias->>'redirect_target_mbid')::uuid, v_album_mbid, now(), now(), 301
    ) on conflict (mbid) do update set
      identifier_status = 'redirected', is_canonical = false,
      redirect_target_mbid = excluded.redirect_target_mbid,
      resolved_mbid = excluded.resolved_mbid, last_checked_at = now(), last_http_status = 301;
  end loop;

  v_release_mbid := (v_release->>'mbid')::uuid;
  select release_id into v_release_id from public.music_release_mbid where mbid = v_release_mbid for update;
  update public.music_release set is_representative = false, retired_at = now()
    where album_id = v_album_id and is_representative
      and (v_release_id is null or release_id <> v_release_id);
  select count(*), coalesce(sum(jsonb_array_length(value->'tracks')), 0)
    into v_medium_count, v_track_count
    from jsonb_array_elements(v_release->'media');
  if v_release_id is null then
    insert into public.music_release(
      album_id, canonical_mbid, title, artist_credit_name, status, quality, packaging,
      country_code, release_date_text, barcode, text_language, text_script,
      track_count, medium_count, is_representative, selection_score
    ) values (
      v_album_id, v_release_mbid, v_release->>'title',
      v_release->'artist_credit'->0->>'credited_name', nullif(v_release->>'status',''),
      nullif(v_release->>'quality',''), nullif(v_release->>'packaging',''),
      nullif(v_release->>'country_code',''), nullif(v_release->>'release_date_text',''),
      nullif(v_release->>'barcode',''), nullif(v_release->>'text_language',''),
      nullif(v_release->>'text_script',''), v_track_count, v_medium_count, true, 0
    ) returning release_id into v_release_id;
    insert into public.music_release_mbid(
      mbid, release_id, identifier_status, is_canonical, resolved_mbid, last_checked_at, last_http_status
    ) values (v_release_mbid, v_release_id, 'current', true, v_release_mbid, now(), 200);
    v_inserted := v_inserted + 1;
  else
    if exists (select 1 from public.music_release where release_id = v_release_id and album_id <> v_album_id) then
      return query select false, 'QUARANTINED'::text, v_job.candidate_id; return;
    end if;
    update public.music_release set
      title = v_release->>'title', artist_credit_name = v_release->'artist_credit'->0->>'credited_name',
      status = nullif(v_release->>'status',''), quality = nullif(v_release->>'quality',''),
      packaging = nullif(v_release->>'packaging',''), country_code = nullif(v_release->>'country_code',''),
      release_date_text = nullif(v_release->>'release_date_text',''), barcode = nullif(v_release->>'barcode',''),
      text_language = nullif(v_release->>'text_language',''), text_script = nullif(v_release->>'text_script',''),
      track_count = v_track_count, medium_count = v_medium_count,
      is_representative = true, retired_at = null, selected_at = now(), row_version = row_version + 1
    where release_id = v_release_id;
    v_updated := v_updated + 1;
  end if;
  delete from public.music_release_artist_credit where release_id = v_release_id;
  v_position := 0;
  for v_credit in select value from jsonb_array_elements(v_release->'artist_credit')
  loop
    v_artist_id := public.music_worker_upsert_artist(v_credit);
    insert into public.music_release_artist_credit(release_id, position, artist_id, credited_name, join_phrase)
      values (v_release_id, v_position, v_artist_id, v_credit->>'credited_name', coalesce(v_credit->>'join_phrase',''));
    v_position := v_position + 1;
  end loop;
  perform public.music_worker_upsert_tags('release', v_release_id, v_release->'tags', v_release->'genres');

  for v_medium in select value from jsonb_array_elements(v_release->'media')
  loop
    perform public.music_reject_unknown_keys(v_medium, array['position','title','format','tracks']);
    for v_track in select value from jsonb_array_elements(v_medium->'tracks')
    loop
      perform public.music_reject_unknown_keys(v_track, array[
        'mbid','position','number','title','length_ms','artist_credit','recording'
      ]);
      v_recording := v_track->'recording';
      perform public.music_reject_unknown_keys(v_recording, array[
        'mbid','title','disambiguation','length_ms','video',
        'first_release_date_text','artist_credit'
      ]);
      v_recording_mbid := (v_recording->>'mbid')::uuid;
      select recording_id into v_recording_id from public.music_recording_mbid
        where mbid = v_recording_mbid for update;
      v_artist_id := public.music_worker_upsert_artist(v_recording->'artist_credit'->0);
      if v_recording_id is null then
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
        v_inserted := v_inserted + 1;
      end if;
      v_track_mbid := (v_track->>'mbid')::uuid;
      select track_id into v_track_id from public.music_track_mbid where mbid = v_track_mbid for update;
      if v_track_id is null then
        select track_id into v_track_id from public.music_track
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
      else
        if exists (
          select 1 from public.music_track
          where track_id = v_track_id and (
            release_id <> v_release_id
            or medium_position <> (v_medium->>'position')::integer
            or track_position <> (v_track->>'position')::integer
          )
        ) then
          return query select false, 'QUARANTINED'::text, v_job.candidate_id; return;
        end if;
        update public.music_track_mbid set
          identifier_status = 'unresolved', is_canonical = false, resolved_mbid = null
        where track_id = v_track_id and is_canonical and mbid <> v_track_mbid;
        insert into public.music_track_mbid(
          mbid, track_id, identifier_status, is_canonical, resolved_mbid, last_checked_at, last_http_status
        ) values (v_track_mbid, v_track_id, 'current', true, v_track_mbid, now(), 200)
        on conflict (mbid) do update set
          identifier_status = 'current', is_canonical = true,
          redirect_target_mbid = null, resolved_mbid = excluded.mbid,
          last_checked_at = now(), last_http_status = 200;
        update public.music_track set
          canonical_mbid = v_track_mbid,
          recording_id = v_recording_id, source_recording_mbid = v_recording_mbid,
          medium_title = nullif(v_medium->>'title',''), medium_format = nullif(v_medium->>'format',''),
          track_number = v_track->>'number', title = v_track->>'title',
          length_ms = (v_track->>'length_ms')::integer,
          artist_credit_name = v_track->'artist_credit'->0->>'credited_name',
          entity_status = 'active'
        where track_id = v_track_id;
      end if;
      delete from public.music_track_artist_credit where track_id = v_track_id;
      v_position := 0;
      for v_credit in select value from jsonb_array_elements(v_track->'artist_credit')
      loop
        v_artist_id := public.music_worker_upsert_artist(v_credit);
        insert into public.music_track_artist_credit(track_id, position, artist_id, credited_name, join_phrase)
          values (v_track_id, v_position, v_artist_id, v_credit->>'credited_name', coalesce(v_credit->>'join_phrase',''));
        v_position := v_position + 1;
      end loop;
      insert into public.music_sync_job(
        job_kind, entity_type, entity_id, idempotency_key, priority,
        schedule_id, schedule_run_id, candidate_id
      ) values (
        'mb_recording_hydrate', 'recording', v_recording_mbid,
        'recording-hydrate:' || v_recording_mbid::text || ':' ||
          pg_catalog.to_char(now() at time zone 'UTC', 'YYYY-MM-DD'),
        -10, v_job.schedule_id, v_job.schedule_run_id, v_job.candidate_id
      ) on conflict (idempotency_key) do nothing;
    end loop;
  end loop;

  -- Tracks absent from the latest representative tracklist remain as identifier
  -- history but are no longer active authority rows.
  update public.music_track_mbid tm
  set identifier_status = 'unresolved', is_canonical = false, resolved_mbid = null
  from public.music_track t
  where t.track_id = tm.track_id and t.release_id = v_release_id and tm.is_canonical
    and not exists (
      select 1
      from jsonb_array_elements(v_release->'media') m,
           jsonb_array_elements(m->'tracks') tr
      where (m->>'position')::integer = t.medium_position
        and (tr->>'position')::integer = t.track_position
    );
  update public.music_track t
  set entity_status = 'deleted', canonical_mbid = null
  where t.release_id = v_release_id
    and not exists (
      select 1
      from jsonb_array_elements(v_release->'media') m,
           jsonb_array_elements(m->'tracks') tr
      where (m->>'position')::integer = t.medium_position
        and (tr->>'position')::integer = t.track_position
    );

  -- Redirect aliases are attached only after the final MBID entity exists.
  for v_alias in select value from jsonb_array_elements(coalesce(p_payload->'release_aliases','[]'::jsonb))
  loop
    perform public.music_reject_unknown_keys(v_alias, array['mbid','redirect_target_mbid']);
    if exists (
      select 1 from public.music_release_mbid
      where mbid = (v_alias->>'mbid')::uuid and release_id <> v_release_id
    ) then
      return query select false, 'QUARANTINED'::text, v_job.candidate_id; return;
    end if;
    insert into public.music_release_mbid(
      mbid, release_id, identifier_status, is_canonical, redirect_target_mbid,
      resolved_mbid, last_checked_at, redirect_detected_at, last_http_status
    ) values (
      (v_alias->>'mbid')::uuid, v_release_id, 'redirected', false,
      (v_alias->>'redirect_target_mbid')::uuid, v_release_mbid, now(), now(), 301
    ) on conflict (mbid) do update set
      identifier_status = 'redirected', is_canonical = false,
      redirect_target_mbid = excluded.redirect_target_mbid,
      resolved_mbid = excluded.resolved_mbid, last_checked_at = now(), last_http_status = 301;
  end loop;
  update public.music_release_candidate set
    release_group_mbid = v_album_mbid,
    representative_release_mbid = v_release_mbid,
    validation_result = 'applied', candidate_status = 'applied', applied_at = now()
  where music_release_candidate.candidate_id = v_job.candidate_id;
  update public.music_schedule_run set
    inserted_count = inserted_count + v_inserted,
    updated_count = updated_count + v_updated
  where schedule_run_id = v_job.schedule_run_id;
  update public.music_sync_job set
    job_status = 'completed', completed_at = now(), lease_until = null, worker_id = null
  where music_sync_job.job_id = p_job_id and fence_token = p_fence_token;
  return query select true, 'APPLIED'::text, v_job.candidate_id;
end;
$$;

create function public.music_rpc_apply_recording_bundle(
  p_job_id uuid, p_fence_token uuid, p_payload jsonb
)
returns table(applied boolean, result_code text, recording_id uuid)
language plpgsql security definer set search_path = ''
as $$
declare
  v_job public.music_sync_job%rowtype; v_recording_id uuid; v_canonical uuid;
  v_credit jsonb; v_alias jsonb; v_value jsonb; v_artist_id uuid; v_position integer := 0;
begin
  perform public.music_reject_unknown_keys(p_payload, array[
    'requested_mbid','canonical_mbid','aliases','title','disambiguation','length_ms',
    'video','first_release_date_text','artist_credit','isrcs','tags','genres'
  ]);
  select * into v_job from public.music_sync_job where job_id = p_job_id for update;
  if not found or v_job.job_kind <> 'mb_recording_hydrate' or v_job.job_status <> 'processing'
     or v_job.fence_token is distinct from p_fence_token or v_job.lease_until < now()
     or v_job.entity_id is distinct from (p_payload->>'requested_mbid')::uuid then
    return query select false, 'FENCE_LOST'::text, null::uuid; return;
  end if;
  v_canonical := (p_payload->>'canonical_mbid')::uuid;
  select music_recording_mbid.recording_id into v_recording_id
    from public.music_recording_mbid where mbid = (p_payload->>'requested_mbid')::uuid for update;
  if v_recording_id is null then
    select music_recording_mbid.recording_id into v_recording_id
      from public.music_recording_mbid where mbid = v_canonical for update;
  end if;
  if v_recording_id is null then
    return query select false, 'VERSION_CONFLICT'::text, null::uuid; return;
  end if;
  if exists (
    select 1 from public.music_recording_mbid
    where mbid = v_canonical and recording_id <> v_recording_id
  ) then
    return query select false, 'QUARANTINED'::text, v_recording_id; return;
  end if;
  v_artist_id := public.music_worker_upsert_artist(p_payload->'artist_credit'->0);
  update public.music_recording set
    title = p_payload->>'title', disambiguation = nullif(p_payload->>'disambiguation',''),
    artist_credit_name = p_payload->'artist_credit'->0->>'credited_name',
    primary_artist_id = v_artist_id, length_ms = (p_payload->>'length_ms')::integer,
    is_video = coalesce((p_payload->>'video')::boolean, false),
    first_release_date_text = nullif(p_payload->>'first_release_date_text',''),
    last_mb_verified_at = now(), row_version = row_version + 1
  where music_recording.recording_id = v_recording_id and entity_status = 'active';
  if not found then
    return query select false, 'QUARANTINED'::text, v_recording_id; return;
  end if;
  update public.music_recording_mbid set
    identifier_status = 'unresolved', is_canonical = false, resolved_mbid = null
  where music_recording_mbid.recording_id = v_recording_id and is_canonical and mbid <> v_canonical;
  insert into public.music_recording_mbid(
    mbid, recording_id, identifier_status, is_canonical, resolved_mbid, last_checked_at, last_http_status
  ) values (v_canonical, v_recording_id, 'current', true, v_canonical, now(), 200)
  on conflict (mbid) do update set
    identifier_status = 'current', is_canonical = true, redirect_target_mbid = null,
    resolved_mbid = excluded.mbid, last_checked_at = now(), last_http_status = 200;
  update public.music_recording set canonical_mbid = v_canonical,
    resolution_version = resolution_version + 1 where music_recording.recording_id = v_recording_id;
  for v_alias in select value from jsonb_array_elements(coalesce(p_payload->'aliases','[]'::jsonb))
  loop
    perform public.music_reject_unknown_keys(v_alias, array['mbid','redirect_target_mbid']);
    insert into public.music_recording_mbid(
      mbid, recording_id, identifier_status, is_canonical, redirect_target_mbid,
      resolved_mbid, last_checked_at, redirect_detected_at, last_http_status
    ) values (
      (v_alias->>'mbid')::uuid, v_recording_id, 'redirected', false,
      (v_alias->>'redirect_target_mbid')::uuid, v_canonical, now(), now(), 301
    ) on conflict (mbid) do update set
      identifier_status = 'redirected', is_canonical = false,
      redirect_target_mbid = excluded.redirect_target_mbid,
      resolved_mbid = excluded.resolved_mbid, last_checked_at = now(), last_http_status = 301;
  end loop;
  delete from public.music_recording_artist_credit where recording_id = v_recording_id;
  for v_credit in select value from jsonb_array_elements(p_payload->'artist_credit')
  loop
    v_artist_id := public.music_worker_upsert_artist(v_credit);
    insert into public.music_recording_artist_credit(recording_id, position, artist_id, credited_name, join_phrase)
      values (v_recording_id, v_position, v_artist_id, v_credit->>'credited_name', coalesce(v_credit->>'join_phrase',''));
    v_position := v_position + 1;
  end loop;
  delete from public.music_recording_isrc where recording_id = v_recording_id;
  for v_value in select value from jsonb_array_elements(coalesce(p_payload->'isrcs','[]'::jsonb))
  loop
    insert into public.music_recording_isrc(recording_id, isrc)
      values (v_recording_id, upper(v_value #>> '{}')) on conflict do nothing;
  end loop;
  perform public.music_worker_upsert_tags('recording', v_recording_id, p_payload->'tags', p_payload->'genres');
  update public.music_sync_job set
    job_status = 'completed', completed_at = now(), lease_until = null, worker_id = null
  where music_sync_job.job_id = p_job_id and fence_token = p_fence_token;
  return query select true, 'APPLIED'::text, v_recording_id;
end;
$$;

create function public.music_rpc_finalize_mb_runs(p_worker_id uuid)
returns table(has_more boolean)
language plpgsql security definer set search_path = ''
as $$
begin
  if p_worker_id is null then
    raise exception using errcode = '22023', message = 'worker id required';
  end if;
  update public.music_schedule_run r
  set run_status = case when r.failure_count > 0 then 'partial' else 'completed' end,
      finished_at = now(), capacity_after_bytes = pg_catalog.pg_database_size(pg_catalog.current_database())
  where r.run_status = 'running'
    and not exists (
      select 1 from public.music_sync_job j
      where j.schedule_run_id = r.schedule_run_id
        and j.job_status in ('pending','processing','retry')
    );
  update public.music_collection_schedule s
    set claimed_until = null, claim_fence_token = null, claimed_by = null
  where exists (
    select 1 from public.music_schedule_run r
    where r.schedule_id = s.schedule_id and r.run_status <> 'running'
      and r.fence_token = s.claim_fence_token
  );
  return query select exists (
    select 1 from public.music_sync_job
    where job_kind in ('mb_discovery','mb_release_hydrate','mb_recording_hydrate')
      and job_status in ('pending','processing','retry')
  );
end;
$$;

alter function public.music_rpc_claim_mb_work(uuid, integer, integer) owner to nrm_music_rpc_owner;
alter function public.music_rpc_continue_discovery_job(uuid, uuid) owner to nrm_music_rpc_owner;
alter function public.music_rpc_finish_job(uuid, uuid, text, integer, integer, text, timestamptz)
  owner to nrm_music_rpc_owner;
alter function public.music_worker_upsert_artist(jsonb) owner to nrm_music_rpc_owner;
alter function public.music_worker_upsert_tags(text, uuid, jsonb, jsonb) owner to nrm_music_rpc_owner;
alter function public.music_rpc_apply_release_bundle_v2(uuid, uuid, jsonb) owner to nrm_music_rpc_owner;
alter function public.music_rpc_apply_recording_bundle(uuid, uuid, jsonb) owner to nrm_music_rpc_owner;
alter function public.music_rpc_finalize_mb_runs(uuid) owner to nrm_music_rpc_owner;
revoke create on schema public from nrm_music_rpc_owner;

grant select, insert, update, delete on table
  public.music_artist, public.music_artist_mbid, public.music_album, public.music_album_mbid,
  public.music_release, public.music_release_mbid, public.music_recording, public.music_recording_mbid,
  public.music_track, public.music_track_mbid, public.music_album_artist_credit,
  public.music_release_artist_credit, public.music_recording_artist_credit,
  public.music_track_artist_credit, public.music_genre, public.music_album_genre,
  public.music_release_genre, public.music_recording_genre, public.music_tag,
  public.music_album_mb_tag, public.music_release_mb_tag, public.music_recording_mb_tag,
  public.music_recording_isrc
to nrm_music_rpc_owner;
grant usage, select on sequence public.music_tag_tag_id_seq to nrm_music_rpc_owner;

grant execute on function public.music_worker_upsert_artist(jsonb) to nrm_music_rpc_owner;
grant execute on function public.music_worker_upsert_tags(text, uuid, jsonb, jsonb) to nrm_music_rpc_owner;
revoke all on function public.music_worker_upsert_artist(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.music_worker_upsert_tags(text, uuid, jsonb, jsonb) from public, anon, authenticated, service_role;

revoke all on function public.music_rpc_claim_mb_work(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.music_rpc_continue_discovery_job(uuid, uuid) from public, anon, authenticated;
revoke all on function public.music_rpc_apply_release_bundle_v2(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.music_rpc_apply_recording_bundle(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.music_rpc_finalize_mb_runs(uuid) from public, anon, authenticated;
grant execute on function public.music_rpc_claim_mb_work(uuid, integer, integer) to service_role;
grant execute on function public.music_rpc_continue_discovery_job(uuid, uuid) to service_role;
grant execute on function public.music_rpc_apply_release_bundle_v2(uuid, uuid, jsonb) to service_role;
grant execute on function public.music_rpc_apply_recording_bundle(uuid, uuid, jsonb) to service_role;
grant execute on function public.music_rpc_finalize_mb_runs(uuid) to service_role;

comment on function public.music_rpc_claim_mb_work(uuid, integer, integer)
  is 'MusicBrainz 단계별 job을 lease/fence와 필요한 최소 context로 claim';
comment on function public.music_rpc_apply_release_bundle_v2(uuid, uuid, jsonb)
  is '검증된 Release Group, 대표 Release, Track과 Recording shell을 원자 적용';
comment on function public.music_rpc_apply_recording_bundle(uuid, uuid, jsonb)
  is 'fixed-point Recording lookup 결과와 alias, credit, ISRC, tag, genre를 원자 적용';
