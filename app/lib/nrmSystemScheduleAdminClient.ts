/** 공통 시스템 스케줄 관리자 RPC 클라이언트. 신규/삭제는 불가 — on/off·편집만. */
import { getNrmAppSerialNo } from '@/lib/nrmAppSerialNo';
import { nrmSbRpc } from '@/lib/nrmSupabaseCrud';
import type {
  NrmSupabaseMusicCollectionScheduleRow,
  NrmSupabaseSystemScheduleRow,
} from '@/lib/nrmSupabaseDatabase.types';

export type NrmSystemScheduleJobKind =
  | 'musicbrainz_collection'
  | 'ailab_chat_retention'
  | 'track_history_retention';

export type NrmSystemScheduleChatUpdatePayload = {
  schedule_kind: 'daily' | 'interval';
  daily_time_kst: string | null;
  interval_minutes: number | null;
  is_enabled: boolean;
  retention_days: number;
};

/** MusicBrainz 수집 스케줄은 실행 주기·on/off만 앱에서 편집한다. */
export type NrmSystemScheduleMusicUpdatePayload = {
  schedule_kind: 'daily' | 'interval';
  daily_time_kst: string | null;
  interval_minutes: number | null;
  is_enabled: boolean;
};

async function callerSerial(): Promise<string> {
  const serial = (await getNrmAppSerialNo()).trim();
  if (!serial) throw new Error('관리자 기기 Serial Number를 확인할 수 없습니다.');
  return serial;
}

function mapJobKind(raw: unknown): NrmSystemScheduleJobKind {
  if (raw === 'ailab_chat_retention') return 'ailab_chat_retention';
  if (raw === 'track_history_retention') return 'track_history_retention';
  return 'musicbrainz_collection';
}

function mapSystemScheduleRow(raw: Record<string, unknown>): NrmSupabaseSystemScheduleRow {
  const music = raw.music_schedule;
  return {
    schedule_id: String(raw.schedule_id ?? ''),
    schedule_key: String(raw.schedule_key ?? ''),
    display_name: String(raw.display_name ?? ''),
    job_kind: mapJobKind(raw.job_kind),
    is_enabled: Boolean(raw.is_enabled),
    schedule_kind: raw.schedule_kind === 'interval' ? 'interval' : 'daily',
    daily_time_kst: raw.daily_time_kst == null ? null : String(raw.daily_time_kst),
    interval_minutes:
      raw.interval_minutes == null || raw.interval_minutes === ''
        ? null
        : Number(raw.interval_minutes),
    next_run_at: String(raw.next_run_at ?? ''),
    config:
      raw.config && typeof raw.config === 'object' && !Array.isArray(raw.config)
        ? (raw.config as Record<string, unknown>)
        : {},
    created_at: String(raw.created_at ?? ''),
    updated_at: String(raw.updated_at ?? ''),
    retention_days:
      raw.retention_days == null || raw.retention_days === ''
        ? null
        : Number(raw.retention_days),
    music_schedule:
      music && typeof music === 'object' && !Array.isArray(music)
        ? (music as NrmSupabaseMusicCollectionScheduleRow)
        : null,
  };
}

export async function fetchSystemSchedules(
  limit = 50,
  offset = 0,
): Promise<NrmSupabaseSystemScheduleRow[]> {
  const raw = await nrmSbRpc<unknown>('nrm_rpc_system_schedule_list', {
    p_caller_serial: await callerSerial(),
    p_limit: Math.min(200, Math.max(1, Math.trunc(limit))),
    p_offset: Math.max(0, Math.trunc(offset)),
  });
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map(mapSystemScheduleRow);
}

export async function fetchAllSystemSchedules(): Promise<NrmSupabaseSystemScheduleRow[]> {
  const rows: NrmSupabaseSystemScheduleRow[] = [];
  for (let offset = 0; ; offset += 200) {
    const page = await fetchSystemSchedules(200, offset);
    rows.push(...page);
    if (page.length < 200) return rows;
    if (offset >= 9800) throw new Error('시스템 스케줄 수가 조회 안전 한도를 초과했습니다.');
  }
}

export async function setSystemScheduleEnabled(
  scheduleId: string,
  enabled: boolean,
): Promise<boolean> {
  return nrmSbRpc<boolean>('nrm_rpc_system_schedule_set_enabled', {
    p_caller_serial: await callerSerial(),
    p_schedule_id: scheduleId,
    p_enabled: enabled,
  });
}

export async function updateSystemSchedule(
  scheduleId: string,
  payload: NrmSystemScheduleChatUpdatePayload | NrmSystemScheduleMusicUpdatePayload,
): Promise<string> {
  return nrmSbRpc<string>('nrm_rpc_system_schedule_update', {
    p_caller_serial: await callerSerial(),
    p_schedule_id: scheduleId,
    p_payload: payload,
  });
}

export async function runSystemScheduleNow(scheduleId: string): Promise<boolean> {
  return nrmSbRpc<boolean>('nrm_rpc_system_schedule_run_now', {
    p_caller_serial: await callerSerial(),
    p_schedule_id: scheduleId,
  });
}

export function jobKindLabel(kind: NrmSystemScheduleJobKind): string {
  switch (kind) {
    case 'ailab_chat_retention':
      return 'AI Lab 채팅 삭제';
    case 'track_history_retention':
      return 'Track History 삭제';
    case 'musicbrainz_collection':
      return 'MusicBrainz 수집';
    default:
      return kind;
  }
}
