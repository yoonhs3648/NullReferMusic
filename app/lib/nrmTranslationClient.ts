import { fetchDeepLUsage, isDeepLExhausted, translateLrcToKoreanWithDeepL } from '@/lib/nrmDeepLApiClient';
import { getDeepLApiKey } from '@/lib/nrmDeepLApiSettings';
import { translateLrcToKoreanWithGoogleTranslate } from '@/lib/nrmGoogleTranslateClient';
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

export async function resolveTranslationOptionGate(): Promise<TranslationOptionGate> {
  const provider = await loadTranslationProvider();
  if (provider === 'googletranslate') {
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
  return translateLrcToKoreanWithGoogleTranslate(lrcText);
}
