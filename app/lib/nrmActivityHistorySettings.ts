import AsyncStorage from '@react-native-async-storage/async-storage';

export const NRM_ACTIVITY_HISTORY_DISPLAY_OPTIONS = [
  { id: '0', label: '사용안함', description: '', icon: 'eye-off-outline' as const },
  { id: '7', label: '7일', description: '', icon: 'time-outline' as const },
  { id: '30', label: '30일', description: '', icon: 'calendar-outline' as const },
  { id: '90', label: '90일', description: '', icon: 'calendar-outline' as const },
  { id: '180', label: '180일', description: '', icon: 'calendar-outline' as const },
] as const;

export type NrmActivityHistoryDisplayDays =
  (typeof NRM_ACTIVITY_HISTORY_DISPLAY_OPTIONS)[number]['id'];

const STORAGE_KEY = 'nrm_activity_history_display_days_v1';

export const DEFAULT_ACTIVITY_HISTORY_DISPLAY_DAYS: NrmActivityHistoryDisplayDays = '7';

export function isNrmActivityHistoryDisplayDays(v: string): v is NrmActivityHistoryDisplayDays {
  return NRM_ACTIVITY_HISTORY_DISPLAY_OPTIONS.some((o) => o.id === v);
}

export function activityHistoryDisplayDaysToNumber(days: NrmActivityHistoryDisplayDays): number {
  return Number(days);
}

export function activityHistoryDisplaySubtitle(days: NrmActivityHistoryDisplayDays): string {
  if (days === '0') return 'History 표시가 꺼져 있습니다';
  return `최근 ${days}일 다운로드·가사생성`;
}

export async function loadActivityHistoryDisplayDays(): Promise<NrmActivityHistoryDisplayDays> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw && isNrmActivityHistoryDisplayDays(raw)) return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_ACTIVITY_HISTORY_DISPLAY_DAYS;
}

export async function saveActivityHistoryDisplayDays(
  days: NrmActivityHistoryDisplayDays,
): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, days);
}

type DisplayDaysListener = (days: NrmActivityHistoryDisplayDays) => void;

let displayDaysListener: DisplayDaysListener | null = null;
let cachedDisplayDays: NrmActivityHistoryDisplayDays | null = null;

export function registerActivityHistoryDisplayListener(fn: DisplayDaysListener | null): void {
  displayDaysListener = fn;
}

export function notifyActivityHistoryDisplayChanged(days: NrmActivityHistoryDisplayDays): void {
  cachedDisplayDays = days;
  displayDaysListener?.(days);
}

/** 메모리 캐시 — History 화면·설정 패널에서 반복 로드 방지 */
export async function peekActivityHistoryDisplayDays(): Promise<NrmActivityHistoryDisplayDays> {
  if (cachedDisplayDays) return cachedDisplayDays;
  const loaded = await loadActivityHistoryDisplayDays();
  cachedDisplayDays = loaded;
  return loaded;
}

export function primeActivityHistoryDisplayDays(days: NrmActivityHistoryDisplayDays): void {
  cachedDisplayDays = days;
}
