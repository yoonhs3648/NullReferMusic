import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
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
import { NrmPeriodChartSharedPickerModal } from '@/components/nrm/charts/NrmPeriodChartDropdown';
import {
  createInitialSpotifyPeriodChartDate,
  NrmSpotifyPeriodChartFilters,
} from '@/components/nrm/charts/NrmSpotifyPeriodChartFilters';
import { useNrmPeriodChartPicker } from '@/components/nrm/charts/useNrmPeriodChartPicker';
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
  createDefaultSpotifyPeriodDateForKind,
  type SpotifyPeriodChartKind,
  type SpotifyPeriodDateSelection,
} from '@/lib/nrmSpotifyPeriodChartCatalog';
import { getNrmRootBackgroundColor } from '@/lib/nrmUiAppearanceColors';
import { DEFAULT_WEEKLY_SNAPSHOT_DAY, loadWeeklySnapshotDay } from '@/lib/nrmWeeklySnapshotSettings';
import { useNrmLastfmChartCoverLoader } from '@/lib/useNrmLastfmChartCoverLoader';

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
  const screenBg = getNrmRootBackgroundColor(isDark);
  const pickerControl = useNrmPeriodChartPicker();

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

  type SpotifyPeriodTabSnapshot = SpotifyPeriodDateSelection & {
    region: PeriodChartRegion;
  };
  type LastfmPeriodTabSnapshot = {
    year: number;
    month: number;
    region: PeriodChartRegion;
  };

  const spotifyKindSnapshotsRef = useRef<
    Partial<Record<SpotifyPeriodChartKind, SpotifyPeriodTabSnapshot>>
  >(
    platform === 'spotify'
      ? {
          daily: {
            year: initialSpotify.year,
            month: initialSpotify.month,
            day: initialSpotify.day,
            weekOfMonth: initialSpotify.weekOfMonth,
            region: 'kr',
          },
        }
      : {},
  );

  const lastfmGranularitySnapshotsRef = useRef<
    Partial<Record<PeriodChartGranularity, LastfmPeriodTabSnapshot>>
  >(
    platform === 'lastfm'
      ? {
          month: {
            year: initialLastfm.year,
            month: initialLastfm.month,
            region: 'kr',
          },
        }
      : {},
  );

  useEffect(() => {
    if (platform !== 'spotify') return;
    spotifyKindSnapshotsRef.current[spotifyKind] = { year, month, day, weekOfMonth, region };
  }, [platform, spotifyKind, year, month, day, weekOfMonth, region]);

  useEffect(() => {
    if (platform !== 'lastfm') return;
    lastfmGranularitySnapshotsRef.current[granularity] = { year, month, region };
  }, [platform, granularity, year, month, region]);

  const handleSpotifyKindChange = useCallback(
    (next: SpotifyPeriodChartKind) => {
      if (next === spotifyKind) return;
      spotifyKindSnapshotsRef.current[spotifyKind] = { year, month, day, weekOfMonth, region };
      const saved = spotifyKindSnapshotsRef.current[next];
      const nextDate =
        saved ?? createDefaultSpotifyPeriodDateForKind(next, snapshotDow);
      setSpotifyKind(next);
      setYear(nextDate.year);
      setMonth(nextDate.month);
      setDay(nextDate.day);
      setWeekOfMonth(nextDate.weekOfMonth);
      setRegion(saved?.region ?? 'kr');
    },
    [spotifyKind, year, month, day, weekOfMonth, region, snapshotDow],
  );

  const handleSpotifyRegionChange = useCallback(
    (next: PeriodChartRegion) => {
      setRegion(next);
      if (platform !== 'spotify') return;
      spotifyKindSnapshotsRef.current[spotifyKind] = {
        ...(spotifyKindSnapshotsRef.current[spotifyKind] ?? {
          year,
          month,
          day,
          weekOfMonth,
        }),
        region: next,
      };
    },
    [platform, spotifyKind, year, month, day, weekOfMonth],
  );

  const handleLastfmGranularityChange = useCallback(
    (next: PeriodChartGranularity) => {
      if (next === granularity) return;
      lastfmGranularitySnapshotsRef.current[granularity] = { year, month, region };
      const saved = lastfmGranularitySnapshotsRef.current[next];
      setGranularity(next);
      if (saved) {
        setYear(saved.year);
        setMonth(saved.month);
        setRegion(saved.region);
      }
    },
    [granularity, year, month, region],
  );

  const handleLastfmRegionChange = useCallback(
    (next: PeriodChartRegion) => {
      setRegion(next);
      if (platform !== 'lastfm') return;
      lastfmGranularitySnapshotsRef.current[granularity] = {
        ...(lastfmGranularitySnapshotsRef.current[granularity] ?? { year, month }),
        region: next,
      };
    },
    [platform, granularity, year, month],
  );

  const [items, setItems] = useState<ChartTrackItem[]>([]);
  const [playlistTitle, setPlaylistTitle] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<ChartErrorCode | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [chartGeneration, setChartGeneration] = useState(0);

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
      if (!append) {
        setChartGeneration(generation);
      }
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

  useEffect(() => {
    pickerControl.closePicker();
  }, [queryKey, pickerControl.closePicker]);

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

  const renderListEmpty = useCallback(() => {
    if (loading || items.length > 0) return null;
    if (errorCode) {
      return (
        <NrmChartErrorHero
          isDark={isDark}
          platform={platform}
          errorCode={errorCode}
          paddingHorizontal={paddingHorizontal}
        />
      );
    }
    return (
      <Text style={[styles.empty, { color: bodyColor, paddingHorizontal }]}>
        이 기간에 표시할 차트가 없습니다.
      </Text>
    );
  }, [loading, items.length, errorCode, isDark, platform, paddingHorizontal, bodyColor]);

  const listFooter =
    loadingMore && !errorCode ? (
      <ActivityIndicator
        style={styles.footerLoader}
        color={nrmTokens.color.primary}
      />
    ) : null;

  const filterBar =
    platform === 'spotify' ? (
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
        pickerControl={pickerControl}
        onKindChange={handleSpotifyKindChange}
        onYearChange={setYear}
        onMonthChange={setMonth}
        onDayChange={setDay}
        onWeekOfMonthChange={setWeekOfMonth}
        onRegionChange={handleSpotifyRegionChange}
        onReselect={() => reload()}
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
        pickerControl={pickerControl}
        onGranularityChange={handleLastfmGranularityChange}
        onYearChange={setYear}
        onMonthChange={setMonth}
        onRegionChange={handleLastfmRegionChange}
        onReselect={() => reload()}
      />
    );

  const coverLoader = useNrmLastfmChartCoverLoader({
    items,
    generation: chartGeneration,
    enabled: platform === 'lastfm' && !loading && !errorCode,
  });

  const listHeader = (
    <View>
      {platform !== 'spotify' && playlistTitle && !errorCode ? (
        <Text style={[styles.hint, { color: bodyColor }]}>
          {playlistTitle} · {periodChartGranularityLabel(granularity)} · 최대 {maxRank}곡 ·{' '}
          {items.length}곡 표시
        </Text>
      ) : null}

      {loading ? (
        <ActivityIndicator style={styles.loader} color={nrmTokens.color.primary} />
      ) : null}
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: screenBg }]}>
      <View style={[styles.stickyChrome, { paddingHorizontal }]} collapsable={false}>
        <NrmFeatureScreenLogoHeader isDark={isDark} onPressHome={onBackToHome} />
        <NrmChartPageHeading
          iconKey={iconKey}
          title={`${pageTitle} 기간별 차트`}
          titleColor={titleColor}
        />
        {filterBar}
      </View>

      <FlatList
        style={styles.list}
        nestedScrollEnabled
        data={loading || errorCode ? [] : items}
        keyExtractor={(item, index) =>
          `${queryKey}-${item.trackId}-${item.rank}-${index}`
        }
        onViewableItemsChanged={
          platform === 'lastfm' ? coverLoader.onViewableItemsChanged : undefined
        }
        viewabilityConfig={
          platform === 'lastfm' ? coverLoader.viewabilityConfig : undefined
        }
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal }} collapsable={false}>
            <NrmChartTrackRow
              item={item}
              titleColor={titleColor}
              bodyColor={bodyColor}
              coverUrl={
                platform === 'lastfm'
                  ? coverLoader.resolveItemCoverUrl(item)
                  : undefined
              }
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
        ListHeaderComponentStyle={styles.listHeaderInset}
        ListEmptyComponent={renderListEmpty}
        ListFooterComponent={listFooter}
        onEndReached={() => loadMore()}
        onEndReachedThreshold={0.35}
        contentContainerStyle={[
          styles.listContent,
          { paddingHorizontal },
          (loading || (errorCode && items.length === 0)) && styles.listContentEmpty,
        ]}
        keyboardShouldPersistTaps="always"
        removeClippedSubviews={Platform.OS === 'android' ? false : undefined}
      />

      <NrmPeriodChartSharedPickerModal
        picker={pickerControl.picker}
        onClose={pickerControl.closePicker}
        isDark={isDark}
        titleColor={titleColor}
        bodyColor={bodyColor}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  stickyChrome: {
    zIndex: 2,
    ...Platform.select({
      android: { elevation: 2 },
    }),
  },
  listHeaderInset: {
    width: '100%',
  },
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
