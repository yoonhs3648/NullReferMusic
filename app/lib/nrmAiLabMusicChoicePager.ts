/**
 * AI Lab 음악 선택 칩 페이지네이션.
 * 트랙/아티스트/앨범/차트 목록만 대상(예·아니요 가사 칩 제외).
 * 한 페이지 최대 5개 + 남은 항목이 있으면 「다른 목록 보기」.
 */

import type { NrmAiLabChoice, NrmAiLabTrackHit } from '@/lib/nrmAiLabDownloadTools';
import { cacheAiLabTrackHits } from '@/lib/nrmAiLabDownloadTools';
import {
  searchMelonAlbumsPage,
  searchMelonArtistsPage,
  searchMelonTracksPage,
} from '@/lib/nrmMelonSearchClient';
import { formatAiLabTrackChoiceLabel } from '@/lib/nrmMusicMetadataProvider';

export const AI_LAB_MUSIC_LIST_PAGE_SIZE = 5;

export const AI_LAB_MORE_MUSIC_LIST_ID = 'ailab_more_music_list';

/** 사용자에게 보이는 「다른 목록」칩 문구 */
export const AI_LAB_MORE_MUSIC_LIST_LABEL = '다른 목록 보기';

export const AI_LAB_MORE_MUSIC_LIST_CHOICE: NrmAiLabChoice = {
  id: AI_LAB_MORE_MUSIC_LIST_ID,
  label: AI_LAB_MORE_MUSIC_LIST_LABEL,
};

export const AI_LAB_MUSIC_LIST_EXHAUSTED_MESSAGE =
  '더 이상 표시할 목록이 없습니다. 다른 검색어나 날짜로 다시 요청해 주세요.';

export const AI_LAB_MUSIC_LIST_NEXT_PROMPT =
  '아래 목록에서 선택해 주세요. 원하시면 「다른 목록 보기」로 이어서 볼 수 있습니다.';

export type AiLabMusicListKind = 'track' | 'artist' | 'album' | 'chart';

type PagerState = {
  kind: AiLabMusicListKind;
  /** 지금까지 적재한 전체 선택지(「다른 목록」칩 제외) */
  items: NrmAiLabChoice[];
  /** 다음에 보여줄 offset */
  offset: number;
  /** Melon 추가 페이지용 */
  query: string | null;
  remoteCursor: string | null;
};

let pager: PagerState | null = null;

export function isAiLabMoreMusicListChoiceId(id: string): boolean {
  return String(id ?? '').trim() === AI_LAB_MORE_MUSIC_LIST_ID;
}

export function clearAiLabMusicListPager(): void {
  pager = null;
}

function withMoreChip(pageItems: NrmAiLabChoice[], hasMore: boolean): NrmAiLabChoice[] {
  if (!hasMore) return pageItems;
  return [...pageItems, AI_LAB_MORE_MUSIC_LIST_CHOICE];
}

function pageSlice(items: NrmAiLabChoice[], offset: number): {
  page: NrmAiLabChoice[];
  nextOffset: number;
  hasMore: boolean;
} {
  const page = items.slice(offset, offset + AI_LAB_MUSIC_LIST_PAGE_SIZE);
  const nextOffset = offset + page.length;
  const hasMoreLocal = nextOffset < items.length;
  return { page, nextOffset, hasMore: hasMoreLocal };
}

/**
 * 새 검색/차트 결과로 페이저 리셋 후 첫 페이지(+다른 목록) 반환.
 * items가 1개 이하면 more 칩 없이 그대로(또는 빈 배열).
 */
export function beginAiLabMusicListPage(params: {
  kind: AiLabMusicListKind;
  items: NrmAiLabChoice[];
  query?: string | null;
  remoteCursor?: string | null;
  /** 트랙이면 hit 캐시 */
  trackHits?: NrmAiLabTrackHit[];
}): { choices: NrmAiLabChoice[]; hasMore: boolean; total: number } {
  if (params.trackHits && params.trackHits.length > 0) {
    cacheAiLabTrackHits(params.trackHits);
  }
  const items = params.items.filter(
    (c) => c?.id && c.id !== AI_LAB_MORE_MUSIC_LIST_ID && String(c.label ?? '').trim(),
  );
  if (items.length <= 1) {
    pager =
      items.length === 0
        ? null
        : {
            kind: params.kind,
            items,
            offset: items.length,
            query: params.query ?? null,
            remoteCursor: null,
          };
    return { choices: items, hasMore: false, total: items.length };
  }

  const { page, nextOffset, hasMore: hasMoreLocal } = pageSlice(items, 0);
  const hasMoreRemote = Boolean(params.remoteCursor);
  const hasMore = hasMoreLocal || hasMoreRemote;
  pager = {
    kind: params.kind,
    items,
    offset: nextOffset,
    query: params.query ?? null,
    remoteCursor: params.remoteCursor ?? null,
  };
  return {
    choices: withMoreChip(page, hasMore),
    hasMore,
    total: items.length,
  };
}

async function appendRemotePage(): Promise<boolean> {
  if (!pager?.query || !pager.remoteCursor) return false;
  const q = pager.query;
  const cursor = pager.remoteCursor;
  if (pager.kind === 'track') {
    const out = await searchMelonTracksPage(q, cursor);
    if (!out.ok || !out.data.tracks?.length) {
      pager.remoteCursor = null;
      return false;
    }
    const hits: NrmAiLabTrackHit[] = out.data.tracks.map((t) => ({
      ref: `melon:${t.songId}`,
      platform: 'melon',
      title: t.name,
      artist: t.artist,
      album: t.album,
      imageUrl: t.imageUrl,
      externalUrl: t.url,
      releaseDate: '',
      genre: '',
    }));
    cacheAiLabTrackHits(hits);
    const existing = new Set(pager.items.map((c) => c.id));
    for (const h of hits) {
      if (existing.has(h.ref)) continue;
      pager.items.push({ id: h.ref, label: formatAiLabTrackChoiceLabel(h) });
      existing.add(h.ref);
    }
    pager.remoteCursor = out.data.nextCursor ?? null;
    return true;
  }
  if (pager.kind === 'artist') {
    const out = await searchMelonArtistsPage(q, cursor);
    if (!out.ok || !out.data.artists?.length) {
      pager.remoteCursor = null;
      return false;
    }
    const existing = new Set(pager.items.map((c) => c.id));
    for (const a of out.data.artists) {
      const id = `melon-artist:${a.artistId}`;
      if (existing.has(id)) continue;
      pager.items.push({ id, label: a.name.trim() });
      existing.add(id);
    }
    pager.remoteCursor = out.data.nextCursor ?? null;
    return true;
  }
  if (pager.kind === 'album') {
    const out = await searchMelonAlbumsPage(q, cursor);
    if (!out.ok || !out.data.albums?.length) {
      pager.remoteCursor = null;
      return false;
    }
    const existing = new Set(pager.items.map((c) => c.id));
    for (const a of out.data.albums) {
      const id = `melon-album:${a.albumId}`;
      if (existing.has(id)) continue;
      pager.items.push({
        id,
        label: `${a.artist.trim()} - ${a.name.trim()}`.trim(),
      });
      existing.add(id);
    }
    pager.remoteCursor = out.data.nextCursor ?? null;
    return true;
  }
  // chart: remote 없음
  pager.remoteCursor = null;
  return false;
}

/**
 * 「다른 목록 보기」 — 다음 최대 5개(+more).
 * 소진 시 exhausted.
 */
export async function advanceAiLabMusicListPage(): Promise<
  | { ok: true; choices: NrmAiLabChoice[]; prompt: string }
  | { ok: false; exhausted: true; message: string }
> {
  if (!pager) {
    return { ok: false, exhausted: true, message: AI_LAB_MUSIC_LIST_EXHAUSTED_MESSAGE };
  }

  if (pager.offset >= pager.items.length && pager.remoteCursor) {
    await appendRemotePage();
  }

  if (pager.offset >= pager.items.length) {
    clearAiLabMusicListPager();
    return { ok: false, exhausted: true, message: AI_LAB_MUSIC_LIST_EXHAUSTED_MESSAGE };
  }

  const { page, nextOffset, hasMore: hasMoreLocal } = pageSlice(pager.items, pager.offset);
  pager.offset = nextOffset;
  const hasMore = hasMoreLocal || Boolean(pager.remoteCursor);
  if (!hasMore && pager.offset >= pager.items.length) {
    // 마지막 페이지 — more 칩 없이 반환 후 페이저 유지(재클릭 시 exhausted)
  }
  return {
    ok: true,
    choices: withMoreChip(page, hasMore),
    prompt: AI_LAB_MUSIC_LIST_NEXT_PROMPT,
  };
}

export function trackHitsToChoices(hits: NrmAiLabTrackHit[]): NrmAiLabChoice[] {
  return hits.map((h) => ({
    id: h.ref,
    label:
      typeof h.rank === 'number' && h.rank > 0
        ? `#${h.rank} ${formatAiLabTrackChoiceLabel(h)}`
        : formatAiLabTrackChoiceLabel(h),
  }));
}
