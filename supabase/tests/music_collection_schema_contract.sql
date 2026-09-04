-- Focused post-migration verification for 20260904132000.
-- Run against a disposable/local project after all migrations.

begin;

do $$
declare
  v_missing text[];
  v_owner text;
  v_delete boolean;
begin
  select array_agg(name order by name) into v_missing
  from unnest(array[
    'music_collection_schedule','music_artist_allowlist','music_schedule_artist',
    'music_schedule_run','music_discovery_scan','music_release_candidate',
    'music_api_limiter','music_capacity_policy','music_capacity_snapshot',
    'music_capacity_event','music_retention_policy','music_purge_batch',
    'music_purge_entity_tombstone','music_recording_purge_tombstone'
  ]) name
  where to_regclass('public.' || name) is null;
  if v_missing is not null then
    raise exception 'missing schema-contract tables: %', v_missing;
  end if;

  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'music_collection_schedule','music_artist_allowlist','music_schedule_artist',
        'music_schedule_run','music_discovery_scan','music_release_candidate',
        'music_api_limiter','music_capacity_policy','music_capacity_snapshot',
        'music_capacity_event','music_retention_policy','music_purge_batch',
        'music_purge_entity_tombstone','music_recording_purge_tombstone'
      )
      and not c.relrowsecurity
  ) then
    raise exception 'one or more schema-contract tables do not have RLS enabled';
  end if;

  select r.rolname into v_owner
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  join pg_roles r on r.oid = p.proowner
  where n.nspname = 'public' and p.proname = 'music_rpc_capacity_purge';
  if v_owner is distinct from 'nrm_music_rpc_owner' then
    raise exception 'purge RPC owner mismatch: %', v_owner;
  end if;

  select has_table_privilege('service_role', 'public.music_album', 'DELETE') into v_delete;
  if v_delete then
    raise exception 'service_role still has direct DELETE on music_album';
  end if;
  select has_table_privilege('service_role', 'public.music_recording_mbid', 'DELETE') into v_delete;
  if v_delete then
    raise exception 'service_role still has direct DELETE on music_recording_mbid';
  end if;

  if pg_get_functiondef('public.music_prevent_hard_delete()'::regprocedure)
       not like '%current_user = ''nrm_music_rpc_owner''%'
     or pg_get_functiondef('public.music_prevent_hard_delete()'::regprocedure)
       not like '%nrm.music_capacity_purge%' then
    raise exception 'hard-delete trigger does not contain both purge guards';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.music_album'::regclass
      and tgname = 'trg_music_album_prevent_delete' and not tgisinternal
  ) then
    raise exception 'existing album hard-delete trigger was removed';
  end if;
end
$$;

do $$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'public.music_rpc_claim_due_schedules(uuid,integer,integer)',
    'public.music_rpc_finish_schedule_run(uuid,uuid,text,jsonb)',
    'public.music_rpc_acquire_mb_permit(uuid,integer)',
    'public.music_rpc_claim_jobs(uuid,text,integer,integer)',
    'public.music_rpc_finish_job(uuid,uuid,text,integer,integer,text,timestamp with time zone)',
    'public.music_rpc_apply_discovery_page(uuid,uuid,integer,integer,integer,bytea,jsonb,boolean)',
    'public.music_rpc_apply_release_bundle(uuid,uuid,jsonb)',
    'public.music_rpc_capture_capacity(text)',
    'public.music_rpc_run_retention(integer)',
    'public.music_rpc_capacity_purge(integer,text,boolean)',
    'public.music_rpc_admin_schedule_upsert(text,uuid,jsonb)',
    'public.music_rpc_admin_overview(text,integer,integer)',
    'public.music_rpc_admin_allowlist_page(text,text,integer,integer)',
    'public.music_rpc_admin_dead_letter_page(text,boolean,integer,integer)',
    'public.music_rpc_admin_dead_letter_resolve(text,uuid,text)',
    'public.music_rpc_admin_dead_letter_retry(text,uuid,text)'
  ]
  loop
    if to_regprocedure(v_signature) is null then
      raise exception 'missing RPC signature: %', v_signature;
    end if;
  end loop;
end
$$;

do $$
declare p public.music_capacity_policy%rowtype;
begin
  select * into p from public.music_capacity_policy where policy_key = 'project1';
  if p.warning_bytes <> 449::bigint * 1024 * 1024
     or p.disable_discovery_bytes <> 450::bigint * 1024 * 1024
     or p.write_stop_bytes <> 499::bigint * 1024 * 1024
     or p.hard_limit_bytes <> 500::bigint * 1024 * 1024 then
    raise exception 'capacity threshold contract mismatch';
  end if;
  if (select minimum_interval_ms from public.music_api_limiter where limiter_key = 'musicbrainz') < 1100 then
    raise exception 'MusicBrainz limiter is below 1.1 seconds';
  end if;
end
$$;

-- Unknown payload keys must be rejected.
do $$
begin
  begin
    perform public.music_reject_unknown_keys('{"unexpected":true}'::jsonb, array['expected']);
    raise exception 'unknown-key guard unexpectedly accepted payload';
  exception when sqlstate '22023' then
    null;
  end;
end
$$;

rollback;
