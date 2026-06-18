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

/** 자동 모드 — 영어 팩은 라틴이 한글보다 15% 이상 많을 때만 */
const AUTO_EN_LATIN_BIAS = 1.15;

/**
 * 멜론 plain 가사에서 한글·라틴 문자 비율로 wav2vec2 KO/EN 팩을 고른다.
 * 동률·문자 없음 → ko (멜론 기본). 혼합곡은 한국어에 약간 유리.
 */
export function inferMelonAlignLyricsLanguage(plain: string): MelonAlignLyricsLanguage {
  let hangul = 0;
  let latin = 0;
  for (const ch of plain) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0xac00 && code <= 0xd7a3) {
      hangul += 1;
    } else if (
      (code >= 0x41 && code <= 0x5a) ||
      (code >= 0x61 && code <= 0x7a)
    ) {
      latin += 1;
    }
  }
  const total = hangul + latin;
  if (total === 0) return 'ko';
  if (latin > hangul * AUTO_EN_LATIN_BIAS) return 'en';
  return 'ko';
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
