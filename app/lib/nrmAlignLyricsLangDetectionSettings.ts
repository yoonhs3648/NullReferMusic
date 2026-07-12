import AsyncStorage from '@react-native-async-storage/async-storage';

/** 멜론 싱크(wav2vec2-base) — KO/EN 팩 선택 방식 */
export type NrmAlignLyricsLangDetectionMode = 'manual' | 'auto' | 'espeak';

const STORAGE_KEY = 'nrm_align_lyrics_lang_detection_v1';

export const DEFAULT_ALIGN_LYRICS_LANG_DETECTION: NrmAlignLyricsLangDetectionMode = 'manual';

export async function loadAlignLyricsLangDetectionMode(): Promise<NrmAlignLyricsLangDetectionMode> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    // eSpeak NG 모드는 UI에서 비활성 — 저장된 값도 무시하고 기본값으로 되돌림
    if (raw === 'espeak') {
      await AsyncStorage.setItem(STORAGE_KEY, DEFAULT_ALIGN_LYRICS_LANG_DETECTION);
      return DEFAULT_ALIGN_LYRICS_LANG_DETECTION;
    }
    if (raw === 'auto' || raw === 'manual') return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_ALIGN_LYRICS_LANG_DETECTION;
}

export async function saveAlignLyricsLangDetectionMode(
  mode: NrmAlignLyricsLangDetectionMode,
): Promise<void> {
  const next = mode === 'espeak' ? DEFAULT_ALIGN_LYRICS_LANG_DETECTION : mode;
  await AsyncStorage.setItem(STORAGE_KEY, next);
}

export function isEspeakLangDetectionMode(
  mode: NrmAlignLyricsLangDetectionMode,
): boolean {
  return mode === 'espeak';
}
