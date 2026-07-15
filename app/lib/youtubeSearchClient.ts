import { Platform } from 'react-native';

import { nrmBackendFetch } from '@/lib/nrmBackendFetch';
import { usesPcBackendInDev } from '@/lib/nrmDevRuntime';
import { YOUTUBE_SEARCH_PAGE_SIZE } from '@/lib/nrmYoutubeSearchPageSize';
import {
  clearApiBaseUrlOverride,
  getDefaultApiBaseUrl,
  getResolvedApiBaseUrl,
} from '@/lib/apiBaseUrl';
import { buildYoutubeSearchQuery } from '@/lib/nrmYoutubeSearchQuery';
import { getYoutubeSearchSuffixMode } from '@/lib/nrmYoutubeSearchSettings';
import { rerankYoutubeSearchItems } from '@/lib/nrmYoutubeSearchRerank';
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

function normalizeNextCursor(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  return v.length > 0 ? v : null;
}

function extractPage(parsed: unknown): { items: YoutubeSearchItem[]; nextCursor: string | null } | null {
  if (Array.isArray(parsed)) {
    return { items: parsed as YoutubeSearchItem[], nextCursor: null };
  }
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as { items?: unknown; nextCursor?: unknown };
    if (Array.isArray(obj.items)) {
      return {
        items: obj.items as YoutubeSearchItem[],
        nextCursor: normalizeNextCursor(obj.nextCursor),
      };
    }
  }
  return null;
}

async function youtubeSearchPageWithBase(
  q: string,
  cursor: string | null,
  limit: number,
  base: string,
): Promise<YoutubeSearchOutcome> {
  try {
    const params = new URLSearchParams({
      q,
      limit: String(limit),
    });
    if (cursor) {
      params.set('cursor', cursor);
    }
    const res = await nrmBackendFetch(`${base}/api/youtube/search?${params.toString()}`);
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
    const page = extractPage(parsed);
    if (!page) {
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
    return { ok: true, items: page.items, nextCursor: page.nextCursor };
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

async function resolveQueryForApi(q: string): Promise<string> {
  const suffixMode = await getYoutubeSearchSuffixMode();
  return buildYoutubeSearchQuery(q, suffixMode);
}

function applySearchRerank(
  out: YoutubeSearchOutcome,
  userQuery: string,
  mode: Awaited<ReturnType<typeof getYoutubeSearchSuffixMode>>,
): YoutubeSearchOutcome {
  if (!out.ok || out.items.length <= 1) return out;
  return {
    ...out,
    items: rerankYoutubeSearchItems(out.items, userQuery, mode),
  };
}

export async function searchYoutubePage(
  q: string,
  cursor: string | null = null,
  limit = YOUTUBE_SEARCH_PAGE_SIZE,
): Promise<YoutubeSearchOutcome> {
  const suffixMode = await getYoutubeSearchSuffixMode();
  const queryForApi = buildYoutubeSearchQuery(q, suffixMode);

  if (Platform.OS !== 'web' && !usesPcBackendInDev()) {
    const { searchYoutubePageOnDevice } = await import('@/lib/nrmInnertubeYoutube');
    const out = await searchYoutubePageOnDevice(queryForApi, cursor);
    return applySearchRerank(out, q, suffixMode);
  }

  const resolved = await getResolvedApiBaseUrl();
  const def = getDefaultApiBaseUrl();

  let out = await youtubeSearchPageWithBase(queryForApi, cursor, limit, resolved);

  if (!out.ok && resolved !== def) {
    const retry =
      out.dev.httpStatus === 404 ||
      out.dev.where === 'youtubeSearch.fetch' ||
      out.dev.where === 'youtubeSearch.jsonParse' ||
      out.dev.where === 'youtubeSearch.notArray';
    if (retry) {
      const second = await youtubeSearchPageWithBase(queryForApi, cursor, limit, def);
      if (second.ok) {
        await clearApiBaseUrlOverride();
      }
      out = second;
    }
  }

  return applySearchRerank(out, q, suffixMode);
}

/** 첫 페이지만 (호환) */
export async function searchYoutube(q: string): Promise<YoutubeSearchOutcome> {
  return searchYoutubePage(q, null);
}

export function mergeYoutubeSearchItems(
  prev: YoutubeSearchItem[],
  next: YoutubeSearchItem[],
): YoutubeSearchItem[] {
  if (next.length === 0) return prev;
  const seen = new Set(prev.map((v) => v.videoId));
  const merged = [...prev];
  for (const item of next) {
    if (seen.has(item.videoId)) continue;
    seen.add(item.videoId);
    merged.push(item);
  }
  return merged;
}
