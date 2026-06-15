import { fetchDeepLUsage, isDeepLExhausted, translateLrcToKoreanWithDeepL } from '@/lib/nrmDeepLApiClient';
import { getDeepLApiKey } from '@/lib/nrmDeepLApiSettings';
import { translateLrcToKoreanWithLibreTranslate } from '@/lib/nrmLibreTranslateClient';
import {
  fetchLibreTranslatePackageStatuses,
  isLibreTranslateNativeAvailable,
  isLibreTranslateOfflineReady,
} from '@/lib/nrmLibreTranslateModelNative';
import {
  loadTranslationProvider,
  type NrmTranslationProvider,
} from '@/lib/nrmTranslationSettings';

import type { DeepLLrcTranslateOutcome } from '@/lib/nrmDeepLApiClient';

export type TranslationOptionGate = {
  enabled: boolean;
  hint: string;
  provider: NrmTranslationProvider;
};

async function isLibreTranslateTranslationOptionReady(): Promise<boolean> {
  if (!isLibreTranslateNativeAvailable()) return false;
  if (await isLibreTranslateOfflineReady()) return true;
  const rows = await fetchLibreTranslatePackageStatuses();
  return rows.some((row) => row.installed && !row.downloading);
}

export async function resolveTranslationOptionGate(): Promise<TranslationOptionGate> {
  const provider = await loadTranslationProvider();
  if (provider === 'libretranslate') {
    const installed = await isLibreTranslateTranslationOptionReady();
    if (!installed) {
      return {
        enabled: false,
        hint: '앱 설정 → 오프라인 번역기 설치에서 LibreTranslate 언어 팩을 설치해주세요.',
        provider,
      };
    }
    return { enabled: true, hint: '', provider };
  }

  const key = await getDeepLApiKey();
  if (!key) {
    return {
      enabled: false,
      hint: 'DeepL API 토큰 등록 시 사용 가능합니다.',
      provider,
    };
  }

  const usage = await fetchDeepLUsage(key);
  if (usage.ok && isDeepLExhausted(usage.usage)) {
    return {
      enabled: false,
      hint: 'DeepL 월 사용량이 초과되어 비활성화되었습니다.',
      provider,
    };
  }

  return { enabled: true, hint: '', provider };
}

export async function translateLrcToKorean(lrcText: string): Promise<DeepLLrcTranslateOutcome> {
  const provider = await loadTranslationProvider();
  if (provider === 'deepl') {
    const apiKey = await getDeepLApiKey();
    return translateLrcToKoreanWithDeepL(lrcText, apiKey);
  }
  return translateLrcToKoreanWithLibreTranslate(lrcText);
}
