import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { NrmChartErrorHero } from '@/components/nrm/charts/NrmChartErrorHero';
import { NrmChartPageHeading } from '@/components/nrm/charts/NrmChartPageHeading';
import { NrmChartTrackRow } from '@/components/nrm/charts/NrmChartTrackRow';
import {
  createInitialPeriodChartDate,
  NrmPeriodChartFilters,
} from '@/components/nrm/charts/NrmPeriodChartFilters';
import {
  createInitialSpotifyPeriodChartDate,
  NrmSpotifyPeriodChartFilters,
} from '@/components/nrm/charts/NrmSpotifyPeriodChartFilters';
import { NrmFeatureScreenLogoHeader } from '@/components/nrm/NrmFeatureScreenLogoHeader';
import { nrmTokens } from '@/constants/nrmTokens';
import type { ChartErrorCode } from '@/lib/nrmChartErrors';
import type { LastfmAuthHandlers } from '@/lib/nrmLastfmAuthFlow';
import type { SpotifyChartsAuthHandlers } from '@/lib/nrmSpotifyChartsAuthFlow';
import type { ChartTrackItem } from '@/lib/nrmChartsTypes';
import {
  PERIOD_CHART_MAX_RANK,
  PERIOD_CHART_PAGE_SIZE,
  periodChartGranularityLabel,
  type PeriodChartGranularity,
  type PeriodChartPlatform,
  type PeriodChartRegion,
} from '@/lib/nrmPeriodChartCatalog';
import { fetchPeriodChartPage } from '@/lib/nrmPeriodChartsClient';
import {
  spotifyPeriodChartMaxRank,
  type SpotifyPeriodChartKind,
} from '@/lib/nrmSpotifyPeriodChartCatalog';
import { DEFAULT_WEEKLY_SNAPSHOT_DAY, loadWeeklySnapshotDay } from '@/lib/nrmWeeklySnapshotSettings';

type Props = {
  platform: PeriodChartPlatform;
  isDark: boolean;
  paddingHorizontal: number;
  onBackToHome: () => void;
  onTrackPress?: (item: ChartTrackItem) => void;
  onOpenChartsSession?: () => void;
  onRenewChartsBearer?: () => Promise<boolean>;
  onShowBearerExpired?: () => void;
  lastfmAuth?: LastfmAuthHandlers;
};

export function NrmPeriodChartsHome({
  platform,
  isDark,
  paddingHorizontal,
  onBackToHome,
  onTrackPress,
  onOpenChartsSession,
  onRenewChartsBearer,
  onShowBearerExpired,
  lastfmAuth,
}: Props) {
  const pageTitle = platform === 'spotify' ? 'Spotify' : 'Last.fm';
  const iconKey = platform;
  const titleColor = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
  const bodyColor = isDark ? nrmTokens.color.textMuted : nrmTokens.color.inkMuted80;

  const initialLastfm = createInitialPeriodChartDate();
  const initialSpotify = createInitialSpotifyPeriodChartDate();
  const [granularity, setGranularity] = useState<PeriodChartGranularity>('month');
  const [spotifyKind, setSpotifyKind] = useState<SpotifyPeriodChartKind>('daily');
  const [year, setYear] = useState(
    platform === 'spotify' ? initialSpotify.year : initialLastfm.year,
  );
  const [month, setMonth] = useState(
    platform === 'spotify' ? initialSpotify.month : initialLastfm.month,
  );
  const [day, setDay] = useState(initialSpotify.day);
  const [weekOfMonth, setWeekOfMonth] = useState(initialSpotify.weekOfMonth);
  const [snapshotDow, setSnapshotDow] = useState(DEFAULT_WEEKLY_SNAPSHOT_DAY);
  const [region, setRegion] = useState<PeriodChartRegion>('kr');

  const [items, setItems] = useState<ChartTrackItem[]>([]);
  const [playlistTitle, setPlaylistTitle] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<ChartErrorCode | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const loadGenRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const offsetRef = useRef(0);

  const maxRank =
    platform === 'spotify'
      ? spotifyPeriodChartMaxRank(spotifyKind)
      : PERIOD_CHART_MAX_RANK;

  const queryKey =
    platform === 'spotify'
      ? `${platform}-${region}-${spotifyKind}-${year}-${month}-${day}-${weekOfMonth}-${snapshotDow}`
      : `${platform}-${region}-${granularity}-${year}-${month}`;

  useEffect(() => {
    if (platform !== 'spotify') return;
    let cancelled = false;
    void loadWeeklySnapshotDay().then((d) => {
      if (!cancelled) setSnapshotDow(d);
    });
    return () => {
      cancelled = true;
    };
  }, [platform]);

  const loadPage = useCallback(
    async (offset: number, append: boolean, generation: number) => {
      const ac = new AbortController();
      abortRef.current = ac;
      const query = {
        region,
        granularity,
        spotifyKind,
        year,
        month,
        day,
        weekOfMonth,
        snapshotDow,
        offset,
        limit: PERIOD_CHART_PAGE_SIZE,
      };
      const chartsAuth: SpotifyChartsAuthHandlers | undefined =
        platform === 'spotify' && !append
          ? {
              onRenewChartsBearer,
              onOpenChartsSession,
              onShowBearerExpired,
            }
          : undefined;
      const out = await fetchPeriodChartPage(
        platform,
        query,
        ac.signal,
        chartsAuth,
        platform === 'lastfm' && !append ? lastfmAuth : undefined,
      );
      if (ac.signal.aborted || generation !== loadGenRef.current) return;

      if (!out.ok) {
        if (!append) {
          setErrorCode(out.errorCode);
          setItems([]);
        }
        setHasMore(false);
        return;
      }

      setErrorCode(null);
      setPlaylistTitle(out.data.playlistName);
      setHasMore(out.data.hasMore && out.data.items.length > 0);
      offsetRef.current = offset + out.data.items.length;
      setItems((prev) => (append ? [...prev, ...out.data.items] : out.data.items));
    },
    [
      platform,
      region,
      granularity,
      spotifyKind,
      year,
      month,
      day,
      weekOfMonth,
      snapshotDow,
      onOpenChartsSession,
      onRenewChartsBearer,
      onShowBearerExpired,
      lastfmAuth,
    ],
  );

  const reload = useCallback(() => {
    const gen = ++loadGenRef.current;
    abortRef.current?.abort();
    offsetRef.current = 0;
    setHasMore(true);
    setLoading(true);
    setLoadingMore(false);
    setErrorCode(null);
    void loadPage(0, false, gen).finally(() => {
      if (gen === loadGenRef.current) setLoading(false);
    });
  }, [loadPage]);

  useEffect(() => {
    reload();
  }, [queryKey, reload]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore || errorCode) return;
    if (offsetRef.current >= maxRank) {
      setHasMore(false);
      return;
    }
    const gen = loadGenRef.current;
    setLoadingMore(true);
    void loadPage(offsetRef.current, true, gen).finally(() => {
      if (gen === loadGenRef.current) setLoadingMore(false);
    });
  }, [loading, loadingMore, hasMore, errorCode, loadPage, maxRank]);

  const listHeader = (
    <View style={{ paddingHorizontal }}>
      <NrmFeatureScreenLogoHeader isDark={isDark} onPressHome={onBackToHome} />
      <NrmChartPageHeading iconKey={iconKey} title={`${pageTitle} 기간별 차트`} titleColor={titleColor} />

      {platform === 'spotify' ? (
        <NrmSpotifyPeriodChartFilters
          isDark={isDark}
          titleColor={titleColor}
          bodyColor={bodyColor}
          kind={spotifyKind}
          year={year}
          month={month}
          day={day}
          weekOfMonth={weekOfMonth}
          snapshotDow={snapshotDow}
          region={region}
          onKindChange={setSpotifyKind}
          onYearChange={setYear}
          onMonthChange={setMonth}
          onDayChange={setDay}
          onWeekOfMonthChange={setWeekOfMonth}
          onRegionChange={setRegion}
        />
      ) : (
        <NrmPeriodChartFilters
          isDark={isDark}
          titleColor={titleColor}
          bodyColor={bodyColor}
          granularity={granularity}
          year={year}
          month={month}
          region={region}
          onGranularityChange={setGranularity}
          onYearChange={setYear}
          onMonthChange={setMonth}
          onRegionChange={setRegion}
        />
      )}

      {platform !== 'spotify' && playlistTitle && !errorCode ? (
        <Text style={[styles.hint, { color: bodyColor }]}>
          {playlistTitle} · {periodChartGranularityLabel(granularity)}{' '}
          · 최대 {maxRank}곡 · {items.length}곡 표시
        </Text>
      ) : null}

      {loading ? (
        <ActivityIndicator style={styles.loader} color={nrmTokens.color.primary} />
      ) : null}
    </View>
  );

  const listFooter =
    loadingMore && !errorCode ? (
      <ActivityIndicator
        style={styles.footerLoader}
        color={nrmTokens.color.primary}
      />
    ) : null;

  const listEmpty =
    loading || items.length > 0 ? null : errorCode ? (
      <NrmChartErrorHero
        isDark={isDark}
        platform={platform}
        errorCode={errorCode}
        paddingHorizontal={paddingHorizontal}
      />
    ) : (
      <Text style={[styles.empty, { color: bodyColor, paddingHorizontal }]}>
        이 기간에 표시할 차트가 없습니다.
      </Text>
    );

  return (
    <FlatList
      style={styles.list}
      data={loading || errorCode ? [] : items}
      keyExtractor={(item, index) =>
        `${queryKey}-${item.trackId}-${item.rank}-${index}`
      }
      renderItem={({ item }) => (
        <View style={{ paddingHorizontal }}>
          <NrmChartTrackRow
            item={item}
            titleColor={titleColor}
            bodyColor={bodyColor}
            countLabel={
              platform === 'spotify'
                ? spotifyKind === 'monthly'
                  ? '평균 순위'
                  : '스트림'
                : undefined
            }
            onPress={onTrackPress ? () => onTrackPress(item) : undefined}
          />
        </View>
      )}
      ListHeaderComponent={listHeader}
      ListEmptyComponent={() => listEmpty}
      ListFooterComponent={listFooter}
      onEndReached={() => loadMore()}
      onEndReachedThreshold={0.35}
      contentContainerStyle={[
        styles.listContent,
        (loading || (errorCode && items.length === 0)) && styles.listContentEmpty,
      ]}
      keyboardShouldPersistTaps="handled"
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  listContent: { paddingBottom: nrmTokens.space.xxl },
  listContentEmpty: { flexGrow: 1 },
  hint: {
    marginBottom: nrmTokens.space.sm,
    fontSize: nrmTokens.font.caption,
    lineHeight: 20,
  },
  loader: { marginVertical: nrmTokens.space.lg },
  footerLoader: { marginVertical: nrmTokens.space.md },
  empty: {
    textAlign: 'center',
    fontSize: nrmTokens.font.caption,
    marginTop: nrmTokens.space.lg,
  },
});
