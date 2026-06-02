import { Platform } from 'react-native';

import { getResolvedApiBaseUrl } from '@/lib/apiBaseUrl';
import {
  extractDeepLTextsFromSlots,
  mergeDeepLResponsesIntoLrc,
  normalizeLrcLines,
  planLrcTranslationSlots,
} from '@/lib/nrmDeepLLrcFormat';
import { translateTextsWithDeepL } from '@/lib/nrmDeepLTranslateTransport';
import { logNrmDev, logNrmRunError } from '@/lib/nrmDevLog';
import { nrmBackendFetch } from '@/lib/nrmBackendFetch';
import { saveDeepLUsageSnapshot, type NrmDeepLUsageSnapshot } from '@/lib/nrmDeepLApiSettings';

const DEEPL_FREE_API = 'https://api-free.deepl.com/v2';
const DEEPL_PRO_API = 'https://api.deepl.com/v2';

export type DeepLUsageOutcome =
  | { ok: true; usage: NrmDeepLUsageSnapshot }
  | { ok: false; message: string };

type DeepLUsageResponse = {
  character_count?: number;
  character_limit?: number;
};

function authHeader(apiKey: string): Record<string, string> {
  return { Authorization: `DeepL-Auth-Key ${apiKey.trim()}` };
}

async function fetchUsageWithBase(baseUrl: string, apiKey: string): Promise<Response> {
  return fetch(`${baseUrl}/usage`, { headers: authHeader(apiKey) });
}

async function fetchUsageViaBackend(apiKey: string): Promise<Response | null> {
  const base = await getResolvedApiBaseUrl();
  if (!base) return null;
  return nrmBackendFetch(`${base}/api/deepl/usage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: apiKey.trim() }),
  });
}

export async function fetchDeepLUsage(apiKey: string): Promise<DeepLUsageOutcome> {
  const key = apiKey.trim();
  if (!key) return { ok: false, message: 'API 토큰을 먼저 등록해주세요.' };

  let res: Response;
  try {
    res = await fetchUsageWithBase(DEEPL_FREE_API, key);
    if (res.status === 403 || res.status === 404) {
      res = await fetchUsageWithBase(DEEPL_PRO_API, key);
    }
  } catch {
    if (Platform.OS === 'web') {
      try {
        const proxied = await fetchUsageViaBackend(key);
        if (!proxied) return { ok: false, message: 'DeepL 서버와 통신할 수 없습니다.' };
        res = proxied;
      } catch {
        return { ok: false, message: 'DeepL 서버와 통신할 수 없습니다.' };
      }
    } else {
      return { ok: false, message: 'DeepL 서버와 통신할 수 없습니다.' };
    }
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: 'DeepL API 토큰이 올바르지 않습니다.' };
    }
    return { ok: false, message: 'DeepL 사용량 조회에 실패했습니다.' };
  }

  try {
    const body = (await res.json()) as DeepLUsageResponse;
    const usage: NrmDeepLUsageSnapshot = {
      characterCount: Math.max(0, Math.floor(body.character_count ?? 0)),
      characterLimit: Math.max(0, Math.floor(body.character_limit ?? 0)),
      checkedAt: Date.now(),
    };
    await saveDeepLUsageSnapshot(usage);
    return { ok: true, usage };
  } catch {
    return { ok: false, message: 'DeepL 사용량 응답을 해석하지 못했습니다.' };
  }
}

export function isDeepLExhausted(usage: NrmDeepLUsageSnapshot | null): boolean {
  if (!usage) return false;
  if (usage.characterLimit <= 0) return false;
  return usage.characterCount >= usage.characterLimit;
}

export type DeepLLrcTranslateOutcome =
  | { ok: true; lrc: string }
  | { ok: false; message: string };

export async function translateLrcToKoreanWithDeepL(
  lrcText: string,
  apiKey: string,
): Promise<DeepLLrcTranslateOutcome> {
  const key = apiKey.trim();
  if (!key) {
    logNrmDev('lyrics.translate', { event: 'deepl_no_api_key' });
    return { ok: false, message: 'API 토큰을 먼저 등록해주세요.' };
  }

  const lines = normalizeLrcLines(lrcText);
  if (lines.length === 0) {
    logNrmDev('lyrics.translate', { event: 'deepl_empty_input' });
    return { ok: true, lrc: '' };
  }

  const slots = planLrcTranslationSlots(lines);
  if (slots.length === 0) {
    logNrmDev('lyrics.translate', {
      event: 'deepl_no_timestamp_lines',
      lineCount: lines.length,
    });
    return { ok: true, lrc: lines.join('\n') };
  }

  const { texts: apiTexts, slotIndices } = extractDeepLTextsFromSlots(slots);
  const localOnlyCount = slots.filter((s) => s.localTranslation && !s.deeplText).length;
  const apiCharCount = apiTexts.reduce((n, t) => n + t.length, 0);

  logNrmDev('lyrics.translate', {
    event: 'deepl_request',
    lineCount: lines.length,
    slotCount: slots.length,
    apiLineCount: apiTexts.length,
    localOnlyCount,
    apiCharCount,
    targetLang: 'KO',
    sourceLang: 'auto',
    mode: 'lyric_text_only_per_slot',
  });

  let deeplResponses: string[] = [];
  if (apiTexts.length > 0) {
    const translated = await translateTextsWithDeepL(key, apiTexts);
    if (!translated.ok) {
      logNrmDev('lyrics.translate', {
        event: 'deepl_fail',
        message: translated.message,
        transport: translated.transport,
      });
      return { ok: false, message: translated.message };
    }
    deeplResponses = translated.texts;
    if (deeplResponses.length !== apiTexts.length) {
      return { ok: false, message: 'DeepL 번역 결과 개수가 요청과 일치하지 않습니다.' };
    }
  }

  const emptyApiTranslations = deeplResponses.filter((v) => !v.trim()).length;
  const outLrc = mergeDeepLResponsesIntoLrc(lines, slots, slotIndices, deeplResponses);

  logNrmDev('lyrics.translate', {
    event: 'deepl_response_ok',
    apiLineCount: apiTexts.length,
    emptyApiTranslations,
    localOnlyCount,
    outLrcChars: outLrc.length,
  });

  const translatedLineCount = outLrc.split(/\r?\n/).filter((l) => /\([^)]+\)\s*$/.test(l)).length;
  if (apiTexts.length > 0 && emptyApiTranslations === apiTexts.length && translatedLineCount === 0) {
    return { ok: false, message: 'DeepL 번역 결과가 비어 있습니다.' };
  }

  return { ok: true, lrc: outLrc };
}

export {
  buildTranslationSupportedLrc,
  normalizeLrcLines,
  planLrcTranslationSlots,
} from '@/lib/nrmDeepLLrcFormat';
