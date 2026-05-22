import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { NrmChartErrorHero } from '@/components/nrm/charts/NrmChartErrorHero';
import { NrmChartPageHeading } from '@/components/nrm/charts/NrmChartPageHeading';
import { NrmLogo } from '@/components/nrm/NrmLogo';
import { nrmTokens } from '@/constants/nrmTokens';
import { fetchSpotifyPlaylistChart } from '@/lib/nrmChartsClient';
import { promptSpotifyChartsBearerExpired } from '@/lib/nrmChartTokenGate';
import type { SpotifyChartSource } from '@/lib/nrmSpotifyChartCatalog';
import type { ChartTrackItem } from '@/lib/nrmChartsTypes';
import {
  NRM_SPOTIFY_CHART_DEFAULT_TAB,
  NRM_SPOTIFY_CHART_TABS,
  type SpotifyChartTabId,
} from '@/lib/nrmSpotifyChartCatalog';
import type { ChartErrorCode } from '@/lib/nrmChartErrors';

type Props = {
  isDark: boolean;
  paddingHorizontal: number;
  chartSource: SpotifyChartSource;
  onBackToHome: () => void;
  onOpenChartsSession?: () => void;
  /** Android — Bearer 만료 시 WebView 갱신 후 true면 차트 재시도 */
  onRenewChartsBearer?: () => Promise<boolean>;
};

function formatReleaseDate(raw: string): string {
  const t = raw.trim();
  if (!t) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const [y, m, d] = t.split('-');
    return `${y}. ${m}. ${d}.`;
  }
  return t;
}

function TrackRow({
  item,
  titleColor,
  bodyColor,
}: {
  item: ChartTrackItem;
  titleColor: string;
  bodyColor: string;
}) {
  return (
    <Pressable
      onPress={() => {
        if (item.externalUrl) void Linking.openURL(item.externalUrl);
      }}
      style={({ pressed }) => [
        styles.trackRow,
        pressed && styles.trackRowPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${item.rank}위 ${item.title}`}>
      <Text style={[styles.rank, { color: bodyColor }]}>{item.rank}</Text>
      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={styles.art} />
      ) : (
        <View style={[styles.art, styles.artPlaceholder]} />
      )}
      <View style={styles.trackMeta}>
        <Text style={[styles.trackTitle, { color: titleColor }]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={[styles.trackSub, { color: bodyColor }]} numberOfLines={1}>
          {item.artists}
        </Text>
        <View style={styles.metaRow}>
          <Text style={[styles.metaChip, { color: bodyColor }]}>
            인기도 {item.popularity}
          </Text>
          <Text style={[styles.metaChip, { color: bodyColor }]}>
            발매 {formatReleaseDate(item.releaseDate)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export function NrmSpotifyChartsHome({
  isDark,
  paddingHorizontal,
  chartSource,
  onBackToHome,
  onOpenChartsSession,
  onRenewChartsBearer,
}: Props) {
  const pageTitle =
    chartSource === 'official' ? 'Spotify (Premium)' : 'Spotify';
  const titleColor = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
  const bodyColor = isDark ? nrmTokens.color.textMuted : nrmTokens.color.inkMuted80;
  const tabBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';
  const tabActiveBg = isDark
    ? 'rgba(0, 102, 204, 0.28)'
    : 'rgba(0, 102, 204, 0.12)';
  const tabBorder = isDark
    ? nrmTokens.color.borderOnDark
    : nrmTokens.color.hairline;

  const [activeTab, setActiveTab] = useState<SpotifyChartTabId>(
    NRM_SPOTIFY_CHART_DEFAULT_TAB,
  );
  const [loading, setLoading] = useState(true);
  const [errorCode, setErrorCode] = useState<ChartErrorCode | null>(null);
  const [playlistTitle, setPlaylistTitle] = useState<string | null>(null);
  const [items, setItems] = useState<ChartTrackItem[]>([]);

  const loadChart = useCallback(async (tab: SpotifyChartTabId) => {
    setLoading(true);
    setErrorCode(null);
    setItems([]);
    setPlaylistTitle(null);
    const out = await fetchSpotifyPlaylistChart(tab, chartSource);
    if (!out.ok) {
      const isChartsAuthError =
        chartSource === 'charts' &&
        (out.errorCode === 'auth_failed' ||
          out.errorCode === 'premium_required' ||
          out.errorCode === 'charts_session');

      if (isChartsAuthError && onRenewChartsBearer) {
        // spinner 유지 상태에서 조용히 토큰 갱신 (불가시 WebView → 필요 시 visible 오버레이)
        const renewed = await onRenewChartsBearer();
        if (renewed) {
          const retry = await fetchSpotifyPlaylistChart(tab, chartSource);
          if (retry.ok) {
            setPlaylistTitle(retry.data.playlistName);
            setItems(
              retry.data.items.map((row) => ({
                ...row,
                popularity: row.popularity ?? 0,
                releaseDate: row.releaseDate ?? '',
              })),
            );
            setLoading(false);
            return;
          }
          setErrorCode(retry.errorCode);
        } else {
          setErrorCode(out.errorCode);
        }
        setLoading(false);
        return;
      }

      setErrorCode(out.errorCode);
      setLoading(false);
      if (
        isChartsAuthError &&
        onOpenChartsSession
      ) {
        const renewed = await promptSpotifyChartsBearerExpired({
          onOpenChartsSession,
          onAndroidRenew: onRenewChartsBearer,
        });
        if (renewed) {
          void loadChart(tab);
        }
      }
      return;
    }
    setPlaylistTitle(out.data.playlistName);
    setItems(
      out.data.items.map((row) => ({
        ...row,
        popularity: row.popularity ?? 0,
        releaseDate: row.releaseDate ?? '',
      })),
    );
    setLoading(false);
  }, [chartSource, onOpenChartsSession, onRenewChartsBearer]);

  useEffect(() => {
    void loadChart(activeTab);
  }, [activeTab, loadChart]);

  const listHeader = (
    <View style={{ paddingHorizontal: paddingHorizontal }}>
      <View style={styles.headerRow}>
        <NrmLogo compact tone={isDark ? 'dark' : 'light'} onPress={onBackToHome} />
      </View>
      <NrmChartPageHeading
        iconKey="spotify"
        title={pageTitle}
        titleColor={titleColor}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabRow}
        style={styles.tabScroll}>
        {NRM_SPOTIFY_CHART_TABS.map((tab) => {
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
      platform="spotify"
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
          <TrackRow item={item} titleColor={titleColor} bodyColor={bodyColor} />
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
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: nrmTokens.space.xxl,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  headerRow: {
    alignItems: 'center',
    marginBottom: nrmTokens.space.md,
    marginTop: nrmTokens.space.sm,
  },
  tabScroll: {
    marginBottom: nrmTokens.space.sm,
    flexGrow: 0,
  },
  tabRow: {
    gap: nrmTokens.space.xs,
    paddingBottom: nrmTokens.space.xs,
  },
  tabChip: {
    paddingHorizontal: nrmTokens.space.md,
    paddingVertical: nrmTokens.space.sm,
    borderRadius: nrmTokens.radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tabChipPressed: {
    opacity: 0.9,
  },
  tabLabel: {
    fontSize: nrmTokens.font.caption,
  },
  playlistHint: {
    marginBottom: nrmTokens.space.sm,
    fontSize: nrmTokens.font.caption,
    lineHeight: 20,
  },
  loader: {
    marginVertical: nrmTokens.space.lg,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.sm,
    paddingVertical: nrmTokens.space.sm,
    paddingHorizontal: nrmTokens.space.xs,
    borderRadius: nrmTokens.radius.sm,
    marginBottom: nrmTokens.space.xxs,
  },
  trackRowPressed: {
    opacity: 0.88,
  },
  rank: {
    width: 28,
    fontSize: nrmTokens.font.caption,
    fontWeight: '600',
    textAlign: 'right',
  },
  art: {
    width: 52,
    height: 52,
    borderRadius: nrmTokens.radius.sm,
  },
  artPlaceholder: {
    backgroundColor: 'rgba(128,128,128,0.2)',
  },
  trackMeta: {
    flex: 1,
    minWidth: 0,
  },
  trackTitle: {
    fontSize: nrmTokens.font.body,
    fontWeight: '500',
  },
  trackSub: {
    marginTop: 2,
    fontSize: nrmTokens.font.caption,
    fontWeight: '400',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: nrmTokens.space.sm,
    marginTop: 4,
  },
  metaChip: {
    fontSize: nrmTokens.font.caption,
    fontWeight: '400',
  },
});
