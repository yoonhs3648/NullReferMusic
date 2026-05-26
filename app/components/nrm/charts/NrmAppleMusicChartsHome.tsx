import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { NrmChartErrorHero } from '@/components/nrm/charts/NrmChartErrorHero';
import { NrmChartPageHeading } from '@/components/nrm/charts/NrmChartPageHeading';
import { NrmChartTrackRow } from '@/components/nrm/charts/NrmChartTrackRow';
import { NrmLogo } from '@/components/nrm/NrmLogo';
import { nrmTokens } from '@/constants/nrmTokens';
import { fetchAppleMusicChart } from '@/lib/nrmAppleMusicChartsClient';
import {
  NRM_APPLE_MUSIC_CHART_DEFAULT_TAB,
  NRM_APPLE_MUSIC_CHART_TABS,
  type AppleMusicChartTabId,
} from '@/lib/nrmAppleMusicChartCatalog';
import type { ChartErrorCode } from '@/lib/nrmChartErrors';
import type { ChartTrackItem } from '@/lib/nrmChartsTypes';

type Props = {
  isDark: boolean;
  paddingHorizontal: number;
  onBackToHome: () => void;
  onTrackPress?: (item: ChartTrackItem) => void;
};

export function NrmAppleMusicChartsHome({
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

  const [activeTab, setActiveTab] = useState<AppleMusicChartTabId>(
    NRM_APPLE_MUSIC_CHART_DEFAULT_TAB,
  );
  const [loading, setLoading] = useState(true);
  const [errorCode, setErrorCode] = useState<ChartErrorCode | null>(null);
  const [playlistTitle, setPlaylistTitle] = useState<string | null>(null);
  const [items, setItems] = useState<ChartTrackItem[]>([]);

  const loadChart = useCallback(async (tab: AppleMusicChartTabId) => {
    setLoading(true);
    setErrorCode(null);
    setItems([]);
    setPlaylistTitle(null);
    const out = await fetchAppleMusicChart(tab);
    if (!out.ok) {
      setErrorCode(out.errorCode);
      setLoading(false);
      return;
    }
    setPlaylistTitle(out.data.playlistName);
    setItems(out.data.items);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadChart(activeTab);
  }, [activeTab, loadChart]);

  const listHeader = (
    <View style={{ paddingHorizontal: paddingHorizontal }}>
      <View style={styles.headerRow}>
        <NrmLogo compact tone={isDark ? 'dark' : 'light'} onPress={onBackToHome} />
      </View>
      <NrmChartPageHeading
        iconKey="appleMusic"
        title="Apple Music 차트"
        titleColor={titleColor}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabRow}
        style={styles.tabScroll}>
        {NRM_APPLE_MUSIC_CHART_TABS.map((tab) => {
          const selected = tab.id === activeTab;
          return (
            <Pressable
              key={tab.id}
              onPress={() => setActiveTab(tab.id)}
              style={({ pressed }) => [
                styles.tabChip,
                {
                  backgroundColor: selected ? tabActiveBg : tabBg,
                  borderColor: selected
                    ? nrmTokens.color.primary
                    : tabBorder,
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
      </ScrollView>
      {playlistTitle && !errorCode ? (
        <Text style={[styles.playlistHint, { color: bodyColor }]}>
          {playlistTitle} · {items.length}곡
        </Text>
      ) : null}
      {loading ? (
        <ActivityIndicator
          style={styles.loader}
          color={nrmTokens.color.primary}
        />
      ) : null}
    </View>
  );

  const listEmpty = loading ? null : errorCode ? (
    <NrmChartErrorHero
      isDark={isDark}
      platform="appleMusic"
      errorCode={errorCode}
      paddingHorizontal={paddingHorizontal}
    />
  ) : null;

  return (
    <FlatList
      style={styles.list}
      data={loading || errorCode ? [] : items}
      keyExtractor={(item) => `${activeTab}-${item.trackId}-${item.rank}`}
      renderItem={({ item }) => (
        <View style={{ paddingHorizontal: paddingHorizontal }}>
          <NrmChartTrackRow
            item={item}
            titleColor={titleColor}
            bodyColor={bodyColor}
            countLabel="stream 수"
            onPress={
              onTrackPress
                ? () => onTrackPress(item)
                : undefined
            }
          />
        </View>
      )}
      ListHeaderComponent={listHeader}
      ListEmptyComponent={() => listEmpty}
      contentContainerStyle={[
        styles.listContent,
        (loading || errorCode) && styles.listContentEmpty,
      ]}
      keyboardShouldPersistTaps="handled"
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { flex: 1 },
  listContent: { paddingBottom: nrmTokens.space.xxl },
  listContentEmpty: { flexGrow: 1 },
  headerRow: {
    alignItems: 'center',
    marginBottom: nrmTokens.space.md,
    marginTop: nrmTokens.space.sm,
  },
  tabScroll: { marginBottom: nrmTokens.space.sm, flexGrow: 0 },
  tabRow: { gap: nrmTokens.space.xs, paddingBottom: nrmTokens.space.xs },
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
});
