import { Platform } from 'react-native';

import { getResolvedApiBaseUrl } from '@/lib/apiBaseUrl';
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

type DeepLTranslateResponse = {
  translations?: Array<{ text?: string }>;
};

function splitLrcLine(line: string): { ts: string; text: string } | null {
  const m = line.match(/^\[(\d{2}:\d{2}\.\d{2})\](.*)$/);
  if (!m) return null;
  return { ts: m[1], text: (m[2] ?? '').trim() };
}

function buildBilingualLrc(
  sourceLines: string[],
  translatedByIndex: Map<number, string>,
): string {
  const out: string[] = [];
  for (let i = 0; i < sourceLines.length; i++) {
    const line = sourceLines[i];
    const parsed = splitLrcLine(line);
    if (!parsed) {
      out.push(line);
      continue;
    }
    out.push(`[${parsed.ts}]${parsed.text}`);
    const translated = (translatedByIndex.get(i) ?? '').trim();
    if (!translated) continue;
    out.push(`[${parsed.ts}](${translated})`);
  }
  return out.join('\n').trim();
}

export type DeepLLrcTranslateOutcome =
  | { ok: true; lrc: string }
  | { ok: false; message: string };

export async function translateLrcToKoreanWithDeepL(
  lrcText: string,
  apiKey: string,
): Promise<DeepLLrcTranslateOutcome> {
  const key = apiKey.trim();
  if (!key) return { ok: false, message: 'API 토큰을 먼저 등록해주세요.' };

  const lines = lrcText
    .split(/\r?\n/)
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
  if (lines.length === 0) return { ok: true, lrc: '' };

  const targets: Array<{ idx: number; text: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    const parsed = splitLrcLine(lines[i]);
    if (!parsed || !parsed.text) continue;
    targets.push({ idx: i, text: parsed.text });
  }
  if (targets.length === 0) return { ok: true, lrc: lines.join('\n') };

  const body = new URLSearchParams();
  body.set('target_lang', 'KO');
  body.set('preserve_formatting', '1');
  body.set('split_sentences', 'nonewlines');
  for (const target of targets) {
    body.append('text', target.text);
  }

  let res: Response;
  try {
    res = await fetch(`${DEEPL_FREE_API}/translate`, {
      method: 'POST',
      headers: { ...authHeader(key), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (res.status === 403 || res.status === 404) {
      res = await fetch(`${DEEPL_PRO_API}/translate`, {
        method: 'POST',
        headers: { ...authHeader(key), 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
    }
  } catch {
    return { ok: false, message: 'DeepL 서버와 통신할 수 없습니다.' };
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: 'DeepL API 토큰이 올바르지 않습니다.' };
    }
    if (res.status === 456 || res.status === 429) {
      return { ok: false, message: 'DeepL 사용량이 초과되었습니다.' };
    }
    return { ok: false, message: 'DeepL 번역 요청에 실패했습니다.' };
  }

  try {
    const json = (await res.json()) as DeepLTranslateResponse;
    const translated = json.translations ?? [];
    const byIndex = new Map<number, string>();
    for (let i = 0; i < targets.length; i++) {
      byIndex.set(targets[i].idx, (translated[i]?.text ?? '').trim());
    }
    return { ok: true, lrc: buildBilingualLrc(lines, byIndex) };
  } catch {
    return { ok: false, message: 'DeepL 번역 응답을 해석하지 못했습니다.' };
  }
}
