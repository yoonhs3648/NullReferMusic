-- Last.fm 태그 upsert(선별 결과로 교체) + weekly 관리 RPC + 시드.

create or replace function public.music_rpc_apply_lastfm_tags(
  p_job_id uuid, p_fence_token uuid, p_payload jsonb
)
returns table(applied boolean, result_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.music_sync_job%rowtype;
  v_recording_id uuid;
  v_fetch_id uuid;
  v_attempt_id uuid;
  v_item jsonb;
  v_tag_id bigint;
  v_request_key text;
  v_eligible integer := 0;
begin
  perform public.music_reject_unknown_keys(p_payload, array[
    'recording_id','lookup_method','source_mbid','returned_mbid','returned_track_name',
    'returned_artist_name','received_tag_count','source_hash','match_status',
        'is_verified','tags','request_artist_name','request_track_name'
  ]);
  select * into v_job from public.music_sync_job where job_id = p_job_id for update;
  if not found or v_job.job_kind <> 'lastfm_tags'
     or v_job.job_status <> 'processing'
     or v_job.fence_token is distinct from p_fence_token
     or v_job.lease_until < now() then
    return query select false, 'FENCE_LOST'::text;
    return;
  end if;
  v_recording_id := coalesce(nullif(p_payload->>'recording_id','')::uuid, v_job.entity_id);
  if pg_catalog.jsonb_typeof(coalesce(p_payload->'tags','[]'::jsonb)) <> 'array'
     or pg_catalog.jsonb_array_length(coalesce(p_payload->'tags','[]'::jsonb)) > 20 then
    raise exception using errcode = '22023', message = 'invalid Last.fm tag payload';
  end if;
  v_request_key := pg_catalog.encode(extensions.digest(
    v_job.job_id::text || ':' || v_recording_id::text, 'sha256'
  ), 'hex');
  insert into public.lastfm_tag_fetch(recording_id, request_key, fetch_status, started_at, completed_at)
  values (v_recording_id, v_request_key, 'succeeded', now(), now())
  on conflict (request_key) do update
    set fetch_status = 'succeeded', completed_at = now()
  returning fetch_id into v_fetch_id;
  insert into public.lastfm_tag_fetch_attempt(
    fetch_id, attempt_no, candidate_kind, request_mbid, request_artist_name, request_track_name,
    result_status, returned_mbid, returned_track_name, returned_artist_name,
    tag_count, response_hash
  ) values (
    v_fetch_id, 1,
    coalesce(nullif(p_payload->>'lookup_method',''), 'canonical_mbid'),
    nullif(p_payload->>'source_mbid','')::uuid,
    case when coalesce(nullif(p_payload->>'lookup_method',''), 'canonical_mbid') = 'exact_name'
      then coalesce(nullif(p_payload->>'request_artist_name',''), nullif(p_payload->>'returned_artist_name','')) end,
    case when coalesce(nullif(p_payload->>'lookup_method',''), 'canonical_mbid') = 'exact_name'
      then coalesce(nullif(p_payload->>'request_track_name',''), nullif(p_payload->>'returned_track_name','')) end,
    case when coalesce((p_payload->>'received_tag_count')::integer, 0) = 0 then 'empty' else 'success' end,
    nullif(p_payload->>'returned_mbid','')::uuid,
    nullif(p_payload->>'returned_track_name',''),
    nullif(p_payload->>'returned_artist_name',''),
    coalesce((p_payload->>'received_tag_count')::integer, 0),
    case
      when coalesce(p_payload->>'source_hash','') ~ '^[0-9a-f]{64}$'
        then decode(p_payload->>'source_hash', 'hex')
      else null
    end
  )
  returning attempt_id into v_attempt_id;
  update public.lastfm_tag_fetch
  set selected_attempt_id = v_attempt_id
  where fetch_id = v_fetch_id;

  delete from public.lastfm_recording_tag where recording_id = v_recording_id;
  for v_item in
      select value from jsonb_array_elements(p_payload->'tags')
      order by (value->>'vector_rank')::integer
    loop
      perform public.music_reject_unknown_keys(v_item, array[
        'canonical_name','source_tag_name','weighted_count','normalized_weight',
        'vector_rank','category','embedding_enabled'
      ]);
      insert into public.music_tag(
        canonical_name, normalized_name, category, embedding_enabled
      ) values (
        v_item->>'canonical_name',
        lower(v_item->>'canonical_name'),
        coalesce(nullif(v_item->>'category',''), 'unknown'),
        coalesce((v_item->>'embedding_enabled')::boolean, true)
      )
      on conflict (normalized_name) do update set
        canonical_name = excluded.canonical_name
      returning tag_id into v_tag_id;
      insert into public.lastfm_recording_tag(
        recording_id, tag_id, fetch_id, source_mbid, source_tag_name,
        weighted_count, normalized_weight, vector_rank
      ) values (
        v_recording_id, v_tag_id, v_fetch_id,
        nullif(p_payload->>'source_mbid','')::uuid,
        v_item->>'source_tag_name',
        (v_item->>'weighted_count')::integer,
        (v_item->>'normalized_weight')::real,
        (v_item->>'vector_rank')::smallint
      );
      v_eligible := v_eligible + 1;
    end loop;

  insert into public.lastfm_recording_profile(
    recording_id, canonical_mbid_snapshot, active_source_mbid, lookup_method,
    match_status, is_verified, returned_mbid, returned_track_name, returned_artist_name,
    received_tag_count, persisted_tag_count, active_source_hash,
    last_attempt_at, last_success_at
  ) values (
    v_recording_id,
    (select canonical_mbid from public.music_recording where recording_id = v_recording_id),
    nullif(p_payload->>'source_mbid','')::uuid,
    coalesce(nullif(p_payload->>'lookup_method',''), 'canonical_mbid'),
    coalesce(nullif(p_payload->>'match_status',''), 'matched'),
    coalesce((p_payload->>'is_verified')::boolean, false),
    nullif(p_payload->>'returned_mbid','')::uuid,
    nullif(p_payload->>'returned_track_name',''),
    nullif(p_payload->>'returned_artist_name',''),
    coalesce((p_payload->>'received_tag_count')::integer, 0),
    v_eligible,
    case
      when coalesce(p_payload->>'source_hash','') ~ '^[0-9a-f]{64}$'
        then decode(p_payload->>'source_hash', 'hex')
      else null
    end,
    now(), now()
  )
  on conflict (recording_id) do update set
    lookup_method = excluded.lookup_method,
    match_status = excluded.match_status,
    is_verified = excluded.is_verified,
    returned_mbid = excluded.returned_mbid,
    returned_track_name = excluded.returned_track_name,
    returned_artist_name = excluded.returned_artist_name,
    received_tag_count = excluded.received_tag_count,
    persisted_tag_count = excluded.persisted_tag_count,
    active_source_hash = excluded.active_source_hash,
    last_attempt_at = now(),
    last_success_at = now(),
    updated_at = now();

  update public.music_recording
  set embedding_enabled = (v_eligible >= 3),
      lastfm_sync_enabled = true,
      row_version = row_version + 1
  where recording_id = v_recording_id;

  update public.music_sync_job
  set job_status = 'completed', completed_at = now(), lease_until = null, worker_id = null
  where job_id = p_job_id and fence_token = p_fence_token;
  return query select true, 'APPLIED'::text;
end;
$$;

