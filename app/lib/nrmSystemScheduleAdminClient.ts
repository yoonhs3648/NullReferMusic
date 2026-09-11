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
  | 'track_history_retention'
  | 'ops_cleanup';

export type NrmSystemScheduleKind = 'daily' | 'weekly' | 'monthly' | 'once' | 'interval';

export type NrmSystemScheduleTimingPayload = {
  schedule_kind: NrmSystemScheduleKind;
  daily_time_kst: string | null;
  interval_minutes?: number | null;
  weekly_weekday?: number | null;
  monthly_day?: number | null;
  once_on_date?: string | null;
  is_enabled: boolean;
};

export type NrmSystemScheduleChatUpdatePayload = NrmSystemScheduleTimingPayload & {
  retention_days: number;
};

/** MusicBrainz 수집 스케줄은 실행 주기·on/off만 앱에서 편집한다. */
export type NrmSystemScheduleMusicUpdatePayload = NrmSystemScheduleTimingPayload;

async function callerSerial(): Promise<string> {
  const serial = (await getNrmAppSerialNo()).trim();
  if (!serial) throw new Error('관리자 기기 Serial Number를 확인할 수 없습니다.');
  return serial;
}

function mapJobKind(raw: unknown): NrmSystemScheduleJobKind {
  if (raw === 'ailab_chat_retention') return 'ailab_chat_retention';
  if (raw === 'track_history_retention') return 'track_history_retention';
  if (raw === 'ops_cleanup') return 'ops_cleanup';
  return 'musicbrainz_collection';
}

function mapScheduleKind(raw: unknown): NrmSystemScheduleKind {
  if (raw === 'weekly') return 'weekly';
  if (raw === 'monthly') return 'monthly';
  if (raw === 'once') return 'once';
  if (raw === 'interval') return 'interval';
  return 'daily';
}

function mapIntervalMinutes(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 10080) return null;
  return value;
}

function mapWeeklyWeekday(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 6) return null;
  return value;
}

function mapMonthlyDay(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 31) return null;
  return value;
}

function mapOnceOnDate(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  const value = String(raw);
  const ymd = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : null;
}

function mapSystemScheduleRow(raw: Record<string, unknown>): NrmSupabaseSystemScheduleRow {
  const music = raw.music_schedule;
  return {
    schedule_id: String(raw.schedule_id ?? ''),
    schedule_key: String(raw.schedule_key ?? ''),
    display_name: String(raw.display_name ?? ''),
    job_kind: mapJobKind(raw.job_kind),
    is_enabled: Boolean(raw.is_enabled),
    schedule_kind: mapScheduleKind(raw.schedule_kind),
    daily_time_kst: raw.daily_time_kst == null ? null : String(raw.daily_time_kst),
    interval_minutes: mapIntervalMinutes(
      raw.interval_minutes ??
        (music && typeof music === 'object' && !Array.isArray(music)
          ? (music as Record<string, unknown>).interval_minutes
          : null),
    ),
    weekly_weekday: mapWeeklyWeekday(
      raw.weekly_weekday ??
        (music && typeof music === 'object' && !Array.isArray(music)
          ? (music as Record<string, unknown>).weekly_weekday
          : null),
    ),
    monthly_day: mapMonthlyDay(
      raw.monthly_day ??
        (music && typeof music === 'object' && !Array.isArray(music)
          ? (music as Record<string, unknown>).monthly_day
          : null),
    ),
    once_on_date: mapOnceOnDate(
      raw.once_on_date ??
        (music && typeof music === 'object' && !Array.isArray(music)
          ? (music as Record<string, unknown>).once_on_date
          : null),
    ),
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
    case 'ops_cleanup':
      return '운영 데이터 정리';
    case 'musicbrainz_collection':
      return 'MusicBrainz 수집';
    default:
      return kind;
  }
}
