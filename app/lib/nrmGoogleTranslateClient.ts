import {
  containsHangul,
  extractDeepLTextsFromSlots,
  lrcHasTranslationPairs,
  mergeDeepLResponsesIntoLrc,
  normalizeLrcLines,
  planLrcTranslationSlots,
} from '@/lib/nrmDeepLLrcFormat';
import { logNrmDev } from '@/lib/nrmDevLog';
import { translateTextsViaGoogleTranslateWeb } from '@/lib/nrmGoogleTranslateBridge';

import type { DeepLLrcTranslateOutcome } from '@/lib/nrmDeepLApiClient';

async function translateTextsWithGoogleTranslate(
  texts: string[],
): Promise<
  | { ok: true; texts: string[]; sourceLangs: string[] }
  | { ok: false; message: string }
> {
  if (texts.length === 0) {
    return { ok: true, texts: [], sourceLangs: [] };
  }
  try {
    const out = await translateTextsViaGoogleTranslateWeb(texts);
    return { ok: true, texts: out.texts, sourceLangs: out.sourceLangs };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg || 'Google Translate 번역에 실패했습니다.' };
  }
}

export async function translateLrcToKoreanWithGoogleTranslate(
  lrcText: string,
): Promise<DeepLLrcTranslateOutcome> {
  const lines = normalizeLrcLines(lrcText);
  if (lines.length === 0) {
    logNrmDev('lyrics.translate', { event: 'googletranslate_empty_input' });
    return { ok: true, lrc: '' };
  }

  const slots = planLrcTranslationSlots(lines);
  if (slots.length === 0) {
    return { ok: true, lrc: lines.join('\n') };
  }

  const { texts: apiTexts, slotIndices } = extractDeepLTextsFromSlots(slots);

  logNrmDev('lyrics.translate', {
    event: 'googletranslate_request',
    lineCount: lines.length,
    slotCount: slots.length,
    apiLineCount: apiTexts.length,
    targetLang: 'ko',
  });

  let responses: string[] = [];
  let sourceLangs: string[] = [];
  if (apiTexts.length > 0) {
    const translated = await translateTextsWithGoogleTranslate(apiTexts);
    if (!translated.ok) {
      logNrmDev('lyrics.translate', {
        event: 'googletranslate_fail',
        message: translated.message,
      });
      return { ok: false, message: translated.message };
    }
    responses = translated.texts;
    sourceLangs = translated.sourceLangs;
    if (responses.length !== apiTexts.length) {
      return {
        ok: false,
        message: 'Google Translate 번역 결과 개수가 요청과 일치하지 않습니다.',
      };
    }
    const hasKoreanLine = responses.some((line) => containsHangul(line));
    if (!hasKoreanLine) {
      return {
        ok: false,
        message: 'Google Translate 번역 결과에 한글이 없습니다. 네트워크 연결을 확인해주세요.',
      };
    }
  }

  const outLrc = mergeDeepLResponsesIntoLrc(
    lines,
    slots,
    slotIndices,
    responses,
    sourceLangs,
  );

  if (apiTexts.length > 0 && !lrcHasTranslationPairs(outLrc)) {
    logNrmDev('lyrics.translate', {
      event: 'googletranslate_no_pairs',
      apiLineCount: apiTexts.length,
    });
    return {
      ok: false,
      message: 'Google Translate 번역 결과에 한글 번역 줄이 없습니다.',
    };
  }

  logNrmDev('lyrics.translate', {
    event: 'googletranslate_ok',
    lrcChars: outLrc.length,
  });

  return { ok: true, lrc: outLrc };
}
