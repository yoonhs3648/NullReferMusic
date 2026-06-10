import AsyncStorage from '@react-native-async-storage/async-storage';

import { normalizeCoverArtUrl } from '@/lib/nrmCoverArtUrl';

const STORAGE_PREFIX = 'nrmLastfmCover_v1:';
const HIT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 6 * 60 * 60 * 1000;

type CacheEntry = {
  coverUrl: string;
  expiresAt: number;
};

const memory = new Map<string, CacheEntry>();

function storageKey(mbid: string): string {
  return `${STORAGE_PREFIX}${mbid.toLowerCase()}`;
}

function readMemory(mbid: string): string | undefined {
  const hit = memory.get(mbid.toLowerCase());
  if (!hit) return undefined;
  if (Date.now() >= hit.expiresAt) {
    memory.delete(mbid.toLowerCase());
    return undefined;
  }
  return hit.coverUrl;
}

export async function getLastfmTrackCoverFromCache(
  mbid: string,
): Promise<string | undefined> {
  const key = mbid.trim().toLowerCase();
  if (!key) return undefined;

  const mem = readMemory(key);
  if (mem !== undefined) return mem;

  try {
    const raw = await AsyncStorage.getItem(storageKey(key));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (!parsed || typeof parsed.expiresAt !== 'number') return undefined;
    if (Date.now() >= parsed.expiresAt) {
      await AsyncStorage.removeItem(storageKey(key));
      return undefined;
    }
    const coverUrl = normalizeCoverArtUrl(parsed.coverUrl ?? '');
    memory.set(key, { coverUrl, expiresAt: parsed.expiresAt });
    return coverUrl;
  } catch {
    return undefined;
  }
}

export async function setLastfmTrackCoverCache(
  mbid: string,
  coverUrl: string,
): Promise<void> {
  const key = mbid.trim().toLowerCase();
  if (!key) return;
  const normalized = normalizeCoverArtUrl(coverUrl);
  const ttl = normalized ? HIT_TTL_MS : MISS_TTL_MS;
  const entry: CacheEntry = {
    coverUrl: normalized,
    expiresAt: Date.now() + ttl,
  };
  memory.set(key, entry);
  try {
    await AsyncStorage.setItem(storageKey(key), JSON.stringify(entry));
  } catch {
    // 캐시 저장 실패는 무시
  }
}

/** 앱 시작 시 자주 쓰는 mbid를 미리 메모리에 올림 (비동기, 실패 무시) */
export function primeLastfmTrackCoverCache(mbids: string[]): void {
  for (const mbid of mbids) {
    void getLastfmTrackCoverFromCache(mbid);
  }
}
