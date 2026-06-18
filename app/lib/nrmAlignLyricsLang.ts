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

/** 자동 모드 — 한글(가~힣)이 이 수를 넘으면 KO 팩, 아니면 EN 팩 */
const AUTO_KO_HANGUL_THRESHOLD = 50;

/**
 * 멜론 plain 가사에서 한글 글자 수로 wav2vec2 KO/EN 팩을 고른다.
 * 한글 > 50 → ko, 그 외(영문만·혼합·빈 문자열 포함) → en.
 */
export function inferMelonAlignLyricsLanguage(plain: string): MelonAlignLyricsLanguage {
  let hangul = 0;
  for (const ch of plain) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0xac00 && code <= 0xd7a3) {
      hangul += 1;
      if (hangul > AUTO_KO_HANGUL_THRESHOLD) return 'ko';
    }
  }
  return 'en';
}

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
