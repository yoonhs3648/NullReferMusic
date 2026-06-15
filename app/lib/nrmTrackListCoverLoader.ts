import { useCallback, useEffect, useRef, useState } from 'react';
import * as FileSystem from 'expo-file-system/src/legacy/FileSystem';

import type { NrmDownloadTrackItem } from '@/lib/nrmDownloadTrackTypes';
import { readAudioFileMetadata } from '@/lib/nrmReadAudioMetadata';

/**
 * 특정 트랙의 커버 디스크 캐시를 삭제한다.
 * 메타데이터 저장 후 호출해 stale 커버 이미지를 방지한다.
 */
export async function invalidateListCoverDiskCache(coverKey: string): Promise<void> {
  const cacheRoot = FileSystem.cacheDirectory;
  if (!cacheRoot) return;
  const dest = `${cacheRoot}nrm-list-cover-${hashCoverKey(coverKey)}.jpg`;
  await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => {});
  coverResultCache.delete(coverKey);
  loadingKeys.delete(coverKey);
}

const CONCURRENCY = 4;
const INITIAL_PREFETCH_COUNT = 12;

export function trackListCoverKey(track: Pick<NrmDownloadTrackItem, 'audioUri' | 'fileName'>): string {
  return `${track.audioUri.trim()}\0${track.fileName.trim()}`;
}

function hashCoverKey(key: string): string {
  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) + hash) ^ key.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

/** 세션 내 커버 URL 캐시 (listGeneration 갱신 시 초기화) */
const coverResultCache = new Map<string, string>();
const loadingKeys = new Set<string>();

type CoverQueueJob = {
  track: NrmDownloadTrackItem;
  generation: number;
};

let coverQueue: CoverQueueJob[] = [];
let coverQueueRunning = false;

/**
 * 병렬 readMetadata가 같은 cover 임시 경로를 공유하거나 Image URI 캐시가 섞이지 않도록
 * 트랙별 전용 캐시 파일로 복사한다.
 */
async function isolateListCoverFile(
  coverKey: string,
  sourceUrl: string,
): Promise<string> {
  const trimmed = sourceUrl.trim();
  if (!trimmed) return '';

  const cacheRoot = FileSystem.cacheDirectory;
  if (!cacheRoot) return trimmed;

  const dest = `${cacheRoot}nrm-list-cover-${hashCoverKey(coverKey)}.jpg`;

  try {
    const existing = await FileSystem.getInfoAsync(dest);
    if (existing.exists && 'size' in existing && (existing.size ?? 0) > 256) {
      return dest;
    }

    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const dl = await FileSystem.downloadAsync(trimmed, dest);
      if (dl.status >= 200 && dl.status < 300) {
        const info = await FileSystem.getInfoAsync(dest);
        if (info.exists && 'size' in info && (info.size ?? 0) > 256) {
          return dest;
        }
      }
      return trimmed;
    }

    const from =
      trimmed.startsWith('file://') || trimmed.startsWith('content://')
        ? trimmed
        : `file://${trimmed}`;
    await FileSystem.copyAsync({ from, to: dest });
    const info = await FileSystem.getInfoAsync(dest);
    if (info.exists && 'size' in info && (info.size ?? 0) > 256) {
      return dest;
    }
  } catch {
    /* 원본 URI 폴백 */
  }
  return trimmed;
}

async function loadOneCover(
  track: NrmDownloadTrackItem,
  generation: number,
  generationRef: { current: number },
  onResult: (key: string, url: string) => void,
): Promise<void> {
  const key = trackListCoverKey(track);
  try {
    const meta = await readAudioFileMetadata(track.audioUri, track.fileName);
    if (generationRef.current !== generation) return;
    const rawUrl = meta.coverUrl?.trim() ?? '';
    const url = rawUrl ? await isolateListCoverFile(key, rawUrl) : '';
    if (generationRef.current !== generation) return;
    coverResultCache.set(key, url);
    onResult(key, url);
  } catch {
    if (generationRef.current !== generation) return;
    coverResultCache.set(key, '');
    onResult(key, '');
  } finally {
    loadingKeys.delete(key);
  }
}

async function drainCoverQueue(
  generationRef: { current: number },
  onResult: (key: string, url: string) => void,
): Promise<void> {
  if (coverQueueRunning) return;
  coverQueueRunning = true;
  try {
    while (coverQueue.length > 0) {
      const batch: CoverQueueJob[] = [];
      while (batch.length < CONCURRENCY && coverQueue.length > 0) {
        const job = coverQueue.shift()!;
        if (job.generation !== generationRef.current) continue;
        const key = trackListCoverKey(job.track);
        if (coverResultCache.has(key)) {
          loadingKeys.delete(key);
          continue;
        }
        batch.push(job);
      }
      if (batch.length === 0) continue;
      await Promise.all(
        batch.map((job) =>
          loadOneCover(job.track, job.generation, generationRef, onResult),
        ),
      );
    }
  } finally {
    coverQueueRunning = false;
    if (coverQueue.length > 0) {
      void drainCoverQueue(generationRef, onResult);
    }
  }
}

function cacheToRecord(): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [k, v] of coverResultCache) {
    next[k] = v;
  }
  return next;
}

/**
 * 트랙 목록 커버를 **요청 시에만** 비동기 로드한다.
 * - 스크롤로 보이는 행 · 검색 결과 등 `requestCovers`로 넘긴 트랙만 큐에 쌓음
 * - 이미 캐시된 트랙은 재요청하지 않음
 *
 * @param listGeneration reload()마다 +1 — 저장·목록 갱신 후 커버 캐시 무효화
 */
export function useTrackListCoverMap(listGeneration: number): {
  coverByKey: Record<string, string>;
  requestCovers: (tracks: NrmDownloadTrackItem[]) => void;
} {
  const [coverByKey, setCoverByKey] = useState<Record<string, string>>(cacheToRecord);
  const generationRef = useRef(0);
  const lastListGenerationRef = useRef(listGeneration);

  const applyCoverResult = useCallback((key: string, url: string) => {
    setCoverByKey((prev) => {
      if (prev[key] === url) return prev;
      return { ...prev, [key]: url };
    });
  }, []);

  useEffect(() => {
    const bustCache = listGeneration !== lastListGenerationRef.current;
    if (!bustCache) return;
    lastListGenerationRef.current = listGeneration;
    generationRef.current += 1;
    coverResultCache.clear();
    loadingKeys.clear();
    coverQueue = [];
    setCoverByKey({});
  }, [listGeneration]);

  const requestCovers = useCallback(
    (tracks: NrmDownloadTrackItem[]) => {
      if (tracks.length === 0) return;
      const generation = generationRef.current;
      let queued = false;

      for (const track of tracks) {
        const key = trackListCoverKey(track);
        if (coverResultCache.has(key) || loadingKeys.has(key)) continue;
        loadingKeys.add(key);
        coverQueue.push({ track, generation });
        queued = true;
      }

      if (queued) {
        void drainCoverQueue(generationRef, applyCoverResult);
      } else {
        // 캐시에만 있고 state에 아직 없는 키 동기화
        setCoverByKey((prev) => {
          let changed = false;
          const next = { ...prev };
          for (const track of tracks) {
            const key = trackListCoverKey(track);
            const cached = coverResultCache.get(key);
            if (cached !== undefined && prev[key] !== cached) {
              next[key] = cached;
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      }
    },
    [applyCoverResult],
  );

  return { coverByKey, requestCovers };
}

/** 목록 최초 진입 시 상단 N개만 선로드 */
export function prefetchInitialTrackCovers(
  tracks: NrmDownloadTrackItem[],
  requestCovers: (tracks: NrmDownloadTrackItem[]) => void,
): void {
  if (tracks.length === 0) return;
  requestCovers(tracks.slice(0, INITIAL_PREFETCH_COUNT));
}
