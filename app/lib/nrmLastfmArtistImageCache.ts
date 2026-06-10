import AsyncStorage from '@react-native-async-storage/async-storage';

import { normalizeCoverArtUrl } from '@/lib/nrmCoverArtUrl';

const STORAGE_PREFIX = 'nrmLastfmArtistImg_v1:';
const HIT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 6 * 60 * 60 * 1000;

type CacheEntry = {
  imageUrl: string;
  expiresAt: number;
};

const memory = new Map<string, CacheEntry>();

function storageKey(cacheKey: string): string {
  return `${STORAGE_PREFIX}${cacheKey.toLowerCase()}`;
}

function readMemory(cacheKey: string): string | undefined {
  const hit = memory.get(cacheKey.toLowerCase());
  if (!hit) return undefined;
  if (Date.now() >= hit.expiresAt) {
    memory.delete(cacheKey.toLowerCase());
    return undefined;
  }
  return hit.imageUrl;
}

export async function getLastfmArtistImageFromCache(
  cacheKey: string,
): Promise<string | undefined> {
  const key = cacheKey.trim().toLowerCase();
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
    const imageUrl = normalizeCoverArtUrl(parsed.imageUrl ?? '');
    memory.set(key, { imageUrl, expiresAt: parsed.expiresAt });
    return imageUrl;
  } catch {
    return undefined;
  }
}

export async function setLastfmArtistImageCache(
  cacheKey: string,
  imageUrl: string,
): Promise<void> {
  const key = cacheKey.trim().toLowerCase();
  if (!key) return;
  const normalized = normalizeCoverArtUrl(imageUrl);
  const ttl = normalized ? HIT_TTL_MS : MISS_TTL_MS;
  const entry: CacheEntry = {
    imageUrl: normalized,
    expiresAt: Date.now() + ttl,
  };
  memory.set(key, entry);
  try {
    await AsyncStorage.setItem(storageKey(key), JSON.stringify(entry));
  } catch {
    // 캐시 저장 실패는 무시
  }
}
