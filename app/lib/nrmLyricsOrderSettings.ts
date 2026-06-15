import AsyncStorage from '@react-native-async-storage/async-storage';

import type { NrmLyricsUiMode } from '@/lib/nrmMelonLyrics';

const STORAGE_KEY = 'nrmLyricsModeOrder_v1';

export const NRM_LYRICS_MODE_ORDER_IDS = [
  'unset',
  'configured',
  'translation',
  'melon',
  'melon_translation',
] as const;

export type NrmLyricsModeOrderId = (typeof NRM_LYRICS_MODE_ORDER_IDS)[number];

export const NRM_LYRICS_MODE_LABELS: Record<NrmLyricsModeOrderId, string> = {
  unset: '설정안함',
  configured: '가사',
  translation: '가사 + 번역지원',
  melon: '멜론가사',
  melon_translation: '멜론가사 + 번역지원',
};

export const DEFAULT_NRM_LYRICS_MODE_ORDER: readonly NrmLyricsModeOrderId[] =
  NRM_LYRICS_MODE_ORDER_IDS;

function isOrderId(v: string): v is NrmLyricsModeOrderId {
  return (NRM_LYRICS_MODE_ORDER_IDS as readonly string[]).includes(v);
}

export function lyricsModeOrdersEqual(
  a: readonly NrmLyricsModeOrderId[],
  b: readonly NrmLyricsModeOrderId[],
): boolean {
  if (a.length !== b.length) return false;
  return a.every((id, i) => id === b[i]);
}

export function normalizeLyricsModeOrder(raw: unknown): NrmLyricsModeOrderId[] {
  if (!Array.isArray(raw)) return [...DEFAULT_NRM_LYRICS_MODE_ORDER];
  const seen = new Set<NrmLyricsModeOrderId>();
  const out: NrmLyricsModeOrderId[] = [];
  for (const item of raw) {
    if (typeof item !== 'string' || !isOrderId(item) || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  for (const id of DEFAULT_NRM_LYRICS_MODE_ORDER) {
    if (!seen.has(id)) out.push(id);
  }
  return out;
}

export async function loadLyricsModeOrder(): Promise<NrmLyricsModeOrderId[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_NRM_LYRICS_MODE_ORDER];
    return normalizeLyricsModeOrder(JSON.parse(raw));
  } catch {
    return [...DEFAULT_NRM_LYRICS_MODE_ORDER];
  }
}

export async function saveLyricsModeOrder(order: readonly NrmLyricsModeOrderId[]): Promise<void> {
  const normalized = normalizeLyricsModeOrder([...order]);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
}

export function lyricsModeOrderToUiModes(
  order: readonly NrmLyricsModeOrderId[],
): NrmLyricsUiMode[] {
  return order.map((id) => id as NrmLyricsUiMode);
}

export function defaultDownloadLyricsMode(
  order: readonly NrmLyricsModeOrderId[],
): NrmLyricsUiMode {
  return (order[0] ?? 'unset') as NrmLyricsUiMode;
}
