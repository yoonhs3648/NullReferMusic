import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { NrmChartFilterScrollRow } from '@/components/nrm/charts/NrmChartFilterScrollRow';
import { NrmChartErrorHero } from '@/components/nrm/charts/NrmChartErrorHero';
import { NrmChartPageHeading } from '@/components/nrm/charts/NrmChartPageHeading';
import { NrmChartTrackRow } from '@/components/nrm/charts/NrmChartTrackRow';
import { NrmLogo } from '@/components/nrm/NrmLogo';
import { NrmScrollToTopFab } from '@/components/nrm/NrmScrollToTopFab';
import { NRM_SEARCH_SCROLL_TOP_THRESHOLD } from '@/lib/nrmSearchPageSize';
import { nrmTokens } from '@/constants/nrmTokens';
import type { ChartErrorCode } from '@/lib/nrmChartErrors';
import type { ChartTrackItem } from '@/lib/nrmChartsTypes';
import { fetchMelonRealtimeChart } from '@/lib/nrmMelonRealtimeChartsClient';
import {
  NRM_MELON_REALTIME_CHART_DEFAULT_TAB,
  NRM_MELON_REALTIME_CHART_TABS,
  type MelonRealtimeChartTabId,
} from '@/lib/nrmMelonRealtimeChartCatalog';

const REALTIME_FIRST_PAGE_SIZE = 50;
const REALTIME_MAX_RANK = 100;

type Props = {
  isDark: boolean;
  paddingHorizontal: number;
  onBackToHome: () => void;
  onTrackPress?: (item: ChartTrackItem) => void;
};

export function NrmMelonChartsHome({
  isDark,
  paddingHorizontal,
  onBackToHome,
  onTrackPress,
}: Props) {
  const titleColor = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
  const bodyColor = isDark ? nrmTokens.color.textMuted : nrmTokens.color.inkMuted80;
  const tabBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';
  const tabActiveBg = isDark
    ? 'rgba(0, 102, 204, 0.28)'
    : 'rgba(0, 102, 204, 0.12)';
  const tabBorder = isDark
    ? nrmTokens.color.borderOnDark
    : nrmTokens.color.hairline;

  const [activeTab, setActiveTab] = useState<MelonRealtimeChartTabId>(
    NRM_MELON_REALTIME_CHART_DEFAULT_TAB,
  );
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorCode, setErrorCode] = useState<ChartErrorCode | null>(null);
  const [playlistTitle, setPlaylistTitle] = useState<string | null>(null);
  const [items, setItems] = useState<ChartTrackItem[]>([]);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const listRef = useRef<FlatList<ChartTrackItem>>(null);

  const loadGenRef = useRef(0);
  const activeTabRef = useRef(activeTab);
  const pendingItemsRef = useRef<ChartTrackItem[]>([]);
  activeTabRef.current = activeTab;

  const loadChart = useCallback(async (tab: MelonRealtimeChartTabId, generation: number) => {
    setLoading(true);
    setLoadingMore(false);
    setErrorCode(null);
    setItems([]);
    setPlaylistTitle(null);
    pendingItemsRef.current = [];
    const out = await fetchMelonRealtimeChart(tab);
    if (generation !== loadGenRef.current) return;
    if (!out.ok) {
      setErrorCode(out.errorCode);
      setLoading(false);
      return;
    }
    setPlaylistTitle(out.data.playlistName);
    const all = out.data.items.slice(0, REALTIME_MAX_RANK);
    pendingItemsRef.current = all.slice(REALTIME_FIRST_PAGE_SIZE);
    setItems(all.slice(0, REALTIME_FIRST_PAGE_SIZE));
    setLoading(false);
  }, []);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || errorCode || pendingItemsRef.current.length === 0) return;
    setLoadingMore(true);
    const rest = pendingItemsRef.current;
    pendingItemsRef.current = [];
    setItems((prev) => [...prev, ...rest]);
    setLoadingMore(false);
  }, [loading, loadingMore, errorCode]);

  const selectTab = useCallback((tab: MelonRealtimeChartTabId) => {
    if (tab === activeTabRef.current) return;
    setActiveTab(tab);
  }, []);

  const keyExtractor = useCallback(
    (item: ChartTrackItem) => `${activeTab}-${item.trackId}-${item.rank}`,
    [activeTab],
  );

  const renderItem = useCallback(
    ({ item }: { item: ChartTrackItem }) => (
      <View style={{ paddingHorizontal }}>
        <NrmChartTrackRow
          item={item}
          titleColor={titleColor}
          bodyColor={bodyColor}
          coverUrl={item.imageUrl}
          onPress={onTrackPress ? () => onTrackPress(item) : undefined}
        />
      </View>
    ),
    [paddingHorizontal, titleColor, bodyColor, onTrackPress],
  );

  useEffect(() => {
    const generation = ++loadGenRef.current;
    void loadChart(activeTab, generation);
  }, [activeTab, loadChart]);

  const listHeader = (
    <View style={{ paddingHorizontal: paddingHorizontal }} collapsable={false}>
      <View style={styles.headerRow}>
        <NrmLogo compact tone={isDark ? 'dark' : 'light'} onPress={onBackToHome} />
      </View>
      <NrmChartPageHeading iconKey="melon" title="Melon 차트" titleColor={titleColor} />
      <NrmChartFilterScrollRow>
        {NRM_MELON_REALTIME_CHART_TABS.map((tab) => {
          const selected = tab.id === activeTab;
          return (
            <Pressable
              key={tab.id}
              onPress={() => selectTab(tab.id)}
              style={({ pressed }) => [
                styles.tabChip,
                {
                  backgroundColor: selected ? tabActiveBg : tabBg,
                  borderColor: selected ? nrmTokens.color.primary : tabBorder,
                },
                pressed && styles.tabChipPressed,
              ]}
              accessibilityRole="tab"
              accessibilityState={{ selected }}>
              <Text
                style={[
                  styles.tabLabel,
                  {
                    color: selected ? titleColor : bodyColor,
                    fontWeight: selected ? '600' : '500',
                  },
                ]}
                numberOfLines={1}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </NrmChartFilterScrollRow>
      {playlistTitle && !errorCode ? (
        <Text style={[styles.playlistHint, { color: bodyColor }]}>
          {playlistTitle} · {items.length}곡
        </Text>
      ) : null}
      {loading ? (
        <ActivityIndicator style={styles.loader} color={nrmTokens.color.primary} />
      ) : null}
    </View>
  );

  const listEmpty = loading ? null : errorCode ? (
    <NrmChartErrorHero
      isDark={isDark}
      platform="melon"
      errorCode={errorCode}
      paddingHorizontal={paddingHorizontal}
    />
  ) : null;

  const listFooter =
    loadingMore && !errorCode ? (
      <ActivityIndicator style={styles.footerLoader} color={nrmTokens.color.primary} />
    ) : null;

  return (
    <View style={styles.listRoot}>
      <FlatList
        ref={listRef}
        style={styles.list}
        nestedScrollEnabled
        data={loading || errorCode ? [] : items}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        ListFooterComponent={listFooter}
        onEndReached={loadMore}
        onEndReachedThreshold={0.35}
        onScroll={(e) => {
          setShowScrollTop(e.nativeEvent.contentOffset.y > NRM_SEARCH_SCROLL_TOP_THRESHOLD);
        }}
        scrollEventThrottle={200}
        contentContainerStyle={[
          styles.listContent,
          (loading || errorCode) && styles.listContentEmpty,
        ]}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={20}
        maxToRenderPerBatch={15}
        windowSize={8}
      />
      <NrmScrollToTopFab
        visible={showScrollTop}
        onPress={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}
        isDark={isDark}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  listRoot: { flex: 1 },
  list: { flex: 1 },
  listContent: { paddingBottom: nrmTokens.space.xxl },
  listContentEmpty: { flexGrow: 1 },
  headerRow: {
    alignItems: 'center',
    marginBottom: nrmTokens.space.md,
    marginTop: nrmTokens.space.sm,
  },
  tabChip: {
    paddingHorizontal: nrmTokens.space.md,
    paddingVertical: nrmTokens.space.sm,
    borderRadius: nrmTokens.radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tabChipPressed: { opacity: 0.9 },
  tabLabel: { fontSize: nrmTokens.font.caption },
  playlistHint: {
    marginBottom: nrmTokens.space.sm,
    fontSize: nrmTokens.font.caption,
    lineHeight: 20,
  },
  loader: { marginVertical: nrmTokens.space.lg },
  footerLoader: { marginVertical: nrmTokens.space.md },
});
