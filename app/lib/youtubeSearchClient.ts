import { Platform } from 'react-native';

import { usesPcBackendInDev } from '@/lib/nrmDevRuntime';
import {
  clearApiBaseUrlOverride,
  getDefaultApiBaseUrl,
  getResolvedApiBaseUrl,
} from '@/lib/apiBaseUrl';
import { buildYoutubeSearchQuery } from '@/lib/nrmYoutubeSearchQuery';
import { getYoutubeSearchSuffixMode } from '@/lib/nrmYoutubeSearchSettings';
import {
  nrmYoutubeSearchApiKeyMissingMessage,
  nrmYoutubeSearchBackendConnectionMessage,
  nrmYoutubeSearchBadResponseMessage,
  nrmYoutubeSearchEmptyQueryMessage,
  nrmYoutubeSearchEndpointMissingMessage,
  nrmYoutubeSearchParseErrorMessage,
  nrmYoutubeSearchYoutubeApiErrorMessage,
} from '@/lib/nrmYoutubeStrings';
import type {
  YoutubeSearchItem,
  YoutubeSearchOutcome,
} from '@/lib/youtubeSearchTypes';

export type { YoutubeSearchItem, YoutubeSearchOutcome };

function userMessageForServerError(
  httpStatus: number,
  errorCode: string | undefined | null,
): string {
  if (errorCode === 'youtube_api_key_missing') {
    return nrmYoutubeSearchApiKeyMissingMessage;
  }
  if (errorCode === 'youtube_api_error') {
    return nrmYoutubeSearchYoutubeApiErrorMessage;
  }
  if (errorCode === 'youtube_parse_error') {
    return nrmYoutubeSearchParseErrorMessage;
  }
  if (errorCode === 'empty_query') {
    return nrmYoutubeSearchEmptyQueryMessage;
  }
  if (httpStatus === 404) {
    return nrmYoutubeSearchEndpointMissingMessage;
  }
  if (httpStatus === 503) {
    return nrmYoutubeSearchApiKeyMissingMessage;
  }
  if (httpStatus >= 500) {
    return nrmYoutubeSearchYoutubeApiErrorMessage;
  }
  return nrmYoutubeSearchBadResponseMessage;
}

function extractItems(parsed: unknown): YoutubeSearchItem[] | null {
  if (Array.isArray(parsed)) {
    return parsed as YoutubeSearchItem[];
  }
  if (
    parsed &&
    typeof parsed === 'object' &&
    Array.isArray((parsed as { items?: unknown }).items)
  ) {
    return (parsed as { items: YoutubeSearchItem[] }).items;
  }
  return null;
}

async function youtubeSearchWithBase(
  q: string,
  base: string,
): Promise<YoutubeSearchOutcome> {
  try {
    const res = await fetch(
      `${base}/api/youtube/search?q=${encodeURIComponent(q)}`,
    );
    const rawText = await res.text();
    if (!res.ok) {
      let code: string | undefined;
      try {
        code = (JSON.parse(rawText) as { error?: string }).error;
      } catch {
        //
      }
      return {
        ok: false,
        userMessage: userMessageForServerError(res.status, code),
        dev: {
          where: 'youtubeSearch.httpError',
          httpStatus: res.status,
          errorCode: code ?? null,
          apiBaseUrl: base,
          bodySample: rawText.slice(0, 500),
        },
      };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch (e) {
      return {
        ok: false,
        userMessage: nrmYoutubeSearchBadResponseMessage,
        dev: {
          where: 'youtubeSearch.jsonParse',
          apiBaseUrl: base,
          cause: e instanceof Error ? e.message : String(e),
          bodySample: rawText.slice(0, 300),
        },
      };
    }
    const items = extractItems(parsed);
    if (!items) {
      return {
        ok: false,
        userMessage: nrmYoutubeSearchBadResponseMessage,
        dev: {
          where: 'youtubeSearch.notArray',
          apiBaseUrl: base,
          typeofParsed: typeof parsed,
          keys:
            parsed && typeof parsed === 'object'
              ? Object.keys(parsed as Record<string, unknown>).slice(0, 20)
              : [],
        },
      };
    }
    return { ok: true, items };
  } catch (e) {
    const cause = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      userMessage: nrmYoutubeSearchBackendConnectionMessage,
      dev: {
        where: 'youtubeSearch.fetch',
        apiBaseUrl: base,
        cause,
        name: e instanceof Error ? e.name : typeof e,
      },
    };
  }
}

export async function searchYoutube(q: string): Promise<YoutubeSearchOutcome> {
  const suffixMode = await getYoutubeSearchSuffixMode();
  const queryForApi = buildYoutubeSearchQuery(q, suffixMode);

  if (Platform.OS !== 'web' && !usesPcBackendInDev()) {
    const { searchYoutubeOnDevice } = await import('@/lib/nrmInnertubeYoutube');
    return searchYoutubeOnDevice(queryForApi);
  }

  const resolved = await getResolvedApiBaseUrl();
  const def = getDefaultApiBaseUrl();

  let out = await youtubeSearchWithBase(queryForApi, resolved);

  if (!out.ok && resolved !== def) {
    const retry =
      out.dev.httpStatus === 404 ||
      out.dev.where === 'youtubeSearch.fetch' ||
      out.dev.where === 'youtubeSearch.jsonParse' ||
      out.dev.where === 'youtubeSearch.notArray';
    if (retry) {
      const second = await youtubeSearchWithBase(queryForApi, def);
      if (second.ok) {
        await clearApiBaseUrlOverride();
      }
      out = second;
    }
  }

  return out;
}
