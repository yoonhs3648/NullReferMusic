-- 배포 전에 이미 dead가 된 MusicBrainz job도 503 재시도 큐에 올린다.
-- Last.fm dead는 넣지 않는다.

insert into public.music_mb_transient_retry(
  source_job_kind, entity_id, source_schedule_id, discovery_scan_id, candidate_id,
  http_status, last_error, failed_at, updated_at
)
select
  j.job_kind,
  j.entity_id,
  j.schedule_id,
  j.discovery_scan_id,
  j.candidate_id,
  j.http_status,
  j.last_error_message,
  coalesce(j.completed_at, j.created_at),
  now()
from public.music_sync_job j
where j.job_status = 'dead'
  and j.job_kind in (
    'mb_catalog_track_resolve', 'mb_discovery', 'mb_release_hydrate',
    'mb_recording_hydrate', 'mb_upcoming_verify'
  )
on conflict (source_job_kind, entity_id) do nothing;
