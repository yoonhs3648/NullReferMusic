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
import { nrmTokens } from '@/constants/nrmTokens';
import { fetchSpotifyPlaylistChart } from '@/lib/nrmChartsClient';
import {
  isSpotifyChartsFetchAuthError,
  runSpotifyChartsAuthFlow,
} from '@/lib/nrmSpotifyChartsAuthFlow';
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
  onRenewChartsBearer?: () => Promise<boolean>;
  onShowBearerExpired?: () => void;
  onTrackPress?: (item: ChartTrackItem) => void;
};

type TabSnapshot = {
  items: ChartTrackItem[];
  playlistTitle: string | null;
  errorCode: ChartErrorCode | null;
  loading: boolean;
};

const EMPTY_SNAPSHOT: TabSnapshot = {
  items: [],
  playlistTitle: null,
  errorCode: null,
  loading: false,
};

function mapChartItems(rows: ChartTrackItem[]): ChartTrackItem[] {
  return rows.map((row) => ({
    ...row,
    popularity: row.popularity ?? 0,
    releaseDate: row.releaseDate ?? '',
  }));
}

export function NrmSpotifyChartsHome({
  isDark,
  paddingHorizontal,
  chartSource,
  onBackToHome,
  onOpenChartsSession,
  onRenewChartsBearer,
  onShowBearerExpired,
  onTrackPress,
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
  const [items, setItems] = useState<ChartTrackItem[]>([]);
  const [errorCode, setErrorCode] = useState<ChartErrorCode | null>(null);
  const [playlistTitle, setPlaylistTitle] = useState<string | null>(null);
  const [tabLoading, setTabLoading] = useState(true);

  const tabCacheRef = useRef<Map<SpotifyChartTabId, TabSnapshot>>(new Map());
  const loadGenRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  const applySnapshot = useCallback((snap: TabSnapshot) => {
    setItems(snap.items);
    setPlaylistTitle(snap.playlistTitle);
    setErrorCode(snap.errorCode);
    setTabLoading(snap.loading);
  }, []);

  const selectTab = useCallback(
    (tab: SpotifyChartTabId) => {
      if (tab === activeTabRef.current) return;
      abortRef.current?.abort();
      setActiveTab(tab);
      const cached = tabCacheRef.current.get(tab);
      applySnapshot(cached ?? { ...EMPTY_SNAPSHOT, loading: !cached });
    },
    [applySnapshot],
  );

  const loadChart = useCallback(
    async (tab: SpotifyChartTabId, generation: number) => {
      const ac = new AbortController();
      abortRef.current = ac;

      const loadingSnap: TabSnapshot = {
        ...(tabCacheRef.current.get(tab) ?? EMPTY_SNAPSHOT),
        loading: true,
        errorCode: null,
      };
      tabCacheRef.current.set(tab, loadingSnap);
      if (generation === loadGenRef.current) {
        applySnapshot(loadingSnap);
      }

      const fetchTab = () => fetchSpotifyPlaylistChart(tab, chartSource, ac.signal);
      const out =
        chartSource === 'charts' &&
        (onRenewChartsBearer || onShowBearerExpired)
          ? await runSpotifyChartsAuthFlow(
              fetchTab,
              (r) => !r.ok && isSpotifyChartsFetchAuthError(r),
              {
                onRenewChartsBearer,
                onOpenChartsSession,
                onShowBearerExpired,
              },
            )
          : await fetchTab();
      if (ac.signal.aborted || generation !== loadGenRef.current) {
        const stale = tabCacheRef.current.get(tab);
        if (stale?.loading) {
          tabCacheRef.current.set(tab, { ...stale, loading: false });
        }
        return;
      }

      if (!out.ok) {
        const errSnap: TabSnapshot = {
          items: [],
          playlistTitle: null,
          errorCode: out.errorCode,
          loading: false,
        };
        tabCacheRef.current.set(tab, errSnap);
        applySnapshot(errSnap);
        return;
      }

      const okSnap: TabSnapshot = {
        items: mapChartItems(out.data.items),
        playlistTitle: out.data.playlistName,
        errorCode: null,
        loading: false,
      };
      tabCacheRef.current.set(tab, okSnap);
      applySnapshot(okSnap);
    },
    [applySnapshot, chartSource, onOpenChartsSession, onRenewChartsBearer, onShowBearerExpired],
  );

  useEffect(() => {
    abortRef.current?.abort();
    loadGenRef.current += 1;
    tabCacheRef.current.clear();
    applySnapshot({ ...EMPTY_SNAPSHOT, loading: true });
  }, [chartSource, applySnapshot]);

  useEffect(() => {
    const generation = ++loadGenRef.current;
    abortRef.current?.abort();

    const cached = tabCacheRef.current.get(activeTab);
    if (cached && !cached.loading) {
      applySnapshot(cached);
      return;
    }

    void loadChart(activeTab, generation);
  }, [activeTab, chartSource, applySnapshot, loadChart]);

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
      <NrmChartFilterScrollRow>
        {NRM_SPOTIFY_CHART_TABS.map((tab) => {
          const selected = tab.id === activeTab;
          const cached = tabCacheRef.current.get(tab.id);
          const showTabSpinner = selected && tabLoading && !cached?.items.length;
          return (
            <Pressable
              key={tab.id}
              onPress={() => selectTab(tab.id)}
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
              {showTabSpinner ? (
                <ActivityIndicator
                  size="small"
                  color={nrmTokens.color.primary}
                  style={styles.tabSpinner}
                />
              ) : null}
            </Pressable>
          );
        })}
      </NrmChartFilterScrollRow>
      {playlistTitle && !errorCode ? (
        <Text style={[styles.playlistHint, { color: bodyColor }]}>
          {playlistTitle} · {items.length}곡
        </Text>
      ) : null}
      {tabLoading && !items.length && !errorCode ? (
        <ActivityIndicator
          style={styles.loader}
          color={nrmTokens.color.primary}
        />
      ) : null}
    </View>
  );

  const listEmpty =
    tabLoading && !items.length && !errorCode ? null : errorCode ? (
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
      nestedScrollEnabled
      data={tabLoading && !items.length ? [] : items}
      keyExtractor={(item) =>
        `${chartSource}-${activeTab}-${item.trackId}-${item.rank}`
      }
      renderItem={({ item }) => (
        <View style={{ paddingHorizontal: paddingHorizontal }}>
          <NrmChartTrackRow
            item={item}
            titleColor={titleColor}
            bodyColor={bodyColor}
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
        (tabLoading || errorCode) && !items.length && styles.listContentEmpty,
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
  tabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: nrmTokens.space.md,
    paddingVertical: nrmTokens.space.sm,
    borderRadius: nrmTokens.radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tabChipPressed: {
    opacity: 0.9,
  },
  tabSpinner: {
    marginLeft: 2,
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
});
