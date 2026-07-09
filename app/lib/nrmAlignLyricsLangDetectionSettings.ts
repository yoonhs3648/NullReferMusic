import AsyncStorage from '@react-native-async-storage/async-storage';

/** 멜론 싱크(wav2vec2-base) — KO/EN 팩 선택 방식 */
export type NrmAlignLyricsLangDetectionMode = 'manual' | 'auto' | 'espeak';

const STORAGE_KEY = 'nrm_align_lyrics_lang_detection_v1';

export const DEFAULT_ALIGN_LYRICS_LANG_DETECTION: NrmAlignLyricsLangDetectionMode = 'manual';

export async function loadAlignLyricsLangDetectionMode(): Promise<NrmAlignLyricsLangDetectionMode> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw === 'auto' || raw === 'manual' || raw === 'espeak') return raw;
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

export function isEspeakLangDetectionMode(
  mode: NrmAlignLyricsLangDetectionMode,
): boolean {
  return mode === 'espeak';
}
