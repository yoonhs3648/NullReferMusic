-- Project 1 MusicBrainz/Last.fm relational ledger.
-- SSOT: docs/supabase-tables/musicbrainz-lastfm-vector.md sections 5.1-5.6, 5.8.
-- Deliberately excludes section 5.7, project 2, vector, embedding RPCs, and worker RPCs.

create extension if not exists pgcrypto with schema extensions;

create function public.music_set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create function public.music_prevent_hard_delete()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using
    errcode = '23503',
    message = format('hard delete is forbidden for authoritative ledger table %I.%I', tg_table_schema, tg_table_name);
end;
$$;

create table public.music_artist (
  artist_id uuid not null default extensions.gen_random_uuid(),
  canonical_mbid uuid,
  name text not null,
  sort_name text,
  disambiguation text,
  artist_type text,
  gender text,
  country_code text,
  area_name text,
  begin_date_text text,
  end_date_text text,
  ended boolean,
  entity_status text not null default 'active',
  merged_into_artist_id uuid,
  last_mb_verified_at timestamptz,
  row_version bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pk_music_artist primary key (artist_id),
  constraint ck_music_artist_name check (btrim(name) <> ''),
  constraint ck_music_artist_begin_date check (begin_date_text is null or begin_date_text ~ '^[0-9]{4}(-[0-9]{2}(-[0-9]{2})?)?$'),
  constraint ck_music_artist_end_date check (end_date_text is null or end_date_text ~ '^[0-9]{4}(-[0-9]{2}(-[0-9]{2})?)?$'),
  constraint ck_music_artist_status check (entity_status in ('active','merged','deleted','quarantined')),
  constraint ck_music_artist_merge_state check (
    (entity_status = 'active' and merged_into_artist_id is null)
    or (entity_status = 'merged' and merged_into_artist_id is not null)
    or entity_status in ('deleted','quarantined')
  ),
  constraint ck_music_artist_not_self_merged check (merged_into_artist_id is null or merged_into_artist_id <> artist_id),
  constraint ck_music_artist_row_version check (row_version >= 0),
  constraint fk_music_artist_merged_into foreign key (merged_into_artist_id)
    references public.music_artist(artist_id) on delete restrict deferrable initially deferred
);

create table public.music_album (
  album_id uuid not null default extensions.gen_random_uuid(),
  canonical_mbid uuid,
  title text not null,
  disambiguation text,
  primary_type text,
  secondary_types text[] not null default '{}',
  artist_credit_name text not null,
  primary_artist_id uuid,
  first_release_date_text text,
  entity_status text not null default 'active',
  merged_into_album_id uuid,
  last_mb_verified_at timestamptz,
  row_version bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pk_music_album primary key (album_id),
  constraint ck_music_album_title check (btrim(title) <> ''),
  constraint ck_music_album_artist_credit_name check (btrim(artist_credit_name) <> ''),
  constraint ck_music_album_release_date check (first_release_date_text is null or first_release_date_text ~ '^[0-9]{4}(-[0-9]{2}(-[0-9]{2})?)?$'),
  constraint ck_music_album_status check (entity_status in ('active','merged','deleted','quarantined')),
  constraint ck_music_album_merge_state check (
    (entity_status = 'active' and merged_into_album_id is null)
    or (entity_status = 'merged' and merged_into_album_id is not null)
    or entity_status in ('deleted','quarantined')
  ),
  constraint ck_music_album_not_self_merged check (merged_into_album_id is null or merged_into_album_id <> album_id),
  constraint ck_music_album_row_version check (row_version >= 0),
  constraint fk_music_album_primary_artist foreign key (primary_artist_id)
    references public.music_artist(artist_id) on delete restrict,
  constraint fk_music_album_merged_into foreign key (merged_into_album_id)
    references public.music_album(album_id) on delete restrict deferrable initially deferred
);

create table public.music_release (
  release_id uuid not null default extensions.gen_random_uuid(),
  album_id uuid not null,
  canonical_mbid uuid,
  title text not null,
  artist_credit_name text not null,
  status text,
  quality text,
  packaging text,
  country_code text,
  release_date_text text,
  barcode text,
  text_language text,
  text_script text,
  track_count integer not null default 0,
  medium_count smallint not null default 0,
  is_representative boolean not null default true,
  selection_score integer not null default 0,
  selected_at timestamptz not null default now(),
  retired_at timestamptz,
  entity_status text not null default 'active',
  merged_into_release_id uuid,
  row_version bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pk_music_release primary key (release_id),
  constraint ux_music_release_id_album unique (release_id, album_id),
  constraint ck_music_release_title check (btrim(title) <> ''),
  constraint ck_music_release_artist_credit_name check (btrim(artist_credit_name) <> ''),
  constraint ck_music_release_date check (release_date_text is null or release_date_text ~ '^[0-9]{4}(-[0-9]{2}(-[0-9]{2})?)?$'),
  constraint ck_music_release_counts check (track_count >= 0 and medium_count >= 0),
  constraint ck_music_release_representative_retired check (
    (is_representative and retired_at is null) or (not is_representative and retired_at is not null)
  ),
  constraint ck_music_release_status check (entity_status in ('active','merged','deleted','quarantined')),
  constraint ck_music_release_merge_state check (
    (entity_status = 'active' and merged_into_release_id is null)
    or (entity_status = 'merged' and merged_into_release_id is not null)
    or entity_status in ('deleted','quarantined')
  ),
  constraint ck_music_release_not_self_merged check (merged_into_release_id is null or merged_into_release_id <> release_id),
  constraint ck_music_release_row_version check (row_version >= 0),
  constraint fk_music_release_album foreign key (album_id)
    references public.music_album(album_id) on delete restrict,
  constraint fk_music_release_merged_into foreign key (merged_into_release_id)
    references public.music_release(release_id) on delete restrict deferrable initially deferred
);

create table public.music_recording (
  recording_id uuid not null default extensions.gen_random_uuid(),
  canonical_mbid uuid,
  title text not null,
  disambiguation text,
  artist_credit_name text not null,
  primary_artist_id uuid,
  length_ms integer,
  is_video boolean not null default false,
  first_release_date_text text,
  entity_status text not null default 'active',
  merged_into_recording_id uuid,
  lastfm_sync_enabled boolean not null default true,
  embedding_enabled boolean not null default true,
  last_mb_verified_at timestamptz,
  resolution_version bigint not null default 0,
  row_version bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pk_music_recording primary key (recording_id),
  constraint ck_music_recording_title check (btrim(title) <> ''),
  constraint ck_music_recording_artist_credit_name check (btrim(artist_credit_name) <> ''),
  constraint ck_music_recording_length check (length_ms is null or length_ms >= 0),
  constraint ck_music_recording_release_date check (first_release_date_text is null or first_release_date_text ~ '^[0-9]{4}(-[0-9]{2}(-[0-9]{2})?)?$'),
  constraint ck_music_recording_status check (entity_status in ('active','merged','deleted','quarantined')),
  constraint ck_music_recording_merge_state check (
    (entity_status = 'active' and merged_into_recording_id is null)
    or (entity_status = 'merged' and merged_into_recording_id is not null)
    or entity_status in ('deleted','quarantined')
  ),
  constraint ck_music_recording_not_self_merged check (merged_into_recording_id is null or merged_into_recording_id <> recording_id),
  constraint ck_music_recording_versions check (resolution_version >= 0 and row_version >= 0),
  constraint fk_music_recording_primary_artist foreign key (primary_artist_id)
    references public.music_artist(artist_id) on delete restrict,
  constraint fk_music_recording_merged_into foreign key (merged_into_recording_id)
    references public.music_recording(recording_id) on delete restrict deferrable initially deferred
);

create table public.music_track (
  track_id uuid not null default extensions.gen_random_uuid(),
  release_id uuid not null,
  album_id uuid not null,
  recording_id uuid,
  canonical_mbid uuid,
  source_recording_mbid uuid,
  medium_position smallint not null,
  medium_title text,
  medium_format text,
  track_position integer not null,
  track_number text not null,
  title text not null,
  length_ms integer,
  artist_credit_name text not null,
  entity_status text not null default 'active',
  merged_into_track_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pk_music_track primary key (track_id),
  constraint ux_music_track_release_position unique (release_id, medium_position, track_position),
  constraint ck_music_track_positions check (medium_position > 0 and track_position > 0),
  constraint ck_music_track_number check (btrim(track_number) <> ''),
  constraint ck_music_track_title check (btrim(title) <> ''),
  constraint ck_music_track_artist_credit_name check (btrim(artist_credit_name) <> ''),
  constraint ck_music_track_length check (length_ms is null or length_ms >= 0),
  constraint ck_music_track_status check (entity_status in ('active','merged','deleted','quarantined')),
  constraint ck_music_track_merge_state check (
    (entity_status = 'active' and merged_into_track_id is null)
    or (entity_status = 'merged' and merged_into_track_id is not null)
    or entity_status in ('deleted','quarantined')
  ),
  constraint ck_music_track_not_self_merged check (merged_into_track_id is null or merged_into_track_id <> track_id),
  constraint fk_music_track_release_album foreign key (release_id, album_id)
    references public.music_release(release_id, album_id) on delete restrict,
  constraint fk_music_track_recording foreign key (recording_id)
    references public.music_recording(recording_id) on delete restrict,
  constraint fk_music_track_merged_into foreign key (merged_into_track_id)
    references public.music_track(track_id) on delete restrict deferrable initially deferred
);

-- MBID alias ledgers. The canonical UUID on each entity is only a validated cache.
create table public.music_artist_mbid (
  mbid uuid not null,
  artist_id uuid not null,
  identifier_status text not null default 'unresolved',
  is_canonical boolean not null default false,
  redirect_target_mbid uuid,
  resolved_mbid uuid,
  resolution_generation bigint not null default 0,
  first_seen_at timestamptz not null default now(),
  last_checked_at timestamptz,
  redirect_detected_at timestamptz,
  deleted_detected_at timestamptz,
  consecutive_not_found smallint not null default 0,
  last_http_status integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pk_music_artist_mbid primary key (mbid),
  constraint fk_music_artist_mbid_entity foreign key (artist_id) references public.music_artist(artist_id) on delete restrict,
  constraint fk_music_artist_mbid_redirect foreign key (redirect_target_mbid) references public.music_artist_mbid(mbid) on delete restrict deferrable initially deferred,
  constraint fk_music_artist_mbid_resolved foreign key (resolved_mbid) references public.music_artist_mbid(mbid) on delete restrict deferrable initially deferred,
  constraint ck_music_artist_mbid_status check (identifier_status in ('current','redirected','unresolved','deleted','invalid','quarantined')),
  constraint ck_music_artist_mbid_counts check (resolution_generation >= 0 and consecutive_not_found >= 0),
  constraint ck_music_artist_mbid_not_self_redirect check (redirect_target_mbid is null or redirect_target_mbid <> mbid),
  constraint ck_music_artist_mbid_state check (
    (identifier_status = 'current' and redirect_target_mbid is null and resolved_mbid = mbid)
    or (identifier_status = 'redirected' and is_canonical = false and redirect_target_mbid is not null and resolved_mbid is not null)
    or (identifier_status in ('unresolved','deleted','invalid','quarantined') and is_canonical = false)
  ),
  constraint ck_music_artist_mbid_canonical_current check (not is_canonical or identifier_status = 'current')
);

create table public.music_album_mbid (like public.music_artist_mbid including defaults);
alter table public.music_album_mbid rename column artist_id to album_id;
alter table public.music_album_mbid
  add constraint pk_music_album_mbid primary key (mbid),
  add constraint fk_music_album_mbid_entity foreign key (album_id) references public.music_album(album_id) on delete restrict,
  add constraint fk_music_album_mbid_redirect foreign key (redirect_target_mbid) references public.music_album_mbid(mbid) on delete restrict deferrable initially deferred,
  add constraint fk_music_album_mbid_resolved foreign key (resolved_mbid) references public.music_album_mbid(mbid) on delete restrict deferrable initially deferred,
  add constraint ck_music_album_mbid_status check (identifier_status in ('current','redirected','unresolved','deleted','invalid','quarantined')),
  add constraint ck_music_album_mbid_counts check (resolution_generation >= 0 and consecutive_not_found >= 0),
  add constraint ck_music_album_mbid_not_self_redirect check (redirect_target_mbid is null or redirect_target_mbid <> mbid),
  add constraint ck_music_album_mbid_state check (
    (identifier_status = 'current' and redirect_target_mbid is null and resolved_mbid = mbid)
    or (identifier_status = 'redirected' and not is_canonical and redirect_target_mbid is not null and resolved_mbid is not null)
    or (identifier_status in ('unresolved','deleted','invalid','quarantined') and not is_canonical)
  ),
  add constraint ck_music_album_mbid_canonical_current check (not is_canonical or identifier_status = 'current');

create table public.music_release_mbid (like public.music_artist_mbid including defaults);
alter table public.music_release_mbid rename column artist_id to release_id;
alter table public.music_release_mbid
  add constraint pk_music_release_mbid primary key (mbid),
  add constraint fk_music_release_mbid_entity foreign key (release_id) references public.music_release(release_id) on delete restrict,
  add constraint fk_music_release_mbid_redirect foreign key (redirect_target_mbid) references public.music_release_mbid(mbid) on delete restrict deferrable initially deferred,
  add constraint fk_music_release_mbid_resolved foreign key (resolved_mbid) references public.music_release_mbid(mbid) on delete restrict deferrable initially deferred,
  add constraint ck_music_release_mbid_status check (identifier_status in ('current','redirected','unresolved','deleted','invalid','quarantined')),
  add constraint ck_music_release_mbid_counts check (resolution_generation >= 0 and consecutive_not_found >= 0),
  add constraint ck_music_release_mbid_not_self_redirect check (redirect_target_mbid is null or redirect_target_mbid <> mbid),
  add constraint ck_music_release_mbid_state check (
    (identifier_status = 'current' and redirect_target_mbid is null and resolved_mbid = mbid)
    or (identifier_status = 'redirected' and not is_canonical and redirect_target_mbid is not null and resolved_mbid is not null)
    or (identifier_status in ('unresolved','deleted','invalid','quarantined') and not is_canonical)
  ),
  add constraint ck_music_release_mbid_canonical_current check (not is_canonical or identifier_status = 'current');

create table public.music_recording_mbid (like public.music_artist_mbid including defaults);
alter table public.music_recording_mbid rename column artist_id to recording_id;
alter table public.music_recording_mbid
  add constraint pk_music_recording_mbid primary key (mbid),
  add constraint fk_music_recording_mbid_entity foreign key (recording_id) references public.music_recording(recording_id) on delete restrict,
  add constraint fk_music_recording_mbid_redirect foreign key (redirect_target_mbid) references public.music_recording_mbid(mbid) on delete restrict deferrable initially deferred,
  add constraint fk_music_recording_mbid_resolved foreign key (resolved_mbid) references public.music_recording_mbid(mbid) on delete restrict deferrable initially deferred,
  add constraint ck_music_recording_mbid_status check (identifier_status in ('current','redirected','unresolved','deleted','invalid','quarantined')),
  add constraint ck_music_recording_mbid_counts check (resolution_generation >= 0 and consecutive_not_found >= 0),
  add constraint ck_music_recording_mbid_not_self_redirect check (redirect_target_mbid is null or redirect_target_mbid <> mbid),
  add constraint ck_music_recording_mbid_state check (
    (identifier_status = 'current' and redirect_target_mbid is null and resolved_mbid = mbid)
    or (identifier_status = 'redirected' and not is_canonical and redirect_target_mbid is not null and resolved_mbid is not null)
    or (identifier_status in ('unresolved','deleted','invalid','quarantined') and not is_canonical)
  ),
  add constraint ck_music_recording_mbid_canonical_current check (not is_canonical or identifier_status = 'current');

create table public.music_track_mbid (like public.music_artist_mbid including defaults);
alter table public.music_track_mbid rename column artist_id to track_id;
alter table public.music_track_mbid
  add constraint pk_music_track_mbid primary key (mbid),
  add constraint fk_music_track_mbid_entity foreign key (track_id) references public.music_track(track_id) on delete restrict,
  add constraint fk_music_track_mbid_redirect foreign key (redirect_target_mbid) references public.music_track_mbid(mbid) on delete restrict deferrable initially deferred,
  add constraint fk_music_track_mbid_resolved foreign key (resolved_mbid) references public.music_track_mbid(mbid) on delete restrict deferrable initially deferred,
  add constraint ck_music_track_mbid_status check (identifier_status in ('current','redirected','unresolved','deleted','invalid','quarantined')),
  add constraint ck_music_track_mbid_counts check (resolution_generation >= 0 and consecutive_not_found >= 0),
  add constraint ck_music_track_mbid_not_self_redirect check (redirect_target_mbid is null or redirect_target_mbid <> mbid),
  add constraint ck_music_track_mbid_state check (
    (identifier_status = 'current' and redirect_target_mbid is null and resolved_mbid = mbid)
    or (identifier_status = 'redirected' and not is_canonical and redirect_target_mbid is not null and resolved_mbid is not null)
    or (identifier_status in ('unresolved','deleted','invalid','quarantined') and not is_canonical)
  ),
  add constraint ck_music_track_mbid_canonical_current check (not is_canonical or identifier_status = 'current');

create table public.music_recording_redirect (
  old_recording_id uuid not null,
  new_recording_id uuid not null,
  reason text not null,
  canonical_mbid uuid,
  merge_generation bigint not null,
  merged_at timestamptz not null default now(),
  constraint pk_music_recording_redirect primary key (old_recording_id),
  constraint fk_music_recording_redirect_old foreign key (old_recording_id) references public.music_recording(recording_id) on delete restrict,
  constraint fk_music_recording_redirect_new foreign key (new_recording_id) references public.music_recording(recording_id) on delete restrict,
  constraint ck_music_recording_redirect_distinct check (old_recording_id <> new_recording_id),
  constraint ck_music_recording_redirect_generation check (merge_generation > 0),
  constraint ck_music_recording_redirect_reason check (btrim(reason) <> '')
);

create table public.music_recording_duplicate_candidate (
  candidate_id uuid not null default extensions.gen_random_uuid(),
  recording_id_low uuid not null,
  recording_id_high uuid not null,
  match_score real not null,
  same_isrc boolean not null default false,
  same_acoustid boolean not null default false,
  same_artist boolean not null default false,
  normalized_title_match boolean not null default false,
  length_difference_ms integer,
  evidence jsonb not null default '{}'::jsonb,
  candidate_status text not null default 'pending',
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pk_music_recording_duplicate_candidate primary key (candidate_id),
  constraint ux_music_recording_duplicate_pair unique (recording_id_low, recording_id_high),
  constraint fk_music_recording_duplicate_low foreign key (recording_id_low) references public.music_recording(recording_id) on delete restrict,
  constraint fk_music_recording_duplicate_high foreign key (recording_id_high) references public.music_recording(recording_id) on delete restrict,
  constraint ck_music_recording_duplicate_order check (recording_id_low < recording_id_high),
  constraint ck_music_recording_duplicate_score check (match_score between 0 and 1),
  constraint ck_music_recording_duplicate_length check (length_difference_ms is null or length_difference_ms >= 0),
  constraint ck_music_recording_duplicate_status check (candidate_status in ('pending','confirmed','rejected','mb_merged'))
);

create table public.music_mbid_resolution_observation (
  observation_id uuid not null default extensions.gen_random_uuid(),
  idempotency_key text not null,
  entity_type text not null,
  requested_mbid uuid not null,
  returned_mbid uuid,
  final_url text,
  http_status integer,
  response_hash bytea,
  result_kind text not null,
  observed_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint pk_music_mbid_resolution_observation primary key (observation_id),
  constraint ux_music_mbid_resolution_observation_key unique (idempotency_key),
  constraint ck_music_mbid_resolution_observation_key check (btrim(idempotency_key) <> ''),
  constraint ck_music_mbid_resolution_observation_entity check (entity_type in ('artist','album','release','recording','track')),
  constraint ck_music_mbid_resolution_observation_result check (result_kind in ('stable','redirect','not_found','invalid','transient_error','schema_error')),
  constraint ck_music_mbid_resolution_observation_hash check (response_hash is null or octet_length(response_hash) = 32)
);

create table public.music_entity_merge_audit (
  merge_id uuid not null default extensions.gen_random_uuid(),
  entity_type text not null,
  loser_entity_id uuid not null,
  survivor_entity_id uuid not null,
  reason text not null,
  canonical_mbid uuid,
  evidence jsonb not null default '{}'::jsonb,
  merge_generation bigint not null,
  merged_at timestamptz not null default now(),
  merged_by uuid,
  constraint pk_music_entity_merge_audit primary key (merge_id),
  constraint ux_music_entity_merge_audit_loser unique (entity_type, loser_entity_id),
  constraint ck_music_entity_merge_audit_entity check (entity_type in ('artist','album','release','recording','track')),
  constraint ck_music_entity_merge_audit_distinct check (loser_entity_id <> survivor_entity_id),
  constraint ck_music_entity_merge_audit_generation check (merge_generation > 0),
  constraint ck_music_entity_merge_audit_reason check (btrim(reason) <> '')
);

-- Ordered artist credits.
create table public.music_album_artist_credit (
  album_id uuid not null, position smallint not null, artist_id uuid not null,
  credited_name text not null, join_phrase text not null default '',
  constraint pk_music_album_artist_credit primary key (album_id, position),
  constraint fk_music_album_artist_credit_parent foreign key (album_id) references public.music_album(album_id) on delete cascade,
  constraint fk_music_album_artist_credit_artist foreign key (artist_id) references public.music_artist(artist_id) on delete restrict,
  constraint ck_music_album_artist_credit_position check (position >= 0),
  constraint ck_music_album_artist_credit_name check (btrim(credited_name) <> '')
);
create table public.music_release_artist_credit (
  release_id uuid not null, position smallint not null, artist_id uuid not null,
  credited_name text not null, join_phrase text not null default '',
  constraint pk_music_release_artist_credit primary key (release_id, position),
  constraint fk_music_release_artist_credit_parent foreign key (release_id) references public.music_release(release_id) on delete cascade,
  constraint fk_music_release_artist_credit_artist foreign key (artist_id) references public.music_artist(artist_id) on delete restrict,
  constraint ck_music_release_artist_credit_position check (position >= 0),
  constraint ck_music_release_artist_credit_name check (btrim(credited_name) <> '')
);
create table public.music_recording_artist_credit (
  recording_id uuid not null, position smallint not null, artist_id uuid not null,
  credited_name text not null, join_phrase text not null default '',
  constraint pk_music_recording_artist_credit primary key (recording_id, position),
  constraint fk_music_recording_artist_credit_parent foreign key (recording_id) references public.music_recording(recording_id) on delete cascade,
  constraint fk_music_recording_artist_credit_artist foreign key (artist_id) references public.music_artist(artist_id) on delete restrict,
  constraint ck_music_recording_artist_credit_position check (position >= 0),
  constraint ck_music_recording_artist_credit_name check (btrim(credited_name) <> '')
);
create table public.music_track_artist_credit (
  track_id uuid not null, position smallint not null, artist_id uuid not null,
  credited_name text not null, join_phrase text not null default '',
  constraint pk_music_track_artist_credit primary key (track_id, position),
  constraint fk_music_track_artist_credit_parent foreign key (track_id) references public.music_track(track_id) on delete cascade,
  constraint fk_music_track_artist_credit_artist foreign key (artist_id) references public.music_artist(artist_id) on delete restrict,
  constraint ck_music_track_artist_credit_position check (position >= 0),
  constraint ck_music_track_artist_credit_name check (btrim(credited_name) <> '')
);

create table public.music_genre (
  genre_mbid uuid not null,
  name text not null,
  normalized_name text not null,
  disambiguation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pk_music_genre primary key (genre_mbid),
  constraint ux_music_genre_normalized_name unique (normalized_name),
  constraint ck_music_genre_name check (btrim(name) <> '' and btrim(normalized_name) <> '')
);

create table public.music_artist_genre (
  artist_id uuid not null, genre_mbid uuid not null, vote_count integer not null default 0, synced_at timestamptz not null default now(),
  constraint pk_music_artist_genre primary key (artist_id, genre_mbid),
  constraint fk_music_artist_genre_parent foreign key (artist_id) references public.music_artist(artist_id) on delete cascade,
  constraint fk_music_artist_genre_genre foreign key (genre_mbid) references public.music_genre(genre_mbid) on delete restrict,
  constraint ck_music_artist_genre_votes check (vote_count >= 0)
);
create table public.music_album_genre (
  album_id uuid not null, genre_mbid uuid not null, vote_count integer not null default 0, synced_at timestamptz not null default now(),
  constraint pk_music_album_genre primary key (album_id, genre_mbid),
  constraint fk_music_album_genre_parent foreign key (album_id) references public.music_album(album_id) on delete cascade,
  constraint fk_music_album_genre_genre foreign key (genre_mbid) references public.music_genre(genre_mbid) on delete restrict,
  constraint ck_music_album_genre_votes check (vote_count >= 0)
);
create table public.music_release_genre (
  release_id uuid not null, genre_mbid uuid not null, vote_count integer not null default 0, synced_at timestamptz not null default now(),
  constraint pk_music_release_genre primary key (release_id, genre_mbid),
  constraint fk_music_release_genre_parent foreign key (release_id) references public.music_release(release_id) on delete cascade,
  constraint fk_music_release_genre_genre foreign key (genre_mbid) references public.music_genre(genre_mbid) on delete restrict,
  constraint ck_music_release_genre_votes check (vote_count >= 0)
);
create table public.music_recording_genre (
  recording_id uuid not null, genre_mbid uuid not null, vote_count integer not null default 0, synced_at timestamptz not null default now(),
  constraint pk_music_recording_genre primary key (recording_id, genre_mbid),
  constraint fk_music_recording_genre_parent foreign key (recording_id) references public.music_recording(recording_id) on delete cascade,
  constraint fk_music_recording_genre_genre foreign key (genre_mbid) references public.music_genre(genre_mbid) on delete restrict,
  constraint ck_music_recording_genre_votes check (vote_count >= 0)
);

create table public.music_tag (
  tag_id bigint generated by default as identity,
  canonical_name text not null,
  normalized_name text not null,
  category text not null default 'unknown',
  embedding_enabled boolean not null default true,
  embedding_weight real not null default 1,
  is_reviewed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pk_music_tag primary key (tag_id),
  constraint ux_music_tag_normalized_name unique (normalized_name),
  constraint ck_music_tag_names check (btrim(canonical_name) <> '' and btrim(normalized_name) <> ''),
  constraint ck_music_tag_category check (category in ('genre','style','mood','theme','era','instrument','language','region','context','personal','noise','unknown')),
  constraint ck_music_tag_weight check (embedding_weight >= 0)
);

create table public.music_tag_alias (
  tag_alias_id bigint generated by default as identity,
  source text not null,
  alias_name text not null,
  normalized_alias text not null,
  tag_id bigint not null,
  created_at timestamptz not null default now(),
  constraint pk_music_tag_alias primary key (tag_alias_id),
  constraint ux_music_tag_alias_source_normalized unique (source, normalized_alias),
  constraint fk_music_tag_alias_tag foreign key (tag_id) references public.music_tag(tag_id) on delete restrict,
  constraint ck_music_tag_alias_source check (source in ('musicbrainz','lastfm','admin')),
  constraint ck_music_tag_alias_names check (btrim(alias_name) <> '' and btrim(normalized_alias) <> '')
);

create table public.music_artist_mb_tag (
  artist_id uuid not null, tag_id bigint not null, source_tag_name text not null, vote_count integer not null default 0, synced_at timestamptz not null default now(),
  constraint pk_music_artist_mb_tag primary key (artist_id, tag_id),
  constraint fk_music_artist_mb_tag_parent foreign key (artist_id) references public.music_artist(artist_id) on delete cascade,
  constraint fk_music_artist_mb_tag_tag foreign key (tag_id) references public.music_tag(tag_id) on delete restrict,
  constraint ck_music_artist_mb_tag_name check (btrim(source_tag_name) <> ''),
  constraint ck_music_artist_mb_tag_votes check (vote_count >= 0)
);
create table public.music_album_mb_tag (
  album_id uuid not null, tag_id bigint not null, source_tag_name text not null, vote_count integer not null default 0, synced_at timestamptz not null default now(),
  constraint pk_music_album_mb_tag primary key (album_id, tag_id),
  constraint fk_music_album_mb_tag_parent foreign key (album_id) references public.music_album(album_id) on delete cascade,
  constraint fk_music_album_mb_tag_tag foreign key (tag_id) references public.music_tag(tag_id) on delete restrict,
  constraint ck_music_album_mb_tag_name check (btrim(source_tag_name) <> ''),
  constraint ck_music_album_mb_tag_votes check (vote_count >= 0)
);
create table public.music_release_mb_tag (
  release_id uuid not null, tag_id bigint not null, source_tag_name text not null, vote_count integer not null default 0, synced_at timestamptz not null default now(),
  constraint pk_music_release_mb_tag primary key (release_id, tag_id),
  constraint fk_music_release_mb_tag_parent foreign key (release_id) references public.music_release(release_id) on delete cascade,
  constraint fk_music_release_mb_tag_tag foreign key (tag_id) references public.music_tag(tag_id) on delete restrict,
  constraint ck_music_release_mb_tag_name check (btrim(source_tag_name) <> ''),
  constraint ck_music_release_mb_tag_votes check (vote_count >= 0)
);
create table public.music_recording_mb_tag (
  recording_id uuid not null, tag_id bigint not null, source_tag_name text not null, vote_count integer not null default 0, synced_at timestamptz not null default now(),
  constraint pk_music_recording_mb_tag primary key (recording_id, tag_id),
  constraint fk_music_recording_mb_tag_parent foreign key (recording_id) references public.music_recording(recording_id) on delete cascade,
  constraint fk_music_recording_mb_tag_tag foreign key (tag_id) references public.music_tag(tag_id) on delete restrict,
  constraint ck_music_recording_mb_tag_name check (btrim(source_tag_name) <> ''),
  constraint ck_music_recording_mb_tag_votes check (vote_count >= 0)
);

create table public.music_recording_isrc (
  recording_id uuid not null,
  isrc text not null,
  created_at timestamptz not null default now(),
  constraint pk_music_recording_isrc primary key (recording_id, isrc),
  constraint fk_music_recording_isrc_recording foreign key (recording_id) references public.music_recording(recording_id) on delete cascade,
  constraint ck_music_recording_isrc_format check (isrc ~ '^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$')
);

create table public.lastfm_recording_profile (
  recording_id uuid not null,
  canonical_mbid_snapshot uuid,
  active_source_mbid uuid,
  previous_success_mbid uuid,
  lookup_method text,
  match_status text not null default 'pending',
  is_verified boolean not null default false,
  returned_mbid uuid,
  returned_track_name text,
  returned_artist_name text,
  received_tag_count integer not null default 0,
  persisted_tag_count smallint not null default 0,
  active_source_hash bytea,
  active_input_hash bytea,
  canonical_lookup_failed boolean not null default false,
  is_stale boolean not null default false,
  consecutive_empty_cycles smallint not null default 0,
  consecutive_ineligible_cycles smallint not null default 0,
  stale_grace_until timestamptz,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  next_sync_at timestamptz,
  last_error_code integer,
  last_error_message text,
  row_version bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pk_lastfm_recording_profile primary key (recording_id),
  constraint fk_lastfm_recording_profile_recording foreign key (recording_id) references public.music_recording(recording_id) on delete restrict,
  constraint ck_lastfm_recording_profile_lookup check (lookup_method is null or lookup_method in ('canonical_mbid','previous_mbid','alias_mbid','exact_name','autocorrect_name')),
  constraint ck_lastfm_recording_profile_status check (match_status in ('pending','matched','no_data','ambiguous','retry','blocked','quarantined')),
  constraint ck_lastfm_recording_profile_counts check (
    received_tag_count >= persisted_tag_count and persisted_tag_count between 0 and 20
    and consecutive_empty_cycles >= 0 and consecutive_ineligible_cycles >= 0 and row_version >= 0
  ),
  constraint ck_lastfm_recording_profile_source_hash check (active_source_hash is null or octet_length(active_source_hash) = 32),
  constraint ck_lastfm_recording_profile_input_hash check (active_input_hash is null or octet_length(active_input_hash) = 32)
);

create table public.lastfm_tag_fetch (
  fetch_id uuid not null default extensions.gen_random_uuid(),
  recording_id uuid not null,
  request_key text not null,
  fetch_status text not null default 'pending',
  selected_attempt_id uuid,
  started_at timestamptz,
  completed_at timestamptz,
  retry_at timestamptz,
  lease_until timestamptz,
  fence_token uuid,
  last_error_code integer,
  last_error_message text,
  created_at timestamptz not null default now(),
  constraint pk_lastfm_tag_fetch primary key (fetch_id),
  constraint ux_lastfm_tag_fetch_request_key unique (request_key),
  constraint ux_lastfm_tag_fetch_id_recording unique (fetch_id, recording_id),
  constraint fk_lastfm_tag_fetch_recording foreign key (recording_id) references public.music_recording(recording_id) on delete restrict,
  constraint ck_lastfm_tag_fetch_request_key check (request_key ~ '^[0-9a-f]{64}$'),
  constraint ck_lastfm_tag_fetch_status check (fetch_status in ('pending','running','succeeded','empty','retry','blocked','quarantined','failed'))
);

create table public.lastfm_tag_fetch_attempt (
  attempt_id uuid not null default extensions.gen_random_uuid(),
  fetch_id uuid not null,
  attempt_no smallint not null,
  candidate_kind text not null,
  request_mbid uuid,
  request_artist_name text,
  request_track_name text,
  result_status text not null,
  returned_mbid uuid,
  returned_track_name text,
  returned_artist_name text,
  tag_count integer not null default 0,
  response_hash bytea,
  http_status integer,
  api_error_code integer,
  error_message text,
  fetched_at timestamptz not null default now(),
  constraint pk_lastfm_tag_fetch_attempt primary key (attempt_id),
  constraint ux_lastfm_tag_fetch_attempt_no unique (fetch_id, attempt_no),
  constraint ux_lastfm_tag_fetch_attempt_owner unique (fetch_id, attempt_id),
  constraint fk_lastfm_tag_fetch_attempt_fetch foreign key (fetch_id) references public.lastfm_tag_fetch(fetch_id) on delete cascade,
  constraint ck_lastfm_tag_fetch_attempt_no check (attempt_no > 0),
  constraint ck_lastfm_tag_fetch_attempt_tag_count check (tag_count >= 0),
  constraint ck_lastfm_tag_fetch_attempt_candidate check (candidate_kind in ('canonical_mbid','previous_mbid','alias_mbid','exact_name','autocorrect_name')),
  constraint ck_lastfm_tag_fetch_attempt_result check (result_status in ('success','empty','no_data','ambiguous','transient_error','permanent_error','blocked')),
  constraint ck_lastfm_tag_fetch_attempt_identity check (
    (candidate_kind in ('canonical_mbid','previous_mbid','alias_mbid') and request_mbid is not null and request_artist_name is null and request_track_name is null)
    or (candidate_kind in ('exact_name','autocorrect_name') and request_mbid is null
        and request_artist_name is not null and btrim(request_artist_name) <> ''
        and request_track_name is not null and btrim(request_track_name) <> '')
  ),
  constraint ck_lastfm_tag_fetch_attempt_hash check (response_hash is null or octet_length(response_hash) = 32)
);
alter table public.lastfm_tag_fetch
  add constraint fk_lastfm_tag_fetch_selected_attempt
  foreign key (fetch_id, selected_attempt_id)
  references public.lastfm_tag_fetch_attempt(fetch_id, attempt_id)
  on delete restrict deferrable initially deferred;

create table public.lastfm_recording_tag (
  recording_id uuid not null,
  tag_id bigint not null,
  fetch_id uuid not null,
  source_mbid uuid,
  source_tag_name text not null,
  weighted_count integer not null,
  normalized_weight real not null,
  vector_rank smallint not null,
  synced_at timestamptz not null default now(),
  constraint pk_lastfm_recording_tag primary key (recording_id, tag_id),
  constraint ux_lastfm_recording_tag_rank unique (recording_id, vector_rank),
  constraint fk_lastfm_recording_tag_recording foreign key (recording_id) references public.music_recording(recording_id) on delete cascade,
  constraint fk_lastfm_recording_tag_tag foreign key (tag_id) references public.music_tag(tag_id) on delete restrict,
  constraint fk_lastfm_recording_tag_fetch foreign key (fetch_id, recording_id) references public.lastfm_tag_fetch(fetch_id, recording_id) on delete restrict,
  constraint ck_lastfm_recording_tag_name check (btrim(source_tag_name) <> ''),
  constraint ck_lastfm_recording_tag_count check (weighted_count >= 0),
  constraint ck_lastfm_recording_tag_weight check (normalized_weight between 0 and 1),
  constraint ck_lastfm_recording_tag_rank check (vector_rank between 1 and 20)
);

create table public.music_sync_job (
  job_id uuid not null default extensions.gen_random_uuid(),
  job_kind text not null,
  entity_type text not null,
  entity_id uuid not null,
  idempotency_key text not null,
  job_status text not null default 'pending',
  priority integer not null default 0,
  expected_row_version bigint,
  attempt_count integer not null default 0,
  available_at timestamptz not null default now(),
  lease_until timestamptz,
  fence_token uuid,
  worker_id uuid,
  http_status integer,
  api_error_code integer,
  last_error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint pk_music_sync_job primary key (job_id),
  constraint ux_music_sync_job_idempotency_key unique (idempotency_key),
  constraint ck_music_sync_job_kind check (job_kind in ('mb_lookup','mb_redirect','lastfm_tags','embedding','reconcile')),
  constraint ck_music_sync_job_entity check (entity_type in ('artist','album','release','recording','track')),
  constraint ck_music_sync_job_status check (job_status in ('pending','processing','retry','completed','blocked','quarantined','dead')),
  constraint ck_music_sync_job_counts check (attempt_count >= 0 and (expected_row_version is null or expected_row_version >= 0)),
  constraint ck_music_sync_job_key check (btrim(idempotency_key) <> '')
);

create table public.music_sync_run (
  run_id uuid not null default extensions.gen_random_uuid(),
  run_kind text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  run_status text not null default 'running',
  request_count integer not null default 0,
  success_count integer not null default 0,
  failure_count integer not null default 0,
  error_message text,
  constraint pk_music_sync_run primary key (run_id),
  constraint ck_music_sync_run_kind check (run_kind in ('musicbrainz','lastfm','reconcile')),
  constraint ck_music_sync_run_status check (run_status in ('running','completed','partial','failed')),
  constraint ck_music_sync_run_counts check (
    request_count >= 0 and success_count >= 0 and failure_count >= 0
    and success_count + failure_count <= request_count
  )
);

create table public.music_dead_letter (
  dead_letter_id uuid not null default extensions.gen_random_uuid(),
  source_kind text not null,
  source_id uuid not null,
  reason text not null,
  sanitized_payload jsonb not null default '{}'::jsonb,
  failed_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution_note text,
  constraint pk_music_dead_letter primary key (dead_letter_id),
  constraint ck_music_dead_letter_source check (source_kind in ('sync_job','lastfm_fetch','vector_outbox')),
  constraint ck_music_dead_letter_reason check (btrim(reason) <> '')
);

-- FK and workflow indexes. PK/UNIQUE leading columns are not duplicated.
create index ix_music_artist_name_lower on public.music_artist (lower(name));
create index ix_music_artist_country_code on public.music_artist (country_code) where country_code is not null;
create index ix_music_artist_merged_into on public.music_artist (merged_into_artist_id) where merged_into_artist_id is not null;
create index ix_music_album_title_lower on public.music_album (lower(title));
create index ix_music_album_primary_artist on public.music_album (primary_artist_id) where primary_artist_id is not null;
create index ix_music_album_merged_into on public.music_album (merged_into_album_id) where merged_into_album_id is not null;
create unique index ux_music_release_representative on public.music_release (album_id) where is_representative;
create index ix_music_release_album on public.music_release (album_id);
create index ix_music_release_canonical_mbid on public.music_release (canonical_mbid) where canonical_mbid is not null;
create index ix_music_release_merged_into on public.music_release (merged_into_release_id) where merged_into_release_id is not null;
create index ix_music_recording_title_lower on public.music_recording (lower(title));
create index ix_music_recording_primary_artist on public.music_recording (primary_artist_id) where primary_artist_id is not null;
create index ix_music_recording_merged_into on public.music_recording (merged_into_recording_id) where merged_into_recording_id is not null;
create index ix_music_track_release_album on public.music_track (release_id, album_id);
create index ix_music_track_album_position on public.music_track (album_id, medium_position, track_position);
create index ix_music_track_recording on public.music_track (recording_id) where recording_id is not null;
create index ix_music_track_source_recording_mbid on public.music_track (source_recording_mbid) where source_recording_mbid is not null;
create index ix_music_track_merged_into on public.music_track (merged_into_track_id) where merged_into_track_id is not null;

create unique index ux_music_artist_mbid_canonical on public.music_artist_mbid (artist_id) where is_canonical;
create index ix_music_artist_mbid_entity_status on public.music_artist_mbid (artist_id, identifier_status);
create index ix_music_artist_mbid_redirect on public.music_artist_mbid (redirect_target_mbid) where redirect_target_mbid is not null;
create index ix_music_artist_mbid_resolved on public.music_artist_mbid (resolved_mbid) where resolved_mbid is not null;
create unique index ux_music_album_mbid_canonical on public.music_album_mbid (album_id) where is_canonical;
create index ix_music_album_mbid_entity_status on public.music_album_mbid (album_id, identifier_status);
create index ix_music_album_mbid_redirect on public.music_album_mbid (redirect_target_mbid) where redirect_target_mbid is not null;
create index ix_music_album_mbid_resolved on public.music_album_mbid (resolved_mbid) where resolved_mbid is not null;
create unique index ux_music_release_mbid_canonical on public.music_release_mbid (release_id) where is_canonical;
create index ix_music_release_mbid_entity_status on public.music_release_mbid (release_id, identifier_status);
create index ix_music_release_mbid_redirect on public.music_release_mbid (redirect_target_mbid) where redirect_target_mbid is not null;
create index ix_music_release_mbid_resolved on public.music_release_mbid (resolved_mbid) where resolved_mbid is not null;
create unique index ux_music_recording_mbid_canonical on public.music_recording_mbid (recording_id) where is_canonical;
create index ix_music_recording_mbid_entity_status on public.music_recording_mbid (recording_id, identifier_status);
create index ix_music_recording_mbid_redirect on public.music_recording_mbid (redirect_target_mbid) where redirect_target_mbid is not null;
create index ix_music_recording_mbid_resolved on public.music_recording_mbid (resolved_mbid) where resolved_mbid is not null;
create unique index ux_music_track_mbid_canonical on public.music_track_mbid (track_id) where is_canonical;
create index ix_music_track_mbid_entity_status on public.music_track_mbid (track_id, identifier_status);
create index ix_music_track_mbid_redirect on public.music_track_mbid (redirect_target_mbid) where redirect_target_mbid is not null;
create index ix_music_track_mbid_resolved on public.music_track_mbid (resolved_mbid) where resolved_mbid is not null;

create index ix_music_recording_redirect_new on public.music_recording_redirect (new_recording_id);
create index ix_music_recording_duplicate_low on public.music_recording_duplicate_candidate (recording_id_low);
create index ix_music_recording_duplicate_high on public.music_recording_duplicate_candidate (recording_id_high);
create index ix_music_mbid_resolution_observation_lookup on public.music_mbid_resolution_observation (entity_type, requested_mbid, observed_at desc);
create index ix_music_album_artist_credit_artist on public.music_album_artist_credit (artist_id);
create index ix_music_release_artist_credit_artist on public.music_release_artist_credit (artist_id);
create index ix_music_recording_artist_credit_artist on public.music_recording_artist_credit (artist_id);
create index ix_music_track_artist_credit_artist on public.music_track_artist_credit (artist_id);
create index ix_music_artist_genre_genre on public.music_artist_genre (genre_mbid);
create index ix_music_album_genre_genre on public.music_album_genre (genre_mbid);
create index ix_music_release_genre_genre on public.music_release_genre (genre_mbid);
create index ix_music_recording_genre_genre on public.music_recording_genre (genre_mbid);
create index ix_music_tag_alias_tag on public.music_tag_alias (tag_id);
create index ix_music_artist_mb_tag_tag on public.music_artist_mb_tag (tag_id);
create index ix_music_album_mb_tag_tag on public.music_album_mb_tag (tag_id);
create index ix_music_release_mb_tag_tag on public.music_release_mb_tag (tag_id);
create index ix_music_recording_mb_tag_tag on public.music_recording_mb_tag (tag_id);
create index ix_music_recording_isrc_isrc on public.music_recording_isrc (isrc);
create index ix_lastfm_recording_profile_due on public.lastfm_recording_profile (next_sync_at)
  where match_status in ('pending','matched','no_data','retry');
create index ix_lastfm_recording_profile_source_mbid on public.lastfm_recording_profile (active_source_mbid) where active_source_mbid is not null;
create index ix_lastfm_tag_fetch_recording on public.lastfm_tag_fetch (recording_id);
create index ix_lastfm_tag_fetch_claim on public.lastfm_tag_fetch (retry_at, created_at) where fetch_status in ('pending','retry');
create index ix_lastfm_tag_fetch_running_lease on public.lastfm_tag_fetch (lease_until) where fetch_status = 'running';
create index ix_lastfm_recording_tag_tag on public.lastfm_recording_tag (tag_id);
create index ix_lastfm_recording_tag_fetch on public.lastfm_recording_tag (fetch_id);
create index ix_music_sync_job_claim on public.music_sync_job (priority desc, available_at, created_at) where job_status in ('pending','retry');
create index ix_music_sync_job_lease on public.music_sync_job (lease_until) where job_status = 'processing';
create unique index ux_music_dead_letter_unresolved on public.music_dead_letter (source_kind, source_id) where resolved_at is null;
create index ix_music_dead_letter_failed_unresolved on public.music_dead_letter (failed_at) where resolved_at is null;

-- Deferred merge-cycle checks for all five authority graphs.
create function public.music_assert_merge_acyclic()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_id uuid;
  v_next uuid;
  v_depth integer := 0;
  v_seen uuid[] := '{}';
  v_pk text := tg_argv[0];
  v_merge text := tg_argv[1];
begin
  v_id := (to_jsonb(new) ->> v_pk)::uuid;
  v_next := (to_jsonb(new) ->> v_merge)::uuid;
  while v_next is not null loop
    if v_next = any(v_seen || v_id) then
      raise exception using errcode = '23514', message = format('merge cycle detected in %I.%I', tg_table_schema, tg_table_name);
    end if;
    v_seen := array_append(v_seen, v_next);
    v_depth := v_depth + 1;
    if v_depth > 16 then
      raise exception using errcode = '23514', message = format('merge chain exceeds 16 in %I.%I', tg_table_schema, tg_table_name);
    end if;
    execute format('select %I from %I.%I where %I = $1', v_merge, tg_table_schema, tg_table_name, v_pk)
      into v_next using v_next;
  end loop;
  return null;
end;
$$;

create constraint trigger trg_music_artist_merge_acyclic after insert or update on public.music_artist
  deferrable initially deferred for each row execute function public.music_assert_merge_acyclic('artist_id','merged_into_artist_id');
create constraint trigger trg_music_album_merge_acyclic after insert or update on public.music_album
  deferrable initially deferred for each row execute function public.music_assert_merge_acyclic('album_id','merged_into_album_id');
create constraint trigger trg_music_release_merge_acyclic after insert or update on public.music_release
  deferrable initially deferred for each row execute function public.music_assert_merge_acyclic('release_id','merged_into_release_id');
create constraint trigger trg_music_recording_merge_acyclic after insert or update on public.music_recording
  deferrable initially deferred for each row execute function public.music_assert_merge_acyclic('recording_id','merged_into_recording_id');
create constraint trigger trg_music_track_merge_acyclic after insert or update on public.music_track
  deferrable initially deferred for each row execute function public.music_assert_merge_acyclic('track_id','merged_into_track_id');

-- Active entities have exactly one canonical alias, and the cache must match it.
create function public.music_assert_canonical_mbid()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_entity_table text := tg_argv[0];
  v_mbid_table text := tg_argv[1];
  v_pk text := tg_argv[2];
  v_id uuid;
  v_status text;
  v_cache uuid;
  v_count integer;
  v_canonical uuid;
begin
  if tg_op = 'DELETE' then
    v_id := (to_jsonb(old) ->> v_pk)::uuid;
  elsif tg_table_name = v_entity_table then
    v_id := (to_jsonb(new) ->> v_pk)::uuid;
  else
    v_id := (to_jsonb(new) ->> v_pk)::uuid;
  end if;
  execute format('select entity_status, canonical_mbid from public.%I where %I = $1', v_entity_table, v_pk)
    into v_status, v_cache using v_id;
  if not found then return null; end if;
  execute format('select count(*), (array_agg(mbid))[1] from public.%I where %I = $1 and is_canonical', v_mbid_table, v_pk)
    into v_count, v_canonical using v_id;
  if v_status = 'active' then
    if v_count <> 1 or v_cache is distinct from v_canonical then
      raise exception using errcode = '23514', message = format('active %s %s must have exactly one matching canonical MBID', v_entity_table, v_id);
    end if;
  elsif v_count <> 0 or v_cache is not null then
    raise exception using errcode = '23514', message = format('inactive %s %s cannot have a canonical MBID', v_entity_table, v_id);
  end if;
  return null;
end;
$$;

create function public.music_assert_canonical_mbid_old_owner()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_entity_table text := tg_argv[0];
  v_mbid_table text := tg_argv[1];
  v_pk text := tg_argv[2];
  v_old_id uuid;
  v_new_id uuid;
  v_status text;
  v_cache uuid;
  v_count integer;
  v_canonical uuid;
begin
  v_old_id := (to_jsonb(old) ->> v_pk)::uuid;
  v_new_id := (to_jsonb(new) ->> v_pk)::uuid;
  if v_old_id is null or v_old_id = v_new_id then return null; end if;
  execute format('select entity_status, canonical_mbid from public.%I where %I = $1', v_entity_table, v_pk)
    into v_status, v_cache using v_old_id;
  if not found then return null; end if;
  execute format('select count(*), (array_agg(mbid))[1] from public.%I where %I = $1 and is_canonical', v_mbid_table, v_pk)
    into v_count, v_canonical using v_old_id;
  if (v_status = 'active' and (v_count <> 1 or v_cache is distinct from v_canonical))
     or (v_status <> 'active' and (v_count <> 0 or v_cache is not null)) then
    raise exception using errcode = '23514', message = format('canonical MBID invariant failed for previous %s owner %s', v_entity_table, v_old_id);
  end if;
  return null;
end;
$$;

create function public.music_assert_mbid_redirect_acyclic()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_mbid_table text := tg_argv[0];
  v_next uuid := new.redirect_target_mbid;
  v_depth integer := 0;
  v_seen uuid[] := array[new.mbid];
begin
  while v_next is not null loop
    if v_next = any(v_seen) then
      raise exception using errcode = '23514', message = format('MBID redirect cycle detected in %s', v_mbid_table);
    end if;
    v_seen := array_append(v_seen, v_next);
    v_depth := v_depth + 1;
    if v_depth > 16 then
      raise exception using errcode = '23514', message = format('MBID redirect chain exceeds 16 in %s', v_mbid_table);
    end if;
    execute format('select redirect_target_mbid from public.%I where mbid = $1', v_mbid_table)
      into v_next using v_next;
  end loop;
  return null;
end;
$$;

-- Redirect source and target must resolve to the same final internal merge root.
create function public.music_assert_mbid_redirect_root()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_entity_table text := tg_argv[0];
  v_mbid_table text := tg_argv[1];
  v_pk text := tg_argv[2];
  v_merge text := tg_argv[3];
  v_source uuid;
  v_target uuid;
  v_source_root uuid;
  v_target_root uuid;
  v_next uuid;
  v_depth integer;
begin
  if new.identifier_status <> 'redirected' then return null; end if;
  execute format('select %I from public.%I where mbid = $1', v_pk, v_mbid_table)
    into v_source using new.mbid;
  execute format('select %I from public.%I where mbid = $1', v_pk, v_mbid_table)
    into v_target using new.resolved_mbid;
  v_source_root := v_source;
  v_depth := 0;
  loop
    execute format('select %I from public.%I where %I = $1', v_merge, v_entity_table, v_pk)
      into v_next using v_source_root;
    exit when v_next is null;
    v_source_root := v_next; v_depth := v_depth + 1;
    if v_depth > 16 then raise exception using errcode = '23514', message = 'source merge chain exceeds 16'; end if;
  end loop;
  v_target_root := v_target;
  v_depth := 0;
  loop
    execute format('select %I from public.%I where %I = $1', v_merge, v_entity_table, v_pk)
      into v_next using v_target_root;
    exit when v_next is null;
    v_target_root := v_next; v_depth := v_depth + 1;
    if v_depth > 16 then raise exception using errcode = '23514', message = 'target merge chain exceeds 16'; end if;
  end loop;
  if v_source_root is distinct from v_target_root then
    raise exception using errcode = '23514', message = format('MBID redirect roots differ in %s', v_mbid_table);
  end if;
  return null;
end;
$$;

-- Generate the paired canonical and redirect-root constraint triggers.
do $$
declare r record;
begin
  for r in
    select * from (values
      ('music_artist','music_artist_mbid','artist_id','merged_into_artist_id'),
      ('music_album','music_album_mbid','album_id','merged_into_album_id'),
      ('music_release','music_release_mbid','release_id','merged_into_release_id'),
      ('music_recording','music_recording_mbid','recording_id','merged_into_recording_id'),
      ('music_track','music_track_mbid','track_id','merged_into_track_id')
    ) v(entity_table, mbid_table, pk_col, merge_col)
  loop
    execute format(
      'create constraint trigger %I after insert or update on public.%I deferrable initially deferred for each row execute function public.music_assert_canonical_mbid(%L,%L,%L)',
      'trg_' || r.entity_table || '_canonical_mbid', r.entity_table, r.entity_table, r.mbid_table, r.pk_col);
    execute format(
      'create constraint trigger %I after insert or update or delete on public.%I deferrable initially deferred for each row execute function public.music_assert_canonical_mbid(%L,%L,%L)',
      'trg_' || r.mbid_table || '_canonical_mbid', r.mbid_table, r.entity_table, r.mbid_table, r.pk_col);
    execute format(
      'create constraint trigger %I after update on public.%I deferrable initially deferred for each row execute function public.music_assert_canonical_mbid_old_owner(%L,%L,%L)',
      'trg_' || r.mbid_table || '_old_owner', r.mbid_table, r.entity_table, r.mbid_table, r.pk_col);
    execute format(
      'create constraint trigger %I after insert or update on public.%I deferrable initially deferred for each row execute function public.music_assert_mbid_redirect_root(%L,%L,%L,%L)',
      'trg_' || r.mbid_table || '_redirect_root', r.mbid_table, r.entity_table, r.mbid_table, r.pk_col, r.merge_col);
    execute format(
      'create constraint trigger %I after insert or update on public.%I deferrable initially deferred for each row execute function public.music_assert_mbid_redirect_acyclic(%L)',
      'trg_' || r.mbid_table || '_redirect_acyclic', r.mbid_table, r.mbid_table);
  end loop;
end $$;

-- Active albums have exactly one active representative release.
create function public.music_assert_album_representative()
returns trigger language plpgsql set search_path = '' as $$
declare v_album_id uuid; v_old_album_id uuid; v_status text; v_count integer;
begin
  v_album_id := case when tg_op = 'DELETE' then old.album_id else new.album_id end;
  select entity_status into v_status from public.music_album where album_id = v_album_id;
  if found and v_status = 'active' then
    select count(*) into v_count from public.music_release
     where album_id = v_album_id and is_representative and entity_status = 'active';
    if v_count <> 1 then
      raise exception using errcode = '23514', message = format('active album %s must have exactly one active representative release', v_album_id);
    end if;
  end if;
  if tg_table_name = 'music_release' and tg_op = 'UPDATE' then
    v_old_album_id := old.album_id;
    if v_old_album_id is distinct from v_album_id then
      select entity_status into v_status from public.music_album where album_id = v_old_album_id;
      if found and v_status = 'active' then
        select count(*) into v_count from public.music_release
         where album_id = v_old_album_id and is_representative and entity_status = 'active';
        if v_count <> 1 then
          raise exception using errcode = '23514', message = format('active album %s must have exactly one active representative release', v_old_album_id);
        end if;
      end if;
    end if;
  end if;
  return null;
end;
$$;
create constraint trigger trg_music_album_representative after insert or update on public.music_album
  deferrable initially deferred for each row execute function public.music_assert_album_representative();
create constraint trigger trg_music_release_representative after insert or update or delete on public.music_release
  deferrable initially deferred for each row execute function public.music_assert_album_representative();

create function public.music_assert_recording_redirect()
returns trigger language plpgsql set search_path = '' as $$
declare v_next uuid := new.new_recording_id; v_depth integer := 0; v_seen uuid[] := array[new.old_recording_id];
begin
  loop
    if v_next = any(v_seen) then raise exception using errcode = '23514', message = 'recording redirect cycle detected'; end if;
    v_seen := array_append(v_seen, v_next); v_depth := v_depth + 1;
    if v_depth > 16 then raise exception using errcode = '23514', message = 'recording redirect chain exceeds 16'; end if;
    select new_recording_id into v_next from public.music_recording_redirect where old_recording_id = v_next;
    exit when not found;
  end loop;
  return null;
end;
$$;
create constraint trigger trg_music_recording_redirect_acyclic after insert or update on public.music_recording_redirect
  deferrable initially deferred for each row execute function public.music_assert_recording_redirect();

create function public.music_assert_lastfm_tag_set()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_recording_id uuid;
  v_recording_ids uuid[];
  v_profile_count integer;
  v_actual_count integer;
begin
  v_recording_ids := case
    when tg_op = 'INSERT' then array[new.recording_id]
    when tg_op = 'DELETE' then array[old.recording_id]
    else array[old.recording_id, new.recording_id]
  end;
  foreach v_recording_id in array v_recording_ids loop
    select persisted_tag_count into v_profile_count
    from public.lastfm_recording_profile where recording_id = v_recording_id;
    if not found then
      if exists (select 1 from public.lastfm_recording_tag where recording_id = v_recording_id) then
        raise exception using errcode = '23514', message = format('Last.fm tags for %s require a recording profile', v_recording_id);
      end if;
      continue;
    end if;
    select count(*) into v_actual_count from public.lastfm_recording_tag where recording_id = v_recording_id;
    if v_profile_count <> v_actual_count or (v_actual_count not between 3 and 20 and v_actual_count <> 0) then
      raise exception using errcode = '23514',
        message = format('Last.fm tag count mismatch for %s: profile=%s actual=%s', v_recording_id, v_profile_count, v_actual_count);
    end if;
  end loop;
  return null;
end;
$$;
create constraint trigger trg_lastfm_recording_profile_tag_set after insert or update or delete on public.lastfm_recording_profile
  deferrable initially deferred for each row execute function public.music_assert_lastfm_tag_set();
create constraint trigger trg_lastfm_recording_tag_set after insert or update or delete on public.lastfm_recording_tag
  deferrable initially deferred for each row execute function public.music_assert_lastfm_tag_set();

create function public.music_assert_merge_audit()
returns trigger language plpgsql set search_path = '' as $$
declare v_actual uuid;
begin
  case new.entity_type
    when 'artist' then select merged_into_artist_id into v_actual from public.music_artist where artist_id = new.loser_entity_id;
    when 'album' then select merged_into_album_id into v_actual from public.music_album where album_id = new.loser_entity_id;
    when 'release' then select merged_into_release_id into v_actual from public.music_release where release_id = new.loser_entity_id;
    when 'recording' then select merged_into_recording_id into v_actual from public.music_recording where recording_id = new.loser_entity_id;
    when 'track' then select merged_into_track_id into v_actual from public.music_track where track_id = new.loser_entity_id;
  end case;
  if not found or v_actual is distinct from new.survivor_entity_id then
    raise exception using errcode = '23514', message = format('merge audit does not match %s loser state', new.entity_type);
  end if;
  return null;
end;
$$;
create constraint trigger trg_music_entity_merge_audit_match after insert or update on public.music_entity_merge_audit
  deferrable initially deferred for each row execute function public.music_assert_merge_audit();

create function public.music_assert_merged_entity_audit()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_entity_type text := tg_argv[0];
  v_pk text := tg_argv[1];
  v_merge text := tg_argv[2];
  v_id uuid := (to_jsonb(new) ->> v_pk)::uuid;
  v_survivor uuid := (to_jsonb(new) ->> v_merge)::uuid;
begin
  if new.entity_status = 'merged' and not exists (
    select 1 from public.music_entity_merge_audit a
    where a.entity_type = v_entity_type
      and a.loser_entity_id = v_id
      and a.survivor_entity_id = v_survivor
  ) then
    raise exception using errcode = '23514', message = format('merged %s %s requires a matching merge audit row', v_entity_type, v_id);
  end if;
  return null;
end;
$$;

do $$
declare r record;
begin
  for r in select * from (values
    ('artist','music_artist','artist_id','merged_into_artist_id'),
    ('album','music_album','album_id','merged_into_album_id'),
    ('release','music_release','release_id','merged_into_release_id'),
    ('recording','music_recording','recording_id','merged_into_recording_id'),
    ('track','music_track','track_id','merged_into_track_id')
  ) v(entity_type, table_name, pk_col, merge_col)
  loop
    execute format(
      'create constraint trigger %I after insert or update on public.%I deferrable initially deferred for each row execute function public.music_assert_merged_entity_audit(%L,%L,%L)',
      'trg_' || r.table_name || '_merge_audit', r.table_name,
      r.entity_type, r.pk_col, r.merge_col);
  end loop;
end $$;

-- updated_at and hard-delete triggers.
do $$
declare v_table text;
begin
  foreach v_table in array array[
    'music_artist','music_album','music_release','music_recording','music_track',
    'music_artist_mbid','music_album_mbid','music_release_mbid','music_recording_mbid','music_track_mbid',
    'music_recording_duplicate_candidate','music_genre','music_tag','lastfm_recording_profile'
  ] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.music_set_updated_at()',
      'trg_' || v_table || '_updated_at', v_table);
  end loop;
  foreach v_table in array array[
    'music_artist','music_album','music_release','music_recording','music_track',
    'music_artist_mbid','music_album_mbid','music_release_mbid','music_recording_mbid','music_track_mbid',
    'music_recording_redirect','music_entity_merge_audit'
  ] loop
    execute format('create trigger %I before delete on public.%I for each row execute function public.music_prevent_hard_delete()',
      'trg_' || v_table || '_prevent_delete', v_table);
  end loop;
end $$;

-- Every table and column receives a database-visible SSOT comment. More specific
-- table comments describe the row contract; column comments retain table context.
do $$
declare r record;
declare v_description text;
begin
  for r in select * from (values
    ('music_artist','MusicBrainz Artist 권위 엔터티'),
    ('music_album','MusicBrainz Release Group 권위 엔터티'),
    ('music_release','앨범별 결정적 대표 MusicBrainz Release'),
    ('music_recording','MusicBrainz Recording 권위 엔터티 및 프로젝트 공통 곡 ID'),
    ('music_track','대표 Release의 medium/track 위치 원장'),
    ('music_artist_mbid','Artist canonical·historical·redirect MBID 원장'),
    ('music_album_mbid','Release Group canonical·historical·redirect MBID 원장'),
    ('music_release_mbid','Release canonical·historical·redirect MBID 원장'),
    ('music_recording_mbid','Recording canonical·historical·redirect MBID 원장'),
    ('music_track_mbid','Track canonical·historical·redirect MBID 원장'),
    ('music_recording_redirect','내부 Recording 병합 redirect 원장'),
    ('music_recording_duplicate_candidate','자동 병합하지 않는 Recording 중복 검토 후보'),
    ('music_mbid_resolution_observation','MusicBrainz MBID 조회 관찰·진단 이력'),
    ('music_entity_merge_audit','모든 내부 음악 엔터티 병합 감사 원장'),
    ('music_album_artist_credit','Release Group 순서형 artist credit'),
    ('music_release_artist_credit','Release 순서형 artist credit'),
    ('music_recording_artist_credit','Recording 순서형 artist credit'),
    ('music_track_artist_credit','Track 순서형 artist credit'),
    ('music_genre','MusicBrainz genre 사전'),
    ('music_artist_genre','Artist와 MusicBrainz genre 연결'),
    ('music_album_genre','Release Group과 MusicBrainz genre 연결'),
    ('music_release_genre','Release와 MusicBrainz genre 연결'),
    ('music_recording_genre','Recording과 MusicBrainz genre 연결'),
    ('music_tag','MusicBrainz·Last.fm 통합 canonical tag 사전'),
    ('music_tag_alias','출처별 tag alias 정규화'),
    ('music_artist_mb_tag','Artist의 MusicBrainz tag'),
    ('music_album_mb_tag','Release Group의 MusicBrainz tag'),
    ('music_release_mb_tag','Release의 MusicBrainz tag'),
    ('music_recording_mb_tag','Recording의 MusicBrainz tag'),
    ('music_recording_isrc','Recording에서 관찰된 비유일 ISRC'),
    ('lastfm_recording_profile','Recording별 Last.fm 활성 태그 출처·갱신 상태'),
    ('lastfm_tag_fetch','Last.fm 후보 조회 회차와 lease 상태'),
    ('lastfm_tag_fetch_attempt','Last.fm 회차 안의 단일 후보 조회 결과'),
    ('lastfm_recording_tag','단일 선택 응답에서 필터를 통과한 현재 3~20개 태그'),
    ('music_sync_job','MusicBrainz·Last.fm 수집 작업 queue'),
    ('music_sync_run','수집 실행 집계 로그'),
    ('music_dead_letter','비밀이 제거된 미복구 실패 원장')
  ) v(table_name, description)
  loop
    execute format('comment on table public.%I is %L', r.table_name, r.description);
    for v_description in
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = r.table_name
    loop
      execute format('comment on column public.%I.%I is %L',
        r.table_name, v_description,
        r.description || ' — ' || v_description || ' (SSOT 정의 컬럼)');
    end loop;
  end loop;
end $$;

-- No direct client access. service_role is the only role granted table access.
do $$
declare v_table text;
declare v_sequence text;
begin
  foreach v_table in array array[
    'music_artist','music_album','music_release','music_recording','music_track',
    'music_artist_mbid','music_album_mbid','music_release_mbid','music_recording_mbid','music_track_mbid',
    'music_recording_redirect','music_recording_duplicate_candidate','music_mbid_resolution_observation',
    'music_entity_merge_audit','music_album_artist_credit','music_release_artist_credit',
    'music_recording_artist_credit','music_track_artist_credit','music_genre','music_artist_genre',
    'music_album_genre','music_release_genre','music_recording_genre','music_tag','music_tag_alias',
    'music_artist_mb_tag','music_album_mb_tag','music_release_mb_tag','music_recording_mb_tag',
    'music_recording_isrc','lastfm_recording_profile','lastfm_tag_fetch','lastfm_tag_fetch_attempt',
    'lastfm_recording_tag','music_sync_job','music_sync_run','music_dead_letter'
  ] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('revoke all on table public.%I from public, anon, authenticated', v_table);
    execute format('grant select, insert, update, delete on table public.%I to service_role', v_table);
  end loop;
  foreach v_sequence in array array[
    pg_get_serial_sequence('public.music_tag','tag_id'),
    pg_get_serial_sequence('public.music_tag_alias','tag_alias_id')
  ] loop
    execute format('revoke all on sequence %s from public, anon, authenticated', v_sequence);
    execute format('grant usage, select on sequence %s to service_role', v_sequence);
  end loop;
end $$;

revoke all on function public.music_set_updated_at() from public, anon, authenticated;
revoke all on function public.music_prevent_hard_delete() from public, anon, authenticated;
revoke all on function public.music_assert_merge_acyclic() from public, anon, authenticated;
revoke all on function public.music_assert_canonical_mbid() from public, anon, authenticated;
revoke all on function public.music_assert_canonical_mbid_old_owner() from public, anon, authenticated;
revoke all on function public.music_assert_mbid_redirect_acyclic() from public, anon, authenticated;
revoke all on function public.music_assert_mbid_redirect_root() from public, anon, authenticated;
revoke all on function public.music_assert_album_representative() from public, anon, authenticated;
revoke all on function public.music_assert_recording_redirect() from public, anon, authenticated;
revoke all on function public.music_assert_lastfm_tag_set() from public, anon, authenticated;
revoke all on function public.music_assert_merge_audit() from public, anon, authenticated;
revoke all on function public.music_assert_merged_entity_audit() from public, anon, authenticated;
