import AsyncStorage from '@react-native-async-storage/async-storage';

/** 가사 번역에 사용할 제공자 */
export type NrmTranslationProvider = 'libretranslate' | 'deepl';

const STORAGE_KEY = 'nrm_translation_provider_v1';

export const NRM_TRANSLATION_PROVIDER_DEFAULT: NrmTranslationProvider = 'libretranslate';

export const NRM_TRANSLATION_PROVIDER_LABELS: Record<NrmTranslationProvider, string> = {
  libretranslate: 'LibreTranslate',
  deepl: 'DeepL API',
};

export const NRM_TRANSLATION_PROVIDER_DESCRIPTIONS: Record<NrmTranslationProvider, string> = {
  libretranslate:
    '기기에 설치한 LibreTranslate 언어 팩으로 오프라인 번역합니다. API 설정 → 번역기 설치에서 언어 팩을 받아주세요.',
  deepl:
    'DeepL API 토큰이 등록되어 있어야 가사+번역 옵션을 사용할 수 있습니다. API 설정에서 토큰을 관리하세요.',
};

const ORDER: NrmTranslationProvider[] = ['libretranslate', 'deepl'];

export function listTranslationProviders(): NrmTranslationProvider[] {
  return ORDER;
}

function isTranslationProvider(v: string | null): v is NrmTranslationProvider {
  return v === 'libretranslate' || v === 'deepl';
}

export async function loadTranslationProvider(): Promise<NrmTranslationProvider> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (isTranslationProvider(raw)) return raw;
    return NRM_TRANSLATION_PROVIDER_DEFAULT;
  } catch {
    return NRM_TRANSLATION_PROVIDER_DEFAULT;
  }
}

export async function saveTranslationProvider(
  provider: NrmTranslationProvider,
): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, provider);
}
