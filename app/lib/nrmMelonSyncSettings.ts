import AsyncStorage from '@react-native-async-storage/async-storage';

import type { EncodeOptionItem } from '@/components/nrm/settings/NrmDownloadEncodeOptionPicker';

/** 멜론 싱크(Forced Alignment) 품질 */
export const NRM_MELON_SYNC_QUALITY_OPTIONS: readonly EncodeOptionItem[] = [
  {
    id: 'accurate',
    label: '정확 (느림)',
    description: '전곡 1-pass 우선, 청크 overlap, trellis 여유 확대',
    icon: 'diamond-outline',
  },
  {
    id: 'standard',
    label: '표준',
    description: '정확도와 속도 균형',
    icon: 'options-outline',
  },
  {
    id: 'fast',
    label: '빠름 (메모리 절약)',
    description: '작은 청크·빠른 분할 (저사양 기기)',
    icon: 'flash-outline',
  },
];

export type NrmMelonSyncQuality = 'accurate' | 'standard' | 'fast';

export type NrmMelonSyncSettings = {
  quality: NrmMelonSyncQuality;
  firstLineIntroCorrection: boolean;
  vocalRangeAutoDetect: boolean;
};

const STORAGE_KEY = 'nrm_melon_sync_settings_v1';

export const DEFAULT_MELON_SYNC_SETTINGS: NrmMelonSyncSettings = {
  quality: 'accurate',
  firstLineIntroCorrection: true,
  vocalRangeAutoDetect: true,
};

export function isNrmMelonSyncQuality(v: string): v is NrmMelonSyncQuality {
  return (NRM_MELON_SYNC_QUALITY_OPTIONS as readonly { id: string }[]).some((o) => o.id === v);
}

export async function loadMelonSyncSettings(): Promise<NrmMelonSyncSettings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_MELON_SYNC_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<NrmMelonSyncSettings>;
    return {
      quality:
        parsed.quality && isNrmMelonSyncQuality(parsed.quality)
          ? parsed.quality
          : DEFAULT_MELON_SYNC_SETTINGS.quality,
      firstLineIntroCorrection:
        parsed.firstLineIntroCorrection ?? DEFAULT_MELON_SYNC_SETTINGS.firstLineIntroCorrection,
      vocalRangeAutoDetect:
        parsed.vocalRangeAutoDetect ?? DEFAULT_MELON_SYNC_SETTINGS.vocalRangeAutoDetect,
    };
  } catch {
    return { ...DEFAULT_MELON_SYNC_SETTINGS };
  }
}

export async function saveMelonSyncSettings(settings: NrmMelonSyncSettings): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

/** 네이티브 Forced Alignment 모듈에 전달 */
export function melonSyncSettingsToNativePayload(
  settings: NrmMelonSyncSettings,
  lyricsLang: 'ko' | 'en',
): Record<string, string | boolean> {
  return {
    quality: settings.quality,
    firstLineIntroCorrection: settings.firstLineIntroCorrection,
    vocalRangeAutoDetect: settings.vocalRangeAutoDetect,
    lyricsLang,
  };
}
