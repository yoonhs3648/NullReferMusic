-- Extend AI Lab chat retention to also purge aged LLMCallAttemptLog / LLMTokenHistory.
-- Same retention_days cutoff as ChatSession (RegDate < now() - retention_days).

create or replace function public.nrm_rpc_ailab_chat_retention_run(
  p_batch_size integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sched public.nrm_system_schedule%rowtype;
  v_days integer;
  v_cutoff timestamptz;
  v_batch integer := greatest(1, least(coalesce(p_batch_size, 500), 2000));
  v_log_batch integer;
  v_session_ids bigint[];
  v_msg_count integer := 0;
  v_sess_count integer := 0;
  v_attempt_count integer := 0;
  v_token_count integer := 0;
begin
  select * into v_sched
  from public.nrm_system_schedule
  where schedule_key = 'ailab-chat-retention'
  for update;

  if not found then
    return jsonb_build_object(
      'ran', false,
      'reason', 'missing_schedule',
      'deleted_sessions', 0,
      'deleted_messages', 0,
      'deleted_attempt_logs', 0,
      'deleted_token_history', 0
    );
  end if;

  if not v_sched.is_enabled then
    return jsonb_build_object(
      'ran', false,
      'reason', 'disabled',
      'deleted_sessions', 0,
      'deleted_messages', 0,
      'deleted_attempt_logs', 0,
      'deleted_token_history', 0
    );
  end if;

  v_days := coalesce((v_sched.config->>'retention_days')::integer, 0);
  if v_days < 1 or v_days > 3650 then
    raise exception using
      errcode = '22023',
      message = 'ailab-chat-retention retention_days must be between 1 and 3650';
  end if;

  v_cutoff := now() - make_interval(days => v_days);
  v_log_batch := least(v_batch * 4, 8000);

  with doomed_attempts as (
    select l."LogID"
    from public."LLMCallAttemptLog" l
    where l."RegDate" < v_cutoff
    order by l."RegDate" asc, l."LogID" asc
    limit v_log_batch
  )
  delete from public."LLMCallAttemptLog" l
  using doomed_attempts d
  where l."LogID" = d."LogID";
  get diagnostics v_attempt_count = row_count;

  with doomed_tokens as (
    select th."HistoryID", th."SerialNo"
    from public."LLMTokenHistory" th
    where th."RegDate" < v_cutoff
    order by th."RegDate" asc, th."HistoryID" asc
    limit v_log_batch
  )
  delete from public."LLMTokenHistory" th
  using doomed_tokens d
  where th."HistoryID" = d."HistoryID"
    and th."SerialNo" = d."SerialNo";
  get diagnostics v_token_count = row_count;

  select coalesce(array_agg(s."SessionID"), '{}'::bigint[])
  into v_session_ids
  from (
    select cs."SessionID"
    from public."ChatSession" cs
    where cs."UpdateDate" < v_cutoff
    order by cs."UpdateDate" asc
    limit v_batch
  ) s;

  if coalesce(cardinality(v_session_ids), 0) > 0 then
    delete from public."ChatMessage" cm
    where cm."SessionID" = any (v_session_ids);
    get diagnostics v_msg_count = row_count;

    delete from public."ChatSession" cs
    where cs."SessionID" = any (v_session_ids);
    get diagnostics v_sess_count = row_count;
  end if;

  return jsonb_build_object(
    'ran', true,
    'reason', case
      when v_attempt_count = 0 and v_token_count = 0 and v_sess_count = 0
        then 'nothing_to_delete'
      else 'ok'
    end,
    'retention_days', v_days,
    'cutoff', v_cutoff,
    'deleted_sessions', v_sess_count,
    'deleted_messages', v_msg_count,
    'deleted_attempt_logs', v_attempt_count,
    'deleted_token_history', v_token_count,
    'batch_size', v_batch,
    'log_batch_size', v_log_batch
  );
end;
$$;

comment on function public.nrm_rpc_ailab_chat_retention_run(integer) is
  'AI Lab: retention_days보다 오래된 ChatMessage+ChatSession(UpdateDate)과 LLMCallAttemptLog·LLMTokenHistory(RegDate) 물리 삭제.';
