/**
 * AI Lab Melon 차트 조회 — 일/주/월/년/실시간.
 * 과거 특정일 일간은 Melon이 dayTime을 무시하므로, 요청일과 최신 일간이 다르면
 * 해당 일이 속한 주간 차트로 폴백한다.
 */

import type { NrmAiLabChoice, NrmAiLabTrackHit } from '@/lib/nrmAiLabDownloadTools';
import { cacheAiLabTrackHits } from '@/lib/nrmAiLabDownloadTools';
import type { ChartTrackItem } from '@/lib/nrmChartsTypes';
import { fetchMelonDailyChart } from '@/lib/nrmMelonDailyChartsClient';
import {
  MELON_DEFAULT_GENRE_ID,
  MELON_GENRE_OPTIONS,
  clampMelonGenreForKind,
  melonGenreLabel,
  melonWeekSlotContainingYmd,
  type MelonGenreId,
  type MelonPeriodChartKind,
} from '@/lib/nrmMelonGenreChartCatalog';
import { fetchMelonGenreChartPage } from '@/lib/nrmMelonGenreChartsClient';
import { fetchMelonRealtimeChart } from '@/lib/nrmMelonRealtimeChartsClient';
import type { MelonRealtimeChartTabId } from '@/lib/nrmMelonRealtimeChartCatalog';
import {
  beginAiLabMusicListPage,
  trackHitsToChoices,
} from '@/lib/nrmAiLabMusicChoicePager';

export type MelonAiLabChartPeriod =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'yearly'
  | 'realtime';

export type SearchMelonChartArgs = {
  period: MelonAiLabChartPeriod;
  /** YYYY-MM-DD (KST 기준 권장). realtime은 생략 가능 */
  date?: string;
  /** 1~100. 있으면 해당 순위 1곡만 */
  rank?: number;
  /** rank 없을 때 상위 N (기본 10, 최대 20) */
  limit?: number;
  /** Melon classCd 또는 장르 라벨. 기본 장르종합 */
  genre?: string;
  /** realtime만: top100|hot100 */
  chart?: string;
};

function kstTodayYmd(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
}

function parseYmd(raw: string | undefined): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function resolveGenreId(raw: string | undefined, kind: MelonPeriodChartKind | 'daily' | 'realtime'): MelonGenreId {
  const t = String(raw ?? '').trim();
  if (!t) return MELON_DEFAULT_GENRE_ID;
  const byId = MELON_GENRE_OPTIONS.find((g) => g.id.toLowerCase() === t.toLowerCase());
  if (byId) {
    return kind === 'yearly' || kind === 'weekly' || kind === 'monthly'
      ? clampMelonGenreForKind(byId.id, kind)
      : byId.id;
  }
  const byLabel = MELON_GENRE_OPTIONS.find((g) => g.label === t || g.label.includes(t));
  if (byLabel) {
    return kind === 'yearly' || kind === 'weekly' || kind === 'monthly'
      ? clampMelonGenreForKind(byLabel.id, kind)
      : byLabel.id;
  }
  return MELON_DEFAULT_GENRE_ID;
}

function chartTrackToHit(track: ChartTrackItem): NrmAiLabTrackHit {
  const songId = String(track.trackId ?? '').trim();
  return {
    ref: songId ? `melon:${songId}` : `melon:chart:${track.rank}:${track.title}`,
    platform: 'melon',
    title: track.title.trim(),
    artist: track.artists.trim(),
    album: (track.album ?? '').trim(),
    imageUrl: track.imageUrl ?? '',
    externalUrl: track.externalUrl || (songId ? `https://www.melon.com/song/detail.htm?songId=${songId}` : ''),
    releaseDate: track.releaseDate ?? '',
    genre: track.genre ?? '',
    rank: track.rank,
  };
}

function toChartChoices(hits: NrmAiLabTrackHit[]): NrmAiLabChoice[] {
  return trackHitsToChoices(hits);
}

function sliceByRankOrLimit(
  items: ChartTrackItem[],
  rank: number | undefined,
  limit: number,
): ChartTrackItem[] {
  if (rank != null && Number.isFinite(rank) && rank >= 1) {
    const hit = items.find((t) => t.rank === rank) ?? items[rank - 1];
    return hit ? [hit] : [];
  }
  // 페이저가 5개씩 자르므로 여기서는 넉넉히(최대 100) 적재
  return items.slice(0, Math.max(1, Math.min(100, limit > 20 ? limit : 100)));
}

export async function searchMelonChartForAiLab(
  args: SearchMelonChartArgs,
): Promise<{ result: Record<string, unknown>; choices?: NrmAiLabChoice[] }> {
  const periodRaw = String(args.period ?? '').trim().toLowerCase();
  const period = (
    ['daily', 'weekly', 'monthly', 'yearly', 'realtime'].includes(periodRaw)
      ? periodRaw
      : ''
  ) as MelonAiLabChartPeriod | '';
  if (!period) {
    return {
      result: {
        ok: false,
        error: 'invalid_period',
        message: 'period는 daily|weekly|monthly|yearly|realtime 중 하나여야 한다.',
      },
    };
  }

  const dateYmd = parseYmd(args.date) ?? (period === 'realtime' ? null : kstTodayYmd());
  const rank =
    args.rank != null && Number.isFinite(Number(args.rank))
      ? Math.max(1, Math.min(100, Math.floor(Number(args.rank))))
      : undefined;
  const limit =
    args.limit != null && Number.isFinite(Number(args.limit))
      ? Math.max(1, Math.min(100, Math.floor(Number(args.limit))))
      : 100;

  let resolvedPeriod: MelonAiLabChartPeriod | MelonPeriodChartKind = period;
  let chartLabel = '';
  let dateLabel: string | null = dateYmd;
  let note: string | null = null;
  let items: ChartTrackItem[] = [];

  if (period === 'realtime') {
    const tab: MelonRealtimeChartTabId =
      String(args.chart ?? '').toLowerCase() === 'hot100' ? 'hot100' : 'top100';
    const out = await fetchMelonRealtimeChart(tab);
    if (!out.ok) {
      return { result: { ok: false, error: out.errorCode, period, resolvedPeriod: period } };
    }
    items = out.data.items;
    chartLabel = out.data.playlistName;
    dateLabel = kstTodayYmd();
  } else if (period === 'daily') {
    const genreId = resolveGenreId(args.genre, 'daily');
    const out = await fetchMelonDailyChart({ classCd: genreId });
    if (!out.ok) {
      return { result: { ok: false, error: out.errorCode, period, resolvedPeriod: period } };
    }
    const published = out.dateLabel ?? null;
    const want = dateYmd;
    const today = kstTodayYmd();
    // Melon 최신 일간 게시일과 요청일이 같으면 일간 사용.
    // 요청이 「오늘」이면 최신 일간을 쓰되, 실시간 1위는 realtime 권장 노트를 남긴다.
    const publishedMatches = Boolean(published && want && want === published);
    const requestIsToday = Boolean(want && want === today);
    if (!want || publishedMatches || requestIsToday) {
      items = out.data.items;
      chartLabel = out.data.playlistName;
      dateLabel = published ?? want;
      resolvedPeriod = 'daily';
      if (requestIsToday && published && want !== published) {
        note = `요청일(${want})의 과거 스냅샷 일간은 Melon이 제공하지 않아, 게시된 최신 일간(${published})을 사용했다. 오늘 실시간 1위는 period=realtime 권장.`;
      }
    } else {
      // 과거 특정일 → 주간 폴백
      const slot = melonWeekSlotContainingYmd(want);
      if (!slot) {
        return {
          result: {
            ok: false,
            error: 'daily_historical_unavailable',
            message: `Melon은 ${want} 일간 차트를 제공하지 않으며 주간 슬롯도 찾지 못했다.`,
            period,
            requestedDate: want,
          },
        };
      }
      const weeklyGenre = resolveGenreId(args.genre, 'weekly');
      const weekly = await fetchMelonGenreChartPage({
        kind: 'weekly',
        classCd: weeklyGenre,
        year: slot.year,
        month: slot.month,
        weekOfMonth: slot.weekOfMonth,
        offset: 0,
        limit: 100,
      });
      if (!weekly.ok) {
        return {
          result: {
            ok: false,
            error: weekly.errorCode,
            period,
            requestedDate: want,
            note: '과거 일간 미지원 → 주간 폴백 실패',
          },
        };
      }
      items = weekly.data.items;
      chartLabel = weekly.data.playlistName;
      dateLabel = want;
      resolvedPeriod = 'weekly';
      note =
        `Melon은 임의 과거일 일간 차트를 제공하지 않는다. ${want}가 속한 주간 차트` +
        `(${slot.startDay}~${slot.endDay})로 대체했다.`;
    }
  } else {
    // weekly / monthly / yearly
    const kind = period as MelonPeriodChartKind;
    const genreId = resolveGenreId(args.genre, kind);
    const ymd = dateYmd ?? kstTodayYmd();
    const y = Number(ymd.slice(0, 4));
    const m = Number(ymd.slice(5, 7));
    let weekOfMonth = 1;
    if (kind === 'weekly') {
      const slot = melonWeekSlotContainingYmd(ymd);
      if (!slot) {
        return {
          result: { ok: false, error: 'week_slot_not_found', requestedDate: ymd, period },
        };
      }
      weekOfMonth = slot.weekOfMonth;
      dateLabel = ymd;
      const page = await fetchMelonGenreChartPage({
        kind: 'weekly',
        classCd: genreId,
        year: slot.year,
        month: slot.month,
        weekOfMonth: slot.weekOfMonth,
        offset: 0,
        limit: 100,
      });
      if (!page.ok) {
        return { result: { ok: false, error: page.errorCode, period, requestedDate: ymd } };
      }
      items = page.data.items;
      chartLabel = page.data.playlistName;
      resolvedPeriod = 'weekly';
    } else if (kind === 'monthly') {
      const page = await fetchMelonGenreChartPage({
        kind: 'monthly',
        classCd: genreId,
        year: y,
        month: m,
        weekOfMonth: 1,
        offset: 0,
        limit: 100,
      });
      if (!page.ok) {
        return { result: { ok: false, error: page.errorCode, period, requestedDate: ymd } };
      }
      items = page.data.items;
      chartLabel = page.data.playlistName;
      dateLabel = `${y}-${String(m).padStart(2, '0')}`;
      resolvedPeriod = 'monthly';
    } else {
      const page = await fetchMelonGenreChartPage({
        kind: 'yearly',
        classCd: clampMelonGenreForKind(genreId, 'yearly'),
        year: y,
        month: 1,
        weekOfMonth: 1,
        offset: 0,
        limit: 100,
      });
      if (!page.ok) {
        return { result: { ok: false, error: page.errorCode, period, requestedDate: ymd } };
      }
      items = page.data.items;
      chartLabel = page.data.playlistName;
      dateLabel = String(y);
      resolvedPeriod = 'yearly';
    }
    void weekOfMonth;
  }

  const sliced = sliceByRankOrLimit(items, rank, limit);
  const allHits = sliced.map(chartTrackToHit).filter((h) => h.title && h.artist);
  const paged = beginAiLabMusicListPage({
    kind: 'chart',
    items: toChartChoices(allHits),
    trackHits: allHits,
  });
  const pageIds = new Set(
    paged.choices.filter((c) => c.id !== 'ailab_more_music_list').map((c) => c.id),
  );
  const hits = allHits.filter((h) => pageIds.has(h.ref));

  const nextHint =
    allHits.length === 0
      ? '차트 결과 없음. 날짜·period를 확인하거나 search_music으로 곡명 검색.'
      : allHits.length === 1
        ? '차트 1건. 다운로드면 start_music_download(hit, lyricsOption=none).'
        : '여러 순위(한 번에 최대 5개+다른 목록 보기). 선택 안내만. start_music_download 금지. choices 대기.';

  return {
    result: {
      ok: allHits.length > 0,
      hits,
      count: hits.length,
      totalMatched: allHits.length,
      hasMore: paged.hasMore,
      kind: 'chart',
      period,
      resolvedPeriod,
      requestedDate: dateYmd,
      dateLabel,
      chartLabel,
      genre: melonGenreLabel(
        resolveGenreId(args.genre, period === 'realtime' ? 'daily' : (period as MelonPeriodChartKind | 'daily')),
      ),
      rank: rank ?? null,
      note,
      providerId: 'melon',
      nextHint,
    },
    choices: paged.choices.length > 0 ? paged.choices : undefined,
  };
}
