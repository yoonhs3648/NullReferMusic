import { getNrmAppSerialNo } from '@/lib/nrmAppSerialNo';
import { nrmSbRpc } from '@/lib/nrmSupabaseCrud';
import type {
  NrmSupabaseMusicArtistAllowlistRow,
  NrmSupabaseMusicAdminOverview,
  NrmSupabaseMusicAdminQueueDueSchedule,
  NrmSupabaseMusicAdminQueueOpenJob,
  NrmSupabaseMusicCollectionScheduleRow,
  NrmSupabaseMusicDeadLetterRow,
  NrmSupabaseMusicScheduleRunErrors,
  NrmSupabaseMusicScheduleRunFailureRow,
  NrmSupabaseMusicScheduleRunInsertRow,
  NrmSupabaseMusicScheduleRunJobCount,
  NrmSupabaseMusicScheduleRunRow,
} from '@/lib/nrmSupabaseDatabase.types';

export type NrmMusicSchedulePayload = {
  schedule_key: string;
  display_name: string;
  schedule_kind: 'daily' | 'weekly' | 'monthly' | 'once' | 'interval';
  daily_time_kst: string | null;
  interval_minutes: number | null;
  weekly_weekday?: number | null;
  monthly_day?: number | null;
  once_on_date?: string | null;
  next_run_at: string;
  is_enabled: boolean;
  date_from_offset_days: number;
  date_to_offset_days: number;
  country_codes: string[];
  primary_types: string[];
  secondary_types: string[];
  release_statuses: string[];
  max_artist_count: number;
  max_request_count: number;
  max_new_recording_count: number;
  priority: number;
};

export type NrmMusicAllowlistPayload = {
  artist_mbid: string;
  display_name: string;
  cohort: string;
  priority: number;
  is_pinned: boolean;
  is_enabled: boolean;
  verified_at: string | null;
  selection_note: string | null;
  artist_id: string | null;
};

export type NrmMusicAdminOverview = {
  schedules: NrmSupabaseMusicCollectionScheduleRow[];
  allowlistCount: number;
  pendingJobs: number;
  collectionBusy: boolean;
  dueSchedules: NrmSupabaseMusicAdminQueueDueSchedule[];
  openJobs: NrmSupabaseMusicAdminQueueOpenJob[];
  runningRuns: NrmSupabaseMusicScheduleRunRow[];
  completedRuns: NrmSupabaseMusicScheduleRunRow[];
  failureRuns: NrmSupabaseMusicScheduleRunRow[];
  capacity: NrmSupabaseMusicAdminOverview['capacity'];
};

export type NrmMusicAdminPage<T> = {
  items: T[];
  total: number;
};

async function callerSerial(): Promise<string> {
  const serial = (await getNrmAppSerialNo()).trim();
  if (!serial) throw new Error('관리자 기기 Serial Number를 확인할 수 없습니다.');
  return serial;
}

function asRunRows(value: unknown): NrmSupabaseMusicScheduleRunRow[] {
  return Array.isArray(value) ? (value as NrmSupabaseMusicScheduleRunRow[]) : [];
}

export async function fetchMusicSyncAdminOverview(
  limit = 20,
  offset = 0,
): Promise<NrmMusicAdminOverview> {
  const raw = await nrmSbRpc<NrmSupabaseMusicAdminOverview>(
    'music_rpc_admin_overview',
    {
      p_caller_serial: await callerSerial(),
      p_limit: Math.min(200, Math.max(1, Math.trunc(limit))),
      p_offset: Math.max(0, Math.trunc(offset)),
    },
  );
  const legacyRuns = asRunRows(raw?.recent_runs);
  const hasSplit =
    raw != null &&
    (raw.running_runs !== undefined ||
      raw.completed_runs !== undefined ||
      raw.failure_runs !== undefined);
  return {
    schedules: Array.isArray(raw?.schedules) ? raw.schedules : [],
    allowlistCount: Number(raw?.allowlist_count ?? 0),
    pendingJobs: Number(raw?.pending_jobs ?? 0),
    collectionBusy: Boolean(raw?.collection_busy),
    dueSchedules: Array.isArray(raw?.queue?.due_schedules) ? raw.queue.due_schedules : [],
    openJobs: Array.isArray(raw?.queue?.open_jobs) ? raw.queue.open_jobs : [],
    runningRuns: hasSplit
      ? asRunRows(raw?.running_runs)
      : legacyRuns.filter((run) => run.run_status === 'running'),
    completedRuns: hasSplit
      ? asRunRows(raw?.completed_runs)
      : legacyRuns.filter((run) => run.run_status === 'completed'),
    failureRuns: hasSplit
      ? asRunRows(raw?.failure_runs)
      : legacyRuns.filter(
          (run) =>
            run.run_status === 'partial' ||
            run.run_status === 'failed' ||
            run.run_status === 'cancelled',
        ),
    capacity: raw?.capacity ?? null,
  };
}

export async function fetchMusicScheduleRunInserts(
  scheduleRunId: string,
  limit = 50,
  offset = 0,
): Promise<NrmMusicAdminPage<NrmSupabaseMusicScheduleRunInsertRow>> {
  const raw = await nrmSbRpc<{
    items?: NrmSupabaseMusicScheduleRunInsertRow[];
    total?: number;
  }>('music_rpc_admin_schedule_run_inserts', {
    p_caller_serial: await callerSerial(),
    p_schedule_run_id: scheduleRunId,
    p_limit: Math.min(200, Math.max(1, Math.trunc(limit))),
    p_offset: Math.max(0, Math.trunc(offset)),
  });
  return {
    items: Array.isArray(raw?.items) ? raw.items : [],
    total: Number(raw?.total ?? 0),
  };
}

export async function fetchMusicScheduleRunFailures(
  scheduleRunId: string,
  limit = 50,
  offset = 0,
): Promise<NrmMusicAdminPage<NrmSupabaseMusicScheduleRunFailureRow>> {
  const raw = await nrmSbRpc<{
    items?: NrmSupabaseMusicScheduleRunFailureRow[];
    total?: number;
  }>('music_rpc_admin_schedule_run_failures', {
    p_caller_serial: await callerSerial(),
    p_schedule_run_id: scheduleRunId,
    p_limit: Math.min(200, Math.max(1, Math.trunc(limit))),
    p_offset: Math.max(0, Math.trunc(offset)),
  });
  return {
    items: Array.isArray(raw?.items)
      ? raw.items.map((item) => ({
          ...item,
          job_status: typeof item.job_status === 'string' ? item.job_status : '',
        }))
      : [],
    total: Number(raw?.total ?? 0),
  };
}

export async function fetchMusicScheduleRunJobs(
  scheduleRunId: string,
): Promise<NrmSupabaseMusicScheduleRunJobCount[]> {
  const raw = await nrmSbRpc<{ items?: NrmSupabaseMusicScheduleRunJobCount[] }>(
    'music_rpc_admin_schedule_run_jobs',
    {
      p_caller_serial: await callerSerial(),
      p_schedule_run_id: scheduleRunId,
    },
  );
  return Array.isArray(raw?.items) ? raw.items : [];
}

export async function fetchMusicScheduleRunErrors(
  scheduleRunId: string,
): Promise<NrmSupabaseMusicScheduleRunErrors> {
  const raw = await nrmSbRpc<NrmSupabaseMusicScheduleRunErrors>(
    'music_rpc_admin_schedule_run_errors',
    {
      p_caller_serial: await callerSerial(),
      p_schedule_run_id: scheduleRunId,
    },
  );
  return {
    error_message: raw?.error_message ?? null,
    failure_count: Number(raw?.failure_count ?? 0),
    job_errors: Array.isArray(raw?.job_errors) ? raw.job_errors : [],
    dead_letters: Array.isArray(raw?.dead_letters) ? raw.dead_letters : [],
  };
}

/** master toggle용 전체 스케줄 조회. RPC 상한(200)을 페이지 단위로 반복한다. */
export async function fetchAllMusicSyncAdminSchedules(): Promise<
  NrmSupabaseMusicCollectionScheduleRow[]
> {
  const rows: NrmSupabaseMusicCollectionScheduleRow[] = [];
  for (let offset = 0; ; offset += 200) {
    const page = await fetchMusicSyncAdminOverview(200, offset);
    rows.push(...page.schedules);
    if (page.schedules.length < 200) return rows;
    if (offset >= 9800) throw new Error('스케줄 수가 조회 안전 한도를 초과했습니다.');
  }
}

/** 기존 스케줄 수정만 허용. 신규 생성은 마이그레이션 seed 전용. */
export async function upsertMusicSchedule(
  scheduleId: string,
  payload: NrmMusicSchedulePayload,
): Promise<string> {
  return nrmSbRpc<string>('music_rpc_admin_schedule_upsert', {
    p_caller_serial: await callerSerial(),
    p_schedule_id: scheduleId,
    p_payload: payload,
  });
}

export async function setMusicScheduleEnabled(
  scheduleId: string,
  enabled: boolean,
): Promise<boolean> {
  return nrmSbRpc<boolean>('music_rpc_admin_schedule_set_enabled', {
    p_caller_serial: await callerSerial(),
    p_schedule_id: scheduleId,
    p_enabled: enabled,
  });
}

export async function runMusicScheduleNow(scheduleId: string): Promise<boolean> {
  return nrmSbRpc<boolean>('music_rpc_admin_schedule_run_now', {
    p_caller_serial: await callerSerial(),
    p_schedule_id: scheduleId,
  });
}

export async function upsertMusicAllowlistArtist(
  payload: NrmMusicAllowlistPayload,
): Promise<string> {
  return nrmSbRpc<string>('music_rpc_admin_allowlist_upsert', {
    p_caller_serial: await callerSerial(),
    p_payload: payload,
  });
}

export async function setMusicAllowlistArtistEnabled(
  artistMbid: string,
  enabled: boolean,
): Promise<boolean> {
  return nrmSbRpc<boolean>('music_rpc_admin_allowlist_set_enabled', {
    p_caller_serial: await callerSerial(),
    p_artist_mbid: artistMbid,
    p_enabled: enabled,
  });
}

export async function fetchMusicAllowlistPage(
  search: string,
  limit = 20,
  offset = 0,
): Promise<NrmMusicAdminPage<NrmSupabaseMusicArtistAllowlistRow>> {
  const raw = await nrmSbRpc<{
    items?: NrmSupabaseMusicArtistAllowlistRow[];
    total?: number;
  }>('music_rpc_admin_allowlist_page', {
    p_caller_serial: await callerSerial(),
    p_search: search.trim() || null,
    p_limit: Math.min(200, Math.max(1, Math.trunc(limit))),
    p_offset: Math.max(0, Math.trunc(offset)),
  });
  return {
    items: Array.isArray(raw?.items) ? raw.items : [],
    total: Number(raw?.total ?? 0),
  };
}

export async function fetchMusicDeadLetterPage(
  unresolvedOnly = true,
  limit = 20,
  offset = 0,
): Promise<NrmMusicAdminPage<NrmSupabaseMusicDeadLetterRow>> {
  const raw = await nrmSbRpc<{
    items?: NrmSupabaseMusicDeadLetterRow[];
    total?: number;
  }>('music_rpc_admin_dead_letter_page', {
    p_caller_serial: await callerSerial(),
    p_unresolved_only: unresolvedOnly,
    p_limit: Math.min(200, Math.max(1, Math.trunc(limit))),
    p_offset: Math.max(0, Math.trunc(offset)),
  });
  return {
    items: Array.isArray(raw?.items) ? raw.items : [],
    total: Number(raw?.total ?? 0),
  };
}

export async function resolveMusicDeadLetter(
  deadLetterId: string,
  resolutionNote: string,
): Promise<boolean> {
  return nrmSbRpc<boolean>('music_rpc_admin_dead_letter_resolve', {
    p_caller_serial: await callerSerial(),
    p_dead_letter_id: deadLetterId,
    p_resolution_note: resolutionNote.trim(),
  });
}

export async function retryMusicDeadLetter(
  deadLetterId: string,
  resolutionNote: string,
): Promise<boolean> {
  return nrmSbRpc<boolean>('music_rpc_admin_dead_letter_retry', {
    p_caller_serial: await callerSerial(),
    p_dead_letter_id: deadLetterId,
    p_resolution_note: resolutionNote.trim(),
  });
}

export function musicScheduleToPayload(
  row: NrmSupabaseMusicCollectionScheduleRow,
): NrmMusicSchedulePayload {
  return {
    schedule_key: row.schedule_key,
    display_name: row.display_name,
    schedule_kind: row.schedule_kind,
    daily_time_kst: row.schedule_kind === 'interval' ? null : row.daily_time_kst,
    interval_minutes: row.schedule_kind === 'interval' ? (row.interval_minutes ?? 60) : null,
    weekly_weekday: row.schedule_kind === 'weekly' ? (row.weekly_weekday ?? 0) : null,
    monthly_day: row.schedule_kind === 'monthly' ? (row.monthly_day ?? 1) : null,
    once_on_date: row.schedule_kind === 'once' ? (row.once_on_date ?? null) : null,
    next_run_at: row.next_run_at,
    is_enabled: row.is_enabled,
    date_from_offset_days: row.date_from_offset_days,
    date_to_offset_days: row.date_to_offset_days,
    country_codes: row.country_codes ?? [],
    primary_types: row.primary_types ?? [],
    secondary_types: row.secondary_types ?? [],
    release_statuses: row.release_statuses ?? [],
    max_artist_count: row.max_artist_count,
    max_request_count: row.max_request_count,
    max_new_recording_count: row.max_new_recording_count,
    priority: row.priority,
  };
}
