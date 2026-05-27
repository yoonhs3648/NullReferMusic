import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'nrmWeeklySnapshotDay_v1';

/** 0=일 … 6=토 (UTC, Spotify 주간 스냅샷 요일) */
export type WeeklySnapshotDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const DEFAULT_WEEKLY_SNAPSHOT_DAY: WeeklySnapshotDay = 4;

export const WEEKLY_SNAPSHOT_DAY_OPTIONS: { value: WeeklySnapshotDay; label: string }[] = [
  { value: 0, label: '일' },
  { value: 1, label: '월' },
  { value: 2, label: '화' },
  { value: 3, label: '수' },
  { value: 4, label: '목' },
  { value: 5, label: '금' },
  { value: 6, label: '토' },
];

export function weeklySnapshotDayLabel(day: number): string {
  return WEEKLY_SNAPSHOT_DAY_OPTIONS.find((o) => o.value === day)?.label ?? '목';
}

export function clampWeeklySnapshotDay(raw: unknown): WeeklySnapshotDay {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (Number.isFinite(n) && n >= 0 && n <= 6) {
    return Math.floor(n) as WeeklySnapshotDay;
  }
  return DEFAULT_WEEKLY_SNAPSHOT_DAY;
}

export async function loadWeeklySnapshotDay(): Promise<WeeklySnapshotDay> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw == null) return DEFAULT_WEEKLY_SNAPSHOT_DAY;
    return clampWeeklySnapshotDay(JSON.parse(raw));
  } catch {
    return DEFAULT_WEEKLY_SNAPSHOT_DAY;
  }
}

export async function saveWeeklySnapshotDay(day: WeeklySnapshotDay): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(clampWeeklySnapshotDay(day)));
}
