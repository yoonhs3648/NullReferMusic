import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  activityHistoryDisplayDaysToNumber,
  loadActivityHistoryDisplayDays,
  peekActivityHistoryDisplayDays,
  type NrmActivityHistoryDisplayDays,
} from '@/lib/nrmActivityHistorySettings';
import { displayLabelFromAudioFileName } from '@/lib/nrmYoutubeDownloadMeta';

export type NrmActivityHistoryKind =
  | 'download'
  | 'lyrics'
  | 'lyrics_translation'
  | 'metadata_edit'
  | 'lyrics_remove'
  | 'lyrics_add_translation'
  | 'lyrics_remove_translation'
  | 'track_remove';

export type NrmActivityHistoryEntry = {
  id: string;
  /** 저장 시점 파일명(확장자 포함 가능) — 표시 시 `가수 - 제목`으로 정규화 */
  fileName: string;
  /** Storage·History에서 트랙 재오픈용 (리네임 후에도 추적) */
  audioUri?: string;
  kind: NrmActivityHistoryKind;
  createdAt: number;
};

export type NrmActivityHistorySection = {
  title: string;
  data: NrmActivityHistoryEntry[];
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

function historyTrackLabel(rawFileName: string): string {
  const v = rawFileName.trim();
  if (!v || v.startsWith('저장했습니다')) return v;
  return displayLabelFromAudioFileName(v);
}

export function formatActivityHistoryLabel(entry: NrmActivityHistoryEntry): string {
  const base = historyTrackLabel(entry.fileName);
  switch (entry.kind) {
    case 'download':
      return `${base} 저장`;
    case 'lyrics_translation':
      return `${base} 가사 생성(번역지원)`;
    case 'metadata_edit':
      return `${base} 메타데이터 수정`;
    case 'lyrics_remove':
      return `${base} 가사 제거`;
    case 'lyrics_add_translation':
      return `${base} 가사 번역지원`;
    case 'lyrics_remove_translation':
      return `${base} 가사 번역제거`;
    case 'track_remove':
      return `${base} 제거`;
    case 'lyrics':
    default:
      return `${base} 가사 생성`;
  }
}

export function activityHistoryDateKey(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatActivityHistoryTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function groupActivityHistoryByDate(
  items: NrmActivityHistoryEntry[],
): NrmActivityHistorySection[] {
  const map = new Map<string, NrmActivityHistoryEntry[]>();
  for (const item of items) {
    const key = activityHistoryDateKey(item.createdAt);
    const bucket = map.get(key);
    if (bucket) bucket.push(item);
    else map.set(key, [item]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([title, data]) => ({ title, data }));
}

export async function appendActivityHistory(
  entry: Pick<NrmActivityHistoryEntry, 'fileName' | 'kind' | 'audioUri'> & {
    createdAt?: number;
  },
): Promise<void> {
  try {
    const prev = await loadAllEntries(true);
    const next = pruneInternal([
      {
        id: newId(),
        fileName: entry.fileName,
        audioUri: entry.audioUri,
        kind: entry.kind,
        createdAt: entry.createdAt ?? Date.now(),
      },
      ...prev,
    ]);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    cachedEntries = next;
    cacheLoadedAt = Date.now();
    notifyActivityHistoryRevision();
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

type ActivityHistoryRevisionListener = () => void;

let revisionListener: ActivityHistoryRevisionListener | null = null;

export function registerActivityHistoryRevisionListener(
  listener: ActivityHistoryRevisionListener | null,
): void {
  revisionListener = listener;
}

function notifyActivityHistoryRevision(): void {
  revisionListener?.();
}

/** @deprecated listActivityHistoryForDisplay 사용 */
export async function listActivityHistoryLastWeek(): Promise<NrmActivityHistoryEntry[]> {
  return listActivityHistoryForDisplay('7');
}
