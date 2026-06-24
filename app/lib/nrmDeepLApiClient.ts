import { Platform } from 'react-native';

import { getResolvedApiBaseUrl } from '@/lib/apiBaseUrl';
import {
  extractDeepLTextsFromSlots,
  lrcHasTranslationPairs,
  mergeDeepLResponsesIntoLrc,
  normalizeLrcLines,
  planLrcTranslationSlots,
} from '@/lib/nrmDeepLLrcFormat';
import { translateTextsWithDeepL } from '@/lib/nrmDeepLTranslateTransport';
import { logNrmDev, logNrmRunError } from '@/lib/nrmDevLog';
import { nrmBackendFetch } from '@/lib/nrmBackendFetch';
import { nrmDirectFetch } from '@/lib/nrmLoggedFetch';
import { saveDeepLUsageSnapshot, type NrmDeepLUsageSnapshot } from '@/lib/nrmDeepLApiSettings';

const DEEPL_FREE_API = 'https://api-free.deepl.com/v2';
const DEEPL_PRO_API = 'https://api.deepl.com/v2';
/** /v2/usage GET 요청 타임아웃 (ms). 단순 조회이므로 30초면 충분. */
const DEEPL_USAGE_TIMEOUT_MS = 30_000;

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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEEPL_USAGE_TIMEOUT_MS);
  try {
    return await nrmDirectFetch(
      `${baseUrl}/usage`,
      { headers: authHeader(apiKey), signal: controller.signal },
      'deepl-usage',
    );
  } catch (e) {
    if (controller.signal.aborted) {
      throw new Error('DeepL 사용량 조회 시간이 초과되었습니다.');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
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

function previewText(v: string, max = 90): string {
  const oneLine = v.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max)}…`;
}

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
  let deeplSourceLangs: string[] = [];
  if (apiTexts.length > 0) {
    logNrmDev('lyrics.translate', {
      event: 'deepl_request_payload_preview',
      count: apiTexts.length,
      sample: apiTexts.slice(0, 5).map((text, i) => ({
        i,
        text: previewText(text),
      })),
    });
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
    deeplSourceLangs = translated.sourceLangs;
    logNrmDev('lyrics.translate', {
      event: 'deepl_response_payload_preview',
      transport: translated.transport,
      apiUsed: translated.apiUsed,
      count: deeplResponses.length,
      sample: deeplResponses.slice(0, 5).map((text, i) => ({
        i,
        sourceLang: deeplSourceLangs[i] ?? '',
        text: previewText(text),
      })),
    });
    if (deeplResponses.length !== apiTexts.length) {
      return { ok: false, message: 'DeepL 번역 결과 개수가 요청과 일치하지 않습니다.' };
    }
    if (deeplSourceLangs.length !== apiTexts.length) {
      return { ok: false, message: 'DeepL 감지 언어 결과 개수가 요청과 일치하지 않습니다.' };
    }
  }

  const emptyApiTranslations = deeplResponses.filter((v) => !v.trim()).length;
  const mergeDecisions = slotIndices.slice(0, 10).map((slotPos, apiIdx) => {
    const slot = slots[slotPos];
    const sourceLang = (deeplSourceLangs[apiIdx] ?? '').trim().toUpperCase();
    const rawTranslated = (deeplResponses[apiIdx] ?? '').trim();
    const skipKo = sourceLang === 'KO';
    const applied = !skipKo && rawTranslated.length > 0;
    return {
      lineIndex: slot.lineIndex,
      sourceLang,
      source: previewText(slot.lyricText),
      translated: previewText(rawTranslated),
      applied,
      reason: skipKo ? 'detected_ko_skip' : applied ? 'deepl_applied' : 'empty_translation',
    };
  });
  logNrmDev('lyrics.translate', {
    event: 'deepl_merge_plan_preview',
    slotCount: slots.length,
    apiMappedCount: slotIndices.length,
    localOnlyCount,
    sample: mergeDecisions,
  });
  const outLrc = mergeDeepLResponsesIntoLrc(
    lines,
    slots,
    slotIndices,
    deeplResponses,
    deeplSourceLangs,
  );
  const skippedKoCount = deeplSourceLangs.filter((lang) => lang === 'KO').length;

  logNrmDev('lyrics.translate', {
    event: 'deepl_response_ok',
    apiLineCount: apiTexts.length,
    emptyApiTranslations,
    skippedKoCount,
    localOnlyCount,
    outLrcChars: outLrc.length,
  });
  const outLines = outLrc.split(/\r?\n/);
  logNrmDev('lyrics.translate', {
    event: 'deepl_merge_result_preview',
    outLineCount: outLines.length,
    outSample: outLines
      .slice(0, 8)
      .map((line, i) => ({ i, line: previewText(line, 120) })),
  });

  const translatedLineCount = outLines.filter((l) => /\([^)]+\)\s*$/.test(l)).length;
  if (apiTexts.length > 0 && !lrcHasTranslationPairs(outLrc)) {
    if (emptyApiTranslations === apiTexts.length && translatedLineCount === 0) {
      return { ok: false, message: 'DeepL 번역 결과가 비어 있습니다.' };
    }
    return { ok: false, message: 'DeepL 번역 결과에 한글 번역 줄이 없습니다.' };
  }

  return { ok: true, lrc: outLrc };
}

export {
  buildTranslationSupportedLrc,
  normalizeLrcLines,
  planLrcTranslationSlots,
} from '@/lib/nrmDeepLLrcFormat';

