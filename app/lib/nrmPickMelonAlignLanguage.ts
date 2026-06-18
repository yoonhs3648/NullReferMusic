import { Platform } from 'react-native';

import {
  inferMelonAlignLyricsLanguage,
  type MelonAlignLyricsLanguage,
} from '@/lib/nrmAlignLyricsLang';
import {
  NRM_ALIGN_WAV2VEC2_BASE_ID,
  migrateAlignModelPreference,
  type NrmAlignModelId,
} from '@/lib/nrmAlignModelCatalog';
import { loadAlignLyricsLangDetectionMode } from '@/lib/nrmAlignLyricsLangDetectionSettings';
import { loadAlignModelPreference } from '@/lib/nrmDownloadSettings';
import { choiceUser } from '@/lib/nrmUserNotify';

export async function isWav2Vec2BaseAlignPreference(): Promise<boolean> {
  const pref = migrateAlignModelPreference(await loadAlignModelPreference());
  return pref === NRM_ALIGN_WAV2VEC2_BASE_ID;
}

function pickMelonAlignLanguageManual(plain: string): Promise<MelonAlignLyricsLanguage | null> {
  if (Platform.OS === 'web') {
    return Promise.resolve(inferMelonAlignLyricsLanguage(plain));
  }
  return choiceUser<MelonAlignLyricsLanguage>(
    '가사 생성 언어팩을 설정하세요',
    [
      { id: 'ko', label: '한국어 팩' },
      { id: 'en', label: '영어 팩' },
    ],
  );
}

/**
 * wav2vec2-base + 수동 설정이면 KO/EN 팝업.
 * 자동이면 plain 비율로 추론. aeneas 등 다른 엔진은 추론만 사용.
 */
export async function resolveMelonAlignLanguageForPlain(
  plain: string,
  alignPref?: NrmAlignModelId,
): Promise<MelonAlignLyricsLanguage | null> {
  const pref = migrateAlignModelPreference(
    alignPref ?? (await loadAlignModelPreference()),
  );
  if (pref !== NRM_ALIGN_WAV2VEC2_BASE_ID) {
    return inferMelonAlignLyricsLanguage(plain);
  }
  const mode = await loadAlignLyricsLangDetectionMode();
  if (mode === 'auto') {
    return inferMelonAlignLyricsLanguage(plain);
  }
  return pickMelonAlignLanguageManual(plain);
}
