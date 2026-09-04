-- Fix Last.fm geo country for Korea Top: API rejects "South Korea" (error 6).
-- ISO 3166-1 English short name accepted by Last.fm is "Korea, Republic of".

update public.music_collection_schedule
set lastfm_param = 'Korea, Republic of'
where schedule_key = 'musicbrainz-lastfm-korea-top'
  and lastfm_method = 'geo.getTopArtists'
  and lastfm_param is distinct from 'Korea, Republic of';

-- Re-queue quarantined/dead lastfm_artist_pool jobs for the two known failures.
update public.music_sync_job j
set job_status = 'pending',
    available_at = now(),
    lease_until = null,
    fence_token = null,
    worker_id = null,
    last_error_message = null,
    http_status = null,
    api_error_code = null,
    completed_at = null
where j.job_kind = 'lastfm_artist_pool'
  and j.job_status in ('quarantined', 'dead')
  and j.schedule_id in (
    select s.schedule_id
    from public.music_collection_schedule s
    where s.schedule_key in (
      'musicbrainz-lastfm-korea-top',
      'musicbrainz-lastfm-korean-hiphop-top'
    )
  );

-- Mark related unresolved dead letters resolved after requeue.
update public.music_dead_letter dl
set resolved_at = now(),
    resolution_note = 'Requeued after Last.fm Korea country param fix / transient 503'
where dl.resolved_at is null
  and dl.source_kind = 'sync_job'
  and dl.source_id in (
    select j.job_id
    from public.music_sync_job j
    join public.music_collection_schedule s on s.schedule_id = j.schedule_id
    where j.job_kind = 'lastfm_artist_pool'
      and s.schedule_key in (
        'musicbrainz-lastfm-korea-top',
        'musicbrainz-lastfm-korean-hiphop-top'
      )
  );

-- Nudge next run so dispatcher can claim again soon if pool job already completed empty.
update public.music_collection_schedule
set next_run_at = least(next_run_at, now()),
    claimed_until = null,
    claim_fence_token = null,
    claimed_by = null
where schedule_key in (
  'musicbrainz-lastfm-korea-top',
  'musicbrainz-lastfm-korean-hiphop-top'
);
