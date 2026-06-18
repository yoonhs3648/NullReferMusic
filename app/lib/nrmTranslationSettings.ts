import AsyncStorage from '@react-native-async-storage/async-storage';

/** 가사 번역에 사용할 제공자 */
export type NrmTranslationProvider = 'googletranslate' | 'deepl';

const STORAGE_KEY = 'nrm_translation_provider_v1';

export const NRM_TRANSLATION_PROVIDER_DEFAULT: NrmTranslationProvider = 'googletranslate';

export const NRM_TRANSLATION_PROVIDER_LABELS: Record<NrmTranslationProvider, string> = {
  googletranslate: 'Google Translate',
  deepl: 'DeepL API',
};

export const NRM_TRANSLATION_PROVIDER_DESCRIPTIONS: Record<NrmTranslationProvider, string> = {
  googletranslate:
    'Google Translate 웹을 통해 온라인으로 가사를 번역합니다. 인터넷 연결이 필요합니다.',
  deepl:
    'DeepL API 토큰이 등록되어 있어야 가사+번역 옵션을 사용할 수 있습니다. API 설정에서 토큰을 관리하세요.',
};

const ORDER: NrmTranslationProvider[] = ['googletranslate', 'deepl'];

export function listTranslationProviders(): NrmTranslationProvider[] {
  return ORDER;
}

function isTranslationProvider(v: string | null): v is NrmTranslationProvider {
  return v === 'googletranslate' || v === 'deepl';
}

export async function loadTranslationProvider(): Promise<NrmTranslationProvider> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw === 'libretranslate') return NRM_TRANSLATION_PROVIDER_DEFAULT;
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
