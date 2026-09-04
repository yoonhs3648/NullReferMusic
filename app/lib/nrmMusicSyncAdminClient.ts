import { getNrmAppSerialNo } from '@/lib/nrmAppSerialNo';
import { nrmSbRpc } from '@/lib/nrmSupabaseCrud';
import type {
  NrmSupabaseMusicArtistAllowlistRow,
  NrmSupabaseMusicAdminOverview,
  NrmSupabaseMusicCollectionScheduleRow,
  NrmSupabaseMusicDeadLetterRow,
  NrmSupabaseMusicScheduleRunRow,
} from '@/lib/nrmSupabaseDatabase.types';

export type NrmMusicSchedulePayload = {
  schedule_key: string;
  display_name: string;
  schedule_kind: 'daily' | 'interval';
  daily_time_kst: string | null;
  interval_minutes: number | null;
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
  recentRuns: NrmSupabaseMusicScheduleRunRow[];
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
  return {
    schedules: Array.isArray(raw?.schedules) ? raw.schedules : [],
    allowlistCount: Number(raw?.allowlist_count ?? 0),
    pendingJobs: Number(raw?.pending_jobs ?? 0),
    recentRuns: Array.isArray(raw?.recent_runs) ? raw.recent_runs : [],
    capacity: raw?.capacity ?? null,
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
    daily_time_kst: row.schedule_kind === 'daily' ? row.daily_time_kst : null,
    interval_minutes: row.schedule_kind === 'interval' ? row.interval_minutes : null,
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
