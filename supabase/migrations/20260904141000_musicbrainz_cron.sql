-- Reproducible pg_cron/pg_net dispatcher for musicbrainz-sync.
-- Required Vault secret names:
--   musicbrainz_sync_url   = https://<project-ref>.supabase.co/functions/v1/musicbrainz-sync
--   musicbrainz_cron_token = same random token as Edge Secret MUSICBRAINZ_CRON_TOKEN
-- Secret values are intentionally not present in this migration.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
create extension if not exists supabase_vault with schema vault;

do $$
declare v_job_id bigint;
begin
  for v_job_id in
    select jobid from cron.job
    where jobname in ('nrm-musicbrainz-dispatcher', 'nrm-musicbrainz-retention')
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end
$$;

select cron.schedule(
  'nrm-musicbrainz-dispatcher',
  '* * * * *',
  $cron$
  select net.http_post(
    url := (
      select decrypted_secret from vault.decrypted_secrets
      where name = 'musicbrainz_sync_url'
      order by created_at desc limit 1
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'musicbrainz_cron_token'
        order by created_at desc limit 1
      )
    ),
    body := jsonb_build_object('scheduled_at', now(), 'mode', 'sync'),
    timeout_milliseconds := 55000
  )
  where exists (
    select 1 from vault.decrypted_secrets where name = 'musicbrainz_sync_url'
  ) and exists (
    select 1 from vault.decrypted_secrets where name = 'musicbrainz_cron_token'
  );
  $cron$
);

select cron.schedule(
  'nrm-musicbrainz-retention',
  '17 */6 * * *',
  $cron$
  select net.http_post(
    url := (
      select decrypted_secret from vault.decrypted_secrets
      where name = 'musicbrainz_sync_url'
      order by created_at desc limit 1
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'musicbrainz_cron_token'
        order by created_at desc limit 1
      )
    ),
    body := jsonb_build_object('scheduled_at', now(), 'mode', 'retention'),
    timeout_milliseconds := 55000
  )
  where exists (
    select 1 from vault.decrypted_secrets where name = 'musicbrainz_sync_url'
  ) and exists (
    select 1 from vault.decrypted_secrets where name = 'musicbrainz_cron_token'
  );
  $cron$
);

comment on extension pg_net is 'musicbrainz-sync Cron invokes Edge Function through pg_net';
