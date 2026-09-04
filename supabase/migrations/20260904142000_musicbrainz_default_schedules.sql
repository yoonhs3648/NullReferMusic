-- Verified default Artist allowlist and collection schedules.
-- Artist identities were checked against the official MusicBrainz WS2 Artist API.
-- Verification fixture: supabase/tests/fixtures/musicbrainz-default-artist-allowlist.json
-- Depends on 20260904132000 (schema) and 20260904141000 (six-hour retention Cron).

create temporary table nrm_default_music_artist_seed (
  cohort text not null,
  artist_mbid uuid not null,
  display_name text not null,
  priority integer not null,
  primary key (cohort, artist_mbid)
) on commit drop;

insert into nrm_default_music_artist_seed(cohort, artist_mbid, display_name, priority)
values
  ('k_pop', '0d79fe8e-ba27-4859-bb8c-2f255f346853', 'BTS', 10),
  ('k_pop', '48646387-1664-4c9a-9139-9bfd091b823c', 'BLACKPINK', 20),
  ('k_pop', '8da127cc-c432-418f-b356-ef36210d82ac', 'TWICE', 30),
  ('k_pop', '4f0cb3b7-6c06-4317-ae35-ddf3106a17ee', 'Red Velvet', 40),
  ('k_pop', 'b3785a55-2cf6-497d-b8e3-cfa21a36f997', 'EXO', 50),
  ('k_pop', 'e04d239e-9fa8-49b3-b9b7-9e439c3cb1d1', 'SEVENTEEN', 60),
  ('k_pop', '142b343d-bf5a-428c-a64f-6d1a7566bbe9', 'Stray Kids', 70),
  ('k_pop', '9d17d14a-e81c-410e-a90b-b02b0a9de6f8', 'NCT 127', 80),
  ('k_pop', 'b51c672b-85e0-48fe-8648-470a2422229f', 'aespa', 90),
  ('k_pop', '49204a7a-ed85-407a-828f-6fd46f1d8126', 'NewJeans', 100),
  ('k_pop', 'b2f2216a-d7a9-4ce0-8b8f-f494d9a8c196', 'IVE', 110),
  ('k_pop', '1ee37742-1e3d-4e61-84d2-bc85f4c1459a', 'LE SSERAFIM', 120),

  ('korean_hip_hop', '57f1cdd6-cf32-4004-a095-3ef043c91b61', 'Epik High', 10),
  ('korean_hip_hop', '9f92f1e5-7b25-4be2-ab61-76b6db556887', 'Dynamic Duo', 20),
  ('korean_hip_hop', 'e6ac2d77-315e-4f92-9513-8b277342534e', 'Tiger JK', 30),
  ('korean_hip_hop', 'd2faa4dd-f3fc-4aa9-aa9e-001826d6fdd2', '윤미래', 40),
  ('korean_hip_hop', '425afcd0-0db2-41d0-a0fa-10af97ee1f77', 'Dok2', 50),
  ('korean_hip_hop', '3dda8202-ce15-4031-862a-77bc6759d15e', 'Jay Park', 60),
  ('korean_hip_hop', 'f2215143-d7db-4cf0-9cd4-b0040eb63cbd', 'ZICO', 70),
  ('korean_hip_hop', 'ff2f225e-a49e-47ee-866a-d4606c4e3fea', 'Beenzino', 80),
  ('korean_hip_hop', '2b983abf-ef53-483e-a5f0-356e745008bd', 'DEAN', 90),
  ('korean_hip_hop', '68482b12-51ad-4f3b-bc8d-d1e8759fdbb6', 'DPR LIVE', 100),

  ('global_chart', '20244d07-534f-4eff-b4d4-930878889970', 'Taylor Swift', 10),
  ('global_chart', 'c8b03190-306c-4120-bb0b-6f2ebfc06ea9', 'The Weeknd', 20),
  ('global_chart', 'f4abc0b5-3f7a-4eff-8f78-ac078dbce533', 'Billie Eilish', 30),
  ('global_chart', '9fff2f8a-21e6-47de-a2b8-7f449929d43f', 'Drake', 40),
  ('global_chart', '859d0860-d480-4efd-970c-c05d5f1776b8', 'Beyoncé', 50),
  ('global_chart', 'b8a7c51f-362c-4dcb-a259-bc6e0095f0a6', 'Ed Sheeran', 60),
  ('global_chart', 'f4fdbb4c-e4b7-47a0-b83b-d91bbfcfa387', 'Ariana Grande', 70),
  ('global_chart', 'afb680f2-b6eb-4cd7-a70b-a63b25c763d5', 'Bruno Mars', 80),
  ('global_chart', '6f1a58bf-9b1b-49cf-a44a-6cefad7ae04f', 'Dua Lipa', 90),
  ('global_chart', '650e7db6-b795-4eb5-a702-5ea2fc46c848', 'Lady Gaga', 100),
  ('global_chart', 'cc197bad-dc9c-440d-a5b5-d52ba2e14234', 'Coldplay', 110),
  ('global_chart', '012151a8-0f9a-44c9-997f-ebd68b5389f9', 'Imagine Dragons', 120),
  ('global_chart', '0ab49580-c84f-44d4-875f-d83760ea2cfe', 'Maroon 5', 130),
  ('global_chart', 'cc2c9c3c-b7bc-4b8b-84d8-4fbd8779e493', 'Adele', 140),
  ('global_chart', '73e5e69d-3554-40d8-8516-00cb38737a1c', 'Rihanna', 150),
  ('global_chart', 'e0140a67-e4d1-4f13-8a01-364355bee46e', 'Justin Bieber', 160),
  ('global_chart', 'b1e26560-60e5-4236-bbdb-9aa5a8d5ee19', 'Post Malone', 170),
  ('global_chart', '381086ea-f511-4aba-bdf9-71c753dc5077', 'Kendrick Lamar', 180),
  ('global_chart', '89aa5ecb-59ad-46f5-b3eb-2d424e941f19', 'Bad Bunny', 190),
  ('global_chart', '6925db17-f35e-42f3-a4eb-84ee6bf5d4b0', 'Olivia Rodrigo', 200);

do $$
begin
  if exists (
    select 1
    from nrm_default_music_artist_seed k
    join nrm_default_music_artist_seed h using (artist_mbid)
    where k.cohort = 'k_pop' and h.cohort = 'korean_hip_hop'
  ) then
    raise exception 'K-pop and Korean hip-hop default cohorts must be disjoint';
  end if;
end
$$;

-- Global overlap policy:
-- 1. An MBID has one allowlist row. A specialist cohort wins over global_chart.
-- 2. The same MBID may still be linked to both specialist and global schedules.
-- 3. PK/UNIQUE upserts make both the allowlist row and schedule links idempotent.
with ranked as (
  select s.*,
    row_number() over (
      partition by artist_mbid
      order by case cohort when 'k_pop' then 0 when 'korean_hip_hop' then 1 else 2 end,
        priority, display_name
    ) as identity_rank
  from nrm_default_music_artist_seed s
)
insert into public.music_artist_allowlist(
  artist_mbid, display_name, cohort, priority, is_pinned, is_enabled,
  verified_at, selection_note
)
select artist_mbid, display_name, cohort, priority, true, true,
  '2026-09-04T05:27:27.064Z'::timestamptz,
  case cohort
    when 'k_pop' then 'Initial K-pop cohort; official MusicBrainz Artist id/name verified.'
    when 'korean_hip_hop' then 'Initial Korean hip-hop cohort; official MusicBrainz Artist id/name verified.'
    else 'Initial globally charted artist cohort; official MusicBrainz Artist id/name verified.'
  end
from ranked
where identity_rank = 1
on conflict (artist_mbid) do update set
  display_name = excluded.display_name,
  cohort = case
    when music_artist_allowlist.cohort in ('k_pop', 'korean_hip_hop')
      and excluded.cohort = 'global_chart'
      then music_artist_allowlist.cohort
    else excluded.cohort
  end,
  priority = least(music_artist_allowlist.priority, excluded.priority),
  is_pinned = true,
  verified_at = excluded.verified_at,
  selection_note = case
    when music_artist_allowlist.cohort in ('k_pop', 'korean_hip_hop')
      and excluded.cohort = 'global_chart'
      then music_artist_allowlist.selection_note
    else excluded.selection_note
  end;

insert into public.music_collection_schedule(
  schedule_key, display_name, schedule_kind, daily_time_kst, interval_minutes,
  next_run_at, is_enabled, date_from_offset_days, date_to_offset_days,
  country_codes, primary_types, secondary_types, release_statuses,
  max_artist_count, max_request_count, max_new_recording_count, priority
)
values
  (
    'musicbrainz-k-pop-daily', 'K-pop 예정 발매', 'daily', '09:00:00', null,
    case
      when (now() at time zone 'Asia/Seoul')::time < time '09:00'
        then (((now() at time zone 'Asia/Seoul')::date + time '09:00') at time zone 'Asia/Seoul')
      else ((((now() at time zone 'Asia/Seoul')::date + 1) + time '09:00') at time zone 'Asia/Seoul')
    end,
    true, 0, 365, '{}', '{}', '{}', array['Official'], 12, 45, 500, 10
  ),
  (
    'musicbrainz-korean-hip-hop-daily', '한국 힙합 예정 발매', 'daily', '10:00:00', null,
    case
      when (now() at time zone 'Asia/Seoul')::time < time '10:00'
        then (((now() at time zone 'Asia/Seoul')::date + time '10:00') at time zone 'Asia/Seoul')
      else ((((now() at time zone 'Asia/Seoul')::date + 1) + time '10:00') at time zone 'Asia/Seoul')
    end,
    true, 0, 365, '{}', '{}', '{}', array['Official'], 10, 45, 500, 20
  ),
  (
    'musicbrainz-global-chart-daily', '글로벌 차트 아티스트 예정 발매', 'daily', '11:00:00', null,
    case
      when (now() at time zone 'Asia/Seoul')::time < time '11:00'
        then (((now() at time zone 'Asia/Seoul')::date + time '11:00') at time zone 'Asia/Seoul')
      else ((((now() at time zone 'Asia/Seoul')::date + 1) + time '11:00') at time zone 'Asia/Seoul')
    end,
    true, 0, 365, '{}', '{}', '{}', array['Official'], 20, 45, 500, 30
  )
on conflict (schedule_key) do update set
  display_name = excluded.display_name,
  schedule_kind = excluded.schedule_kind,
  daily_time_kst = excluded.daily_time_kst,
  interval_minutes = excluded.interval_minutes,
  date_from_offset_days = excluded.date_from_offset_days,
  date_to_offset_days = excluded.date_to_offset_days,
  country_codes = excluded.country_codes,
  primary_types = excluded.primary_types,
  secondary_types = excluded.secondary_types,
  release_statuses = excluded.release_statuses,
  max_artist_count = excluded.max_artist_count,
  max_request_count = excluded.max_request_count,
  max_new_recording_count = excluded.max_new_recording_count,
  priority = excluded.priority;

insert into public.music_schedule_artist(schedule_id, artist_mbid, priority_override, is_enabled)
select s.schedule_id, seed.artist_mbid, seed.priority, true
from nrm_default_music_artist_seed seed
join public.music_collection_schedule s
  on s.schedule_key = case seed.cohort
    when 'k_pop' then 'musicbrainz-k-pop-daily'
    when 'korean_hip_hop' then 'musicbrainz-korean-hip-hop-daily'
    else 'musicbrainz-global-chart-daily'
  end
on conflict (schedule_id, artist_mbid) do update set
  priority_override = excluded.priority_override;

-- The cleanup worker is a separate six-hour Cron, not an Artist discovery schedule.
-- Keep the existing job active and normalize its cadence without creating a duplicate.
do $$
declare v_cleanup_job_id bigint;
begin
  select jobid into v_cleanup_job_id
  from cron.job
  where jobname = 'nrm-musicbrainz-retention'
  order by jobid desc
  limit 1;

  if v_cleanup_job_id is null then
    raise exception 'required cleanup Cron nrm-musicbrainz-retention is missing';
  end if;

  perform cron.alter_job(
    v_cleanup_job_id,
    schedule := '17 */6 * * *',
    active := true
  );
end
$$;
