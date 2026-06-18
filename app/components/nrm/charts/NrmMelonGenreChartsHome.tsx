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
import { NrmPeriodChartSharedPickerModal } from '@/components/nrm/charts/NrmPeriodChartDropdown';
import { NrmMelonGenreChartFilters } from '@/components/nrm/charts/NrmMelonGenreChartFilters';
import { useNrmPeriodChartPicker } from '@/components/nrm/charts/useNrmPeriodChartPicker';
import { NrmFeatureScreenLogoHeader } from '@/components/nrm/NrmFeatureScreenLogoHeader';
import { nrmTokens } from '@/constants/nrmTokens';
import type { ChartErrorCode } from '@/lib/nrmChartErrors';
import type { ChartTrackItem } from '@/lib/nrmChartsTypes';
import {
  createDefaultMelonGenreChartDateForKind,
  createInitialMelonGenreChartDate,
  MELON_DEFAULT_GENRE_ID,
  MELON_PERIOD_MAX_RANK,
  MELON_PERIOD_PAGE_SIZE,
  type MelonGenreDateSelection,
  type MelonGenreId,
  type MelonPeriodChartKind,
} from '@/lib/nrmMelonGenreChartCatalog';
import { fetchMelonGenreChartPage } from '@/lib/nrmMelonGenreChartsClient';
import { getNrmRootBackgroundColor } from '@/lib/nrmUiAppearanceColors';

type Props = {
  isDark: boolean;
  paddingHorizontal: number;
  onBackToHome: () => void;
  onTrackPress?: (item: ChartTrackItem) => void;
};

export function NrmMelonGenreChartsHome({
  isDark,
  paddingHorizontal,
  onBackToHome,
  onTrackPress,
}: Props) {
  const titleColor = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
  const bodyColor = isDark ? nrmTokens.color.textMuted : nrmTokens.color.inkMuted80;
  const screenBg = getNrmRootBackgroundColor(isDark);
  const pickerControl = useNrmPeriodChartPicker();

  const initial = createInitialMelonGenreChartDate();
  const [kind, setKind] = useState<MelonPeriodChartKind>('weekly');
  const [classCd, setClassCd] = useState<MelonGenreId>(MELON_DEFAULT_GENRE_ID);
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [weekOfMonth, setWeekOfMonth] = useState(initial.weekOfMonth);

  const kindSnapshotsRef = useRef<Partial<Record<MelonPeriodChartKind, MelonGenreDateSelection>>>({
    weekly: initial,
  });

  useEffect(() => {
    kindSnapshotsRef.current[kind] = { year, month, weekOfMonth };
  }, [kind, year, month, weekOfMonth]);

  const handleKindChange = useCallback(
    (next: MelonPeriodChartKind) => {
      if (next === kind) return;
      kindSnapshotsRef.current[kind] = { year, month, weekOfMonth };
      const saved = kindSnapshotsRef.current[next];
      const nextDate = saved ?? createDefaultMelonGenreChartDateForKind(next);
      setKind(next);
      setYear(nextDate.year);
      setMonth(nextDate.month);
      setWeekOfMonth(nextDate.weekOfMonth);
    },
    [kind, year, month, weekOfMonth],
  );

  const [items, setItems] = useState<ChartTrackItem[]>([]);
  const [errorCode, setErrorCode] = useState<ChartErrorCode | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const loadGenRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const offsetRef = useRef(0);

  const queryKey = `${kind}-${classCd}-${year}-${month}-${weekOfMonth}`;

  const loadPage = useCallback(
    async (offset: number, append: boolean, generation: number) => {
      const ac = new AbortController();
      abortRef.current = ac;
      const out = await fetchMelonGenreChartPage(
        {
          kind,
          classCd,
          year,
          month,
          weekOfMonth,
          offset,
          limit: MELON_PERIOD_PAGE_SIZE,
        },
        ac.signal,
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
      setHasMore(out.data.hasMore && out.data.items.length > 0);
      offsetRef.current = offset + out.data.items.length;
      setItems((prev) => (append ? [...prev, ...out.data.items] : out.data.items));
    },
    [kind, classCd, year, month, weekOfMonth],
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
    if (offsetRef.current >= MELON_PERIOD_MAX_RANK) {
      setHasMore(false);
      return;
    }
    const gen = loadGenRef.current;
    setLoadingMore(true);
    void loadPage(offsetRef.current, true, gen).finally(() => {
      if (gen === loadGenRef.current) setLoadingMore(false);
    });
  }, [loading, loadingMore, hasMore, errorCode, loadPage]);

  const renderListEmpty = useCallback(() => {
    if (loading || items.length > 0) return null;
    if (errorCode) {
      return (
        <NrmChartErrorHero
          isDark={isDark}
          platform="melon"
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
  }, [loading, items.length, errorCode, isDark, paddingHorizontal, bodyColor]);

  const listFooter =
    loadingMore && !errorCode ? (
      <ActivityIndicator
        style={styles.footerLoader}
        color={nrmTokens.color.primary}
      />
    ) : null;

  return (
    <View style={[styles.screen, { backgroundColor: screenBg }]}>
      <View style={[styles.stickyChrome, { paddingHorizontal }]} collapsable={false}>
        <NrmFeatureScreenLogoHeader isDark={isDark} onPressHome={onBackToHome} />
        <NrmChartPageHeading
          iconKey="melon"
          title="Melon 장르별 차트"
          titleColor={titleColor}
        />
        <NrmMelonGenreChartFilters
          isDark={isDark}
          titleColor={titleColor}
          bodyColor={bodyColor}
          kind={kind}
          classCd={classCd}
          year={year}
          month={month}
          weekOfMonth={weekOfMonth}
          pickerControl={pickerControl}
          onKindChange={handleKindChange}
          onGenreChange={setClassCd}
          onYearChange={setYear}
          onMonthChange={setMonth}
          onWeekOfMonthChange={setWeekOfMonth}
          onReselect={() => reload()}
        />
      </View>

      <FlatList
        style={styles.list}
        nestedScrollEnabled
        data={loading || errorCode ? [] : items}
        keyExtractor={(item, index) => `${queryKey}-${item.trackId}-${item.rank}-${index}`}
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal }} collapsable={false}>
            <NrmChartTrackRow
              item={item}
              titleColor={titleColor}
              bodyColor={bodyColor}
              coverUrl={item.imageUrl}
              onPress={onTrackPress ? () => onTrackPress(item) : undefined}
            />
          </View>
        )}
        ListHeaderComponent={
          loading ? (
            <ActivityIndicator style={styles.loader} color={nrmTokens.color.primary} />
          ) : null
        }
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
    paddingBottom: nrmTokens.space.xs,
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
  loader: { marginVertical: nrmTokens.space.lg },
  footerLoader: { marginVertical: nrmTokens.space.md },
  empty: {
    textAlign: 'center',
    fontSize: nrmTokens.font.caption,
    marginTop: nrmTokens.space.lg,
  },
});
