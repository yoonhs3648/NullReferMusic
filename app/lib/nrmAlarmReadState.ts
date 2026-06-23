import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'nrm_alarm_read_ids_v1';
const MAX_READ_IDS = 400;

let cachedReadIds: Set<number> | null = null;

async function loadReadIdSet(): Promise<Set<number>> {
  if (cachedReadIds) return new Set(cachedReadIds);
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        cachedReadIds = new Set(
          parsed.filter((v): v is number => typeof v === 'number' && Number.isFinite(v)),
        );
        return new Set(cachedReadIds);
      }
    }
  } catch {
    /* ignore */
  }
  cachedReadIds = new Set();
  return new Set();
}

async function persistReadIdSet(ids: Set<number>): Promise<void> {
  cachedReadIds = new Set(ids);
  const arr = [...ids].sort((a, b) => a - b);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
}

export async function isAlarmRead(id: number): Promise<boolean> {
  const ids = await loadReadIdSet();
  return ids.has(id);
}

export async function markAlarmRead(id: number): Promise<boolean> {
  const ids = await loadReadIdSet();
  if (ids.has(id)) return false;
  ids.add(id);
  if (ids.size > MAX_READ_IDS) {
    const trimmed = [...ids].sort((a, b) => a - b).slice(-MAX_READ_IDS);
    ids.clear();
    for (const n of trimmed) ids.add(n);
  }
  await persistReadIdSet(ids);
  return true;
}

/** 현재 알림 목록에 없는 읽음 id는 제거해 저장 공간을 줄임 */
export async function pruneAlarmReadIds(activeIds: Iterable<number>): Promise<void> {
  const active = new Set(activeIds);
  const ids = await loadReadIdSet();
  let changed = false;
  for (const id of ids) {
    if (!active.has(id)) {
      ids.delete(id);
      changed = true;
    }
  }
  if (changed) await persistReadIdSet(ids);
}

export async function countUnreadAlarmIds(ids: Iterable<number>): Promise<number> {
  const read = await loadReadIdSet();
  let n = 0;
  for (const id of ids) {
    if (!read.has(id)) n += 1;
  }
  return n;
}

export async function peekReadAlarmIds(): Promise<Set<number>> {
  return loadReadIdSet();
}

export function invalidateAlarmReadCache(): void {
  cachedReadIds = null;
}
