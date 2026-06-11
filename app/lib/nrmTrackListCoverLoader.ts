import { useEffect, useRef, useState } from 'react';
import * as FileSystem from 'expo-file-system/src/legacy/FileSystem';

import type { NrmDownloadTrackItem } from '@/lib/nrmDownloadTrackTypes';
import { readAudioFileMetadata } from '@/lib/nrmReadAudioMetadata';

const CONCURRENCY = 4;

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

/**
 * 병렬 readMetadata가 같은 cover 임시 경로를 공유하거나 Image URI 캐시가 섞이지 않도록
 * 트랙별 전용 캐시 파일로 복사한다.
 */
async function isolateListCoverFile(
  coverKey: string,
  sourceUrl: string,
  listGeneration: number,
): Promise<string> {
  const trimmed = sourceUrl.trim();
  if (!trimmed) return '';

  const cacheRoot = FileSystem.cacheDirectory;
  if (!cacheRoot) return trimmed;

  const dest = `${cacheRoot}nrm-list-cover-${listGeneration}-${hashCoverKey(coverKey)}.jpg`;

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

async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length || 1) }, async () => {
    while (index < items.length) {
      const i = index++;
      await fn(items[i]!);
    }
  });
  await Promise.all(workers);
}

/**
 * 다운로드 트랙 목록용 임베디드 커버 URL (트랙별 1회 read, 동시성 제한).
 * FlatList 행마다 async read 하면 셀 재활용 시 잘못된 커ver가 보일 수 있어 상위에서 일괄 로드한다.
 *
 * @param listGeneration reload()마다 +1 — 저장·목록 갱신 후 커ver 캐시 무효화
 */
export function useTrackListCoverMap(
  tracks: NrmDownloadTrackItem[],
  listGeneration: number,
): Record<string, string> {
  const [coverByKey, setCoverByKey] = useState<Record<string, string>>({});
  const generationRef = useRef(0);
  const lastListGenerationRef = useRef(listGeneration);

  useEffect(() => {
    const generation = ++generationRef.current;
    const bustCache = listGeneration !== lastListGenerationRef.current;
    lastListGenerationRef.current = listGeneration;

    if (bustCache) {
      setCoverByKey({});
    } else {
      const wanted = new Set(tracks.map(trackListCoverKey));
      setCoverByKey((prev) => {
        const next: Record<string, string> = {};
        for (const key of wanted) {
          if (prev[key]) next[key] = prev[key];
        }
        return next;
      });
    }

    if (tracks.length === 0) return;

    void (async () => {
      await mapWithConcurrency(tracks, CONCURRENCY, async (track) => {
        if (generationRef.current !== generation) return;
        const key = trackListCoverKey(track);
        try {
          const meta = await readAudioFileMetadata(track.audioUri, track.fileName);
          if (generationRef.current !== generation) return;
          const rawUrl = meta.coverUrl?.trim() ?? '';
          const url = rawUrl
            ? await isolateListCoverFile(key, rawUrl, listGeneration)
            : '';
          if (generationRef.current !== generation) return;
          setCoverByKey((prev) => {
            if (prev[key] === url) return prev;
            return { ...prev, [key]: url };
          });
        } catch {
          if (generationRef.current !== generation) return;
          setCoverByKey((prev) => {
            if (prev[key] === '') return prev;
            return { ...prev, [key]: '' };
          });
        }
      });
    })();
  }, [tracks, listGeneration]);

  return coverByKey;
}
