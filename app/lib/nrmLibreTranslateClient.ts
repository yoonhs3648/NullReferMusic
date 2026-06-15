import {
  extractDeepLTextsFromSlots,
  mergeDeepLResponsesIntoLrc,
  normalizeLrcLines,
  planLrcTranslationSlots,
} from '@/lib/nrmDeepLLrcFormat';
import { logNrmDev } from '@/lib/nrmDevLog';
import {
  isLibreTranslateNativeAvailable,
  isLibreTranslateOfflineReady,
  translateTextsViaLibreTranslateNative,
} from '@/lib/nrmLibreTranslateModelNative';

import type { DeepLLrcTranslateOutcome } from '@/lib/nrmDeepLApiClient';

async function translateTextsWithLibreTranslate(
  texts: string[],
): Promise<
  | { ok: true; texts: string[]; sourceLangs: string[] }
  | { ok: false; message: string }
> {
  if (texts.length === 0) {
    return { ok: true, texts: [], sourceLangs: [] };
  }

  if (isLibreTranslateNativeAvailable() && (await isLibreTranslateOfflineReady())) {
    try {
      const out = await translateTextsViaLibreTranslateNative(texts);
      return { ok: true, texts: out.texts, sourceLangs: out.sourceLangs };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, message: msg || 'LibreTranslate 오프라인 번역에 실패했습니다.' };
    }
  }

  return {
    ok: false,
    message: 'LibreTranslate가 설치되지 않았습니다. 앱 설정 → 오프라인 번역기 설치에서 언어 팩을 설치해주세요.',
  };
}

export async function translateLrcToKoreanWithLibreTranslate(
  lrcText: string,
): Promise<DeepLLrcTranslateOutcome> {
  const lines = normalizeLrcLines(lrcText);
  if (lines.length === 0) {
    logNrmDev('lyrics.translate', { event: 'libretranslate_empty_input' });
    return { ok: true, lrc: '' };
  }

  const slots = planLrcTranslationSlots(lines);
  if (slots.length === 0) {
    return { ok: true, lrc: lines.join('\n') };
  }

  const { texts: apiTexts, slotIndices } = extractDeepLTextsFromSlots(slots);

  logNrmDev('lyrics.translate', {
    event: 'libretranslate_request',
    lineCount: lines.length,
    slotCount: slots.length,
    apiLineCount: apiTexts.length,
    targetLang: 'ko',
  });

  let responses: string[] = [];
  let sourceLangs: string[] = [];
  if (apiTexts.length > 0) {
    const translated = await translateTextsWithLibreTranslate(apiTexts);
    if (!translated.ok) {
      logNrmDev('lyrics.translate', {
        event: 'libretranslate_fail',
        message: translated.message,
      });
      return { ok: false, message: translated.message };
    }
    responses = translated.texts;
    sourceLangs = translated.sourceLangs;
    if (responses.length !== apiTexts.length) {
      return { ok: false, message: 'LibreTranslate 번역 결과 개수가 요청과 일치하지 않습니다.' };
    }
  }

  const outLrc = mergeDeepLResponsesIntoLrc(
    lines,
    slots,
    slotIndices,
    responses,
    sourceLangs,
  );

  logNrmDev('lyrics.translate', {
    event: 'libretranslate_ok',
    lrcChars: outLrc.length,
  });

  return { ok: true, lrc: outLrc };
}
