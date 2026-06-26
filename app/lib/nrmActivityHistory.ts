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
  | 'download_fail'
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
    case 'download_fail':
      return `${base} 다운로드 실패`;
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

/** yyyy-MM-dd → 오늘·어제·6월 26일·2025년 6월 26일 */
export function formatActivityHistoryDateTitle(dateKey: string): string {
  const parts = dateKey.split('-').map((v) => Number(v));
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (!y || !m || !d) return dateKey;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sectionStart = new Date(y, m - 1, d);
  const diffDays = Math.round((todayStart.getTime() - sectionStart.getTime()) / 86400000);

  if (diffDays === 0) return '오늘';
  if (diffDays === 1) return '어제';
  if (y === now.getFullYear()) return `${m}월 ${d}일`;
  return `${y}년 ${m}월 ${d}일`;
}

export function formatActivityHistoryTrackLabel(entry: NrmActivityHistoryEntry): string {
  return historyTrackLabel(entry.fileName);
}

/** 삭제·다운로드 실패 등 — 파일을 열 수 없는 기록 (History에서 탭 비활성) */
export function activityHistoryEntryOpensTrack(entry: NrmActivityHistoryEntry): boolean {
  switch (entry.kind) {
    case 'download_fail':
    case 'track_remove':
      return false;
    default:
      return true;
  }
}

export type NrmActivityHistoryKindBadge = {
  label: string;
  tone: 'primary' | 'success' | 'neutral' | 'warning' | 'danger';
};

export function activityHistoryKindBadge(kind: NrmActivityHistoryKind): NrmActivityHistoryKindBadge {
  switch (kind) {
    case 'download':
      return { label: '저장', tone: 'success' };
    case 'download_fail':
      return { label: '실패', tone: 'danger' };
    case 'lyrics':
      return { label: '가사', tone: 'primary' };
    case 'lyrics_translation':
      return { label: '가사·번역', tone: 'primary' };
    case 'metadata_edit':
      return { label: '메타', tone: 'neutral' };
    case 'lyrics_remove':
      return { label: '가사 제거', tone: 'warning' };
    case 'lyrics_add_translation':
      return { label: '번역 추가', tone: 'primary' };
    case 'lyrics_remove_translation':
      return { label: '번역 제거', tone: 'warning' };
    case 'track_remove':
      return { label: '제거', tone: 'danger' };
    default:
      return { label: '기록', tone: 'neutral' };
  }
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

/**
 * 여러 히스토리 항목을 한 번의 read + 한 번의 write로 기록한다.
 * 순차 `appendActivityHistory` 호출 대비 AsyncStorage I/O를 절반으로 줄인다.
 * entries 배열 순서 = 오래된 것 먼저 (앞 항목이 더 오래됨), 히스토리 목록에서는 뒤쪽이 최신으로 표시됨.
 */
export async function appendActivityHistoryBatch(
  entries: Array<
    Pick<NrmActivityHistoryEntry, 'fileName' | 'kind' | 'audioUri'> & { createdAt?: number }
  >,
): Promise<void> {
  if (entries.length === 0) return;
  if (entries.length === 1) {
    return appendActivityHistory(entries[0]!);
  }
  try {
    const prev = await loadAllEntries(true);
    const now = Date.now();
    // 뒤쪽 항목(index 큰 것)이 가장 최신 타임스탬프 → 히스토리 최상단에 표시
    const newEntries: NrmActivityHistoryEntry[] = entries.map((e, i) => ({
      id: newId(),
      fileName: e.fileName,
      audioUri: e.audioUri,
      kind: e.kind,
      createdAt: e.createdAt ?? now + i,
    }));
    const next = pruneInternal([...newEntries.reverse(), ...prev]);
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
