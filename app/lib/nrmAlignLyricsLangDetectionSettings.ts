import AsyncStorage from '@react-native-async-storage/async-storage';

/** 멜론 싱크(wav2vec2-base) — KO/EN 팩 선택 방식 */
export type NrmAlignLyricsLangDetectionMode = 'manual' | 'auto' | 'transliterator';

const STORAGE_KEY = 'nrm_align_lyrics_lang_detection_v1';

export const DEFAULT_ALIGN_LYRICS_LANG_DETECTION: NrmAlignLyricsLangDetectionMode = 'manual';

export async function loadAlignLyricsLangDetectionMode(): Promise<NrmAlignLyricsLangDetectionMode> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    // 레거시 eSpeak NG 모드 — 죽은 값이므로 기본값(수동)으로 마이그레이션
    if (raw === 'espeak') {
      await AsyncStorage.setItem(STORAGE_KEY, DEFAULT_ALIGN_LYRICS_LANG_DETECTION);
      return DEFAULT_ALIGN_LYRICS_LANG_DETECTION;
    }
    if (raw === 'auto' || raw === 'manual' || raw === 'transliterator') return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_ALIGN_LYRICS_LANG_DETECTION;
}

export async function saveAlignLyricsLangDetectionMode(
  mode: NrmAlignLyricsLangDetectionMode,
): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, mode);
}

export function isTransliteratorLangDetectionMode(
  mode: NrmAlignLyricsLangDetectionMode,
): boolean {
  return mode === 'transliterator';
}

/** @deprecated eSpeak NG 모드는 제거됨 — 항상 false */
export function isEspeakLangDetectionMode(
  _mode: NrmAlignLyricsLangDetectionMode,
): boolean {
  return false;
}
