import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  activityHistoryDisplayDaysToNumber,
  loadActivityHistoryDisplayDays,
  peekActivityHistoryDisplayDays,
  type NrmActivityHistoryDisplayDays,
} from '@/lib/nrmActivityHistorySettings';

export type NrmActivityHistoryKind = 'download' | 'lyrics' | 'lyrics_translation';

export type NrmActivityHistoryEntry = {
  id: string;
  fileName: string;
  kind: NrmActivityHistoryKind;
  createdAt: number;
};

const STORAGE_KEY = 'nrm_activity_history_v1';
/** UI와 무관하게 내부 저장 보존 기간 — 180일 */
const INTERNAL_RETENTION_MS = 180 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 2000;

let cachedEntries: NrmActivityHistoryEntry[] | null = null;
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 30_000;

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function pruneInternal(entries: NrmActivityHistoryEntry[]): NrmActivityHistoryEntry[] {
  const cutoff = Date.now() - INTERNAL_RETENTION_MS;
  return entries
    .filter((e) => e.createdAt >= cutoff)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_ENTRIES);
}

function invalidateEntryCache(): void {
  cachedEntries = null;
  cacheLoadedAt = 0;
}

async function loadAllEntries(force = false): Promise<NrmActivityHistoryEntry[]> {
  const fresh = cachedEntries && Date.now() - cacheLoadedAt < CACHE_TTL_MS;
  if (!force && fresh && cachedEntries) return cachedEntries;

  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed: NrmActivityHistoryEntry[] = raw ? (JSON.parse(raw) as NrmActivityHistoryEntry[]) : [];
    const pruned = pruneInternal(parsed);
    if (pruned.length !== parsed.length) {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
    }
    cachedEntries = pruned;
    cacheLoadedAt = Date.now();
    return pruned;
  } catch {
    cachedEntries = [];
    cacheLoadedAt = Date.now();
    return [];
  }
}

function filterForDisplayDays(
  entries: NrmActivityHistoryEntry[],
  displayDays: NrmActivityHistoryDisplayDays,
): NrmActivityHistoryEntry[] {
  const days = activityHistoryDisplayDaysToNumber(displayDays);
  if (days <= 0) return [];
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return entries.filter((e) => e.createdAt >= cutoff);
}

export function formatActivityHistoryLabel(entry: NrmActivityHistoryEntry): string {
  const base = entry.fileName.trim();
  switch (entry.kind) {
    case 'download':
      return `${base} 다운로드`;
    case 'lyrics_translation':
      return `${base} 가사생성(번역지원)`;
    case 'lyrics':
    default:
      return `${base} 가사생성`;
  }
}

export async function appendActivityHistory(
  entry: Pick<NrmActivityHistoryEntry, 'fileName' | 'kind'> & { createdAt?: number },
): Promise<void> {
  try {
    const prev = await loadAllEntries(true);
    const next = pruneInternal([
      {
        id: newId(),
        fileName: entry.fileName,
        kind: entry.kind,
        createdAt: entry.createdAt ?? Date.now(),
      },
      ...prev,
    ]);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    cachedEntries = next;
    cacheLoadedAt = Date.now();
  } catch {
    invalidateEntryCache();
  }
}

/** History 탭 — 설정된 표시 기간만큼만 반환 (내부 저장은 항상 최대 180일) */
export async function listActivityHistoryForDisplay(
  displayDays?: NrmActivityHistoryDisplayDays,
): Promise<NrmActivityHistoryEntry[]> {
  const days = displayDays ?? (await loadActivityHistoryDisplayDays());
  const entries = await loadAllEntries();
  return filterForDisplayDays(entries, days);
}

/** 캐시된 설정 + 엔트리로 History 목록 (화면 초기 렌더 가속) */
export async function peekActivityHistoryForDisplay(): Promise<{
  displayDays: NrmActivityHistoryDisplayDays;
  items: NrmActivityHistoryEntry[];
}> {
  const displayDays = await peekActivityHistoryDisplayDays();
  const entries = await loadAllEntries();
  return {
    displayDays,
    items: filterForDisplayDays(entries, displayDays),
  };
}

export function invalidateActivityHistoryCache(): void {
  invalidateEntryCache();
}

/** @deprecated listActivityHistoryForDisplay 사용 */
export async function listActivityHistoryLastWeek(): Promise<NrmActivityHistoryEntry[]> {
  return listActivityHistoryForDisplay('7');
}
