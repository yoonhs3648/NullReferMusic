import {
  NRM_ALIGN_AENEAS_ID,
  NRM_ALIGN_WAV2VEC2_BASE_ID,
  isNrmAlignModelId,
  isNrmWav2Vec2BundleId,
  migrateAlignModelPreference,
  wav2Vec2PackIdForLanguage,
  type NrmAlignModelId,
} from '@/lib/nrmAlignModelCatalog';

export type MelonAlignLyricsLanguage = 'ko' | 'en';

/**
 * 멜론 싱크용 실제 ONNX 팩 ID.
 * wav2vec2-base 선택 + 사용자가 고른 가사 언어 → KO/EN 팩.
 */
export function resolveAlignModelForMelonSync(
  preference: string,
  lyricsLang: MelonAlignLyricsLanguage,
): NrmAlignModelId | string {
  const pref = migrateAlignModelPreference(preference);
  if (!isNrmAlignModelId(pref)) return NRM_ALIGN_AENEAS_ID;
  if (pref === NRM_ALIGN_AENEAS_ID) return pref;
  if (isNrmWav2Vec2BundleId(pref)) {
    return wav2Vec2PackIdForLanguage(lyricsLang);
  }
  return pref;
}
