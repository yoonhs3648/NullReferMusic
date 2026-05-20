import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';
import { NrmChartPlatformIcon } from '@/components/nrm/charts/NrmChartPlatformIcon';
import { fetchSpotifyTopChart } from '@/lib/nrmChartsClient';
import { hasSpotifyChartAccess } from '@/lib/nrmSpotifyApiSettings';
import {
  NRM_CHART_PLATFORM_ROWS,
  type ChartMenuPanel,
} from '@/lib/nrmChartsPlatforms';
import {
  nrmChartsShellMessage,
  nrmChartsSpotifyEmptyMessage,
} from '@/lib/nrmChartsStrings';
import type { ChartTrackItem, SpotifyChartPayload } from '@/lib/nrmChartsTypes';

type Props = {
  panel: ChartMenuPanel;
  titleColor: string;
  bodyColor: string;
  rowHover: string;
  onBackToRoot: () => void;
  onBackToCharts: () => void;
  onOpenPlatform: (panel: ChartMenuPanel) => void;
};

function MenuBackRow({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.backRow}
      accessibilityRole="button"
      accessibilityLabel="뒤로">
      <Ionicons name="chevron-back" size={22} color={nrmTokens.color.primary} />
      <Text style={styles.backText}>뒤로</Text>
    </Pressable>
  );
}

function PlatformShell({
  title,
  titleColor,
  bodyColor,
  onBack,
}: {
  title: string;
  titleColor: string;
  bodyColor: string;
  onBack: () => void;
}) {
  return (
    <>
      <MenuBackRow onPress={onBack} />
      <Text style={[styles.panelTitle, { color: titleColor }]}>{title}</Text>
      <Text style={[styles.sectionHint, { color: bodyColor }]}>
        {nrmChartsShellMessage}
      </Text>
    </>
  );
}

function formatDuration(ms: number): string {
  if (!ms || ms < 1000) return '';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function ChartTrackRow({
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
        if (item.externalUrl) {
          void Linking.openURL(item.externalUrl);
        }
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
      </View>
      {item.durationMs > 0 ? (
        <Text style={[styles.duration, { color: bodyColor }]}>
          {formatDuration(item.durationMs)}
        </Text>
      ) : null}
    </Pressable>
  );
}

function SpotifyChartPanel({
  titleColor,
  bodyColor,
  onBack,
}: {
  titleColor: string;
  bodyColor: string;
  onBack: () => void;
}) {
  const [accessOk, setAccessOk] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [chart, setChart] = useState<SpotifyChartPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMessage(null);
    setChart(null);
    void (async () => {
      const ok = await hasSpotifyChartAccess();
      if (cancelled) return;
      setAccessOk(ok);
      if (!ok) {
        setMessage(
          '설정 → 앱 설정 → Spotify API 토큰 관리에서 먼저 등록하세요.',
        );
        setLoading(false);
        return;
      }
      const out = await fetchSpotifyTopChart('KR');
      if (cancelled) return;
      if (out.ok) {
        setChart(out.data);
        if (out.data.items.length === 0) {
          setMessage(nrmChartsSpotifyEmptyMessage);
        }
      } else {
        setMessage(out.message);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const subtitle = chart
    ? `${chart.playlistName} · ${chart.market} · ${chart.items.length}곡`
    : accessOk
      ? '플레이리스트 기반 인기 차트'
      : '';

  return (
    <>
      <MenuBackRow onPress={onBack} />
      <Text style={[styles.panelTitle, { color: titleColor }]}>Spotify</Text>
      {subtitle ? (
        <Text style={[styles.sectionHint, { color: bodyColor }]}>
          {subtitle}
        </Text>
      ) : null}
      {loading ? (
        <ActivityIndicator
          style={styles.loader}
          color={nrmTokens.color.primary}
        />
      ) : null}
      {message ? (
        <Text style={[styles.errorHint, { color: bodyColor }]}>{message}</Text>
      ) : null}
      {chart?.items.map((item) => (
        <ChartTrackRow
          key={`${item.rank}-${item.trackId}`}
          item={item}
          titleColor={titleColor}
          bodyColor={bodyColor}
        />
      ))}
    </>
  );
}

export function NrmMenuChartPanels({
  panel,
  titleColor,
  bodyColor,
  rowHover,
  onBackToRoot,
  onBackToCharts,
  onOpenPlatform,
}: Props) {
  const [spotifyReady, setSpotifyReady] = useState(false);

  useEffect(() => {
    if (panel !== 'charts' && panel !== 'chartSpotify') return;
    let cancelled = false;
    void hasSpotifyChartAccess().then((ok) => {
      if (!cancelled) setSpotifyReady(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [panel]);
  if (panel === 'charts') {
    return (
      <>
        <MenuBackRow onPress={onBackToRoot} />
        <Text style={[styles.panelTitle, { color: titleColor }]}>
          실시간 차트
        </Text>
        {NRM_CHART_PLATFORM_ROWS.map((row) => {
          const isSpotify = row.panel === 'chartSpotify';
          const spotifyBlocked = isSpotify && !spotifyReady;
          return (
            <Pressable
              key={row.panel}
              onPress={() =>
                !spotifyBlocked && onOpenPlatform(row.panel)
              }
              disabled={spotifyBlocked}
              style={({ pressed }) => [
                styles.row,
                spotifyBlocked && styles.rowDisabled,
                spotifyBlocked && styles.rowDisabledSpotifyTint,
                pressed && !spotifyBlocked && { backgroundColor: rowHover },
              ]}>
              <View
                style={spotifyBlocked ? styles.spotifyIconMuted : undefined}>
                <NrmChartPlatformIcon iconKey={row.iconKey} size={28} />
              </View>
              <View style={styles.rowTextBlock}>
                <Text
                  style={[
                    styles.rowLabel,
                    {
                      color: spotifyBlocked ? bodyColor : titleColor,
                      opacity: spotifyBlocked ? 0.5 : 1,
                    },
                  ]}>
                  {row.label}
                </Text>
                <Text
                  style={[
                    styles.rowSubtitle,
                    {
                      color: bodyColor,
                      opacity: spotifyBlocked ? 0.58 : 1,
                    },
                  ]}
                  numberOfLines={2}>
                  {spotifyBlocked
                    ? 'API 토큰을 먼저 등록하세요.'
                    : `${row.subtitle}${
                        !row.implemented ? ' · 준비 중' : ''
                      }`}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={bodyColor}
                style={spotifyBlocked ? { opacity: 0.28 } : undefined}
              />
            </Pressable>
          );
        })}
      </>
    );
  }

  if (panel === 'chartSpotify') {
    return (
      <SpotifyChartPanel
        titleColor={titleColor}
        bodyColor={bodyColor}
        onBack={onBackToCharts}
      />
    );
  }

  const shell = NRM_CHART_PLATFORM_ROWS.find((r) => r.panel === panel);
  if (!shell || shell.implemented) {
    return null;
  }

  return (
    <PlatformShell
      title={shell.label}
      titleColor={titleColor}
      bodyColor={bodyColor}
      onBack={onBackToCharts}
    />
  );
}

const styles = StyleSheet.create({
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.xxs,
    marginTop: nrmTokens.space.md,
    marginBottom: nrmTokens.space.md,
    alignSelf: 'flex-start',
  },
  backText: {
    fontSize: nrmTokens.font.body,
    color: nrmTokens.color.primary,
    fontWeight: '500',
  },
  panelTitle: {
    fontSize: nrmTokens.font.lead,
    fontWeight: '600',
    marginBottom: nrmTokens.space.md,
    letterSpacing: -0.4,
  },
  sectionHint: {
    marginBottom: nrmTokens.space.md,
    fontSize: nrmTokens.font.caption,
    fontWeight: '400',
    lineHeight: 20,
  },
  errorHint: {
    marginBottom: nrmTokens.space.md,
    fontSize: nrmTokens.font.caption,
    lineHeight: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: nrmTokens.space.sm,
    paddingVertical: nrmTokens.space.md,
    paddingHorizontal: nrmTokens.space.xs,
    borderRadius: nrmTokens.radius.sm,
    marginBottom: nrmTokens.space.xs,
  },
  rowDisabled: {
    opacity: 0.78,
  },
  rowDisabledSpotifyTint: {
    backgroundColor: 'rgba(128, 128, 128, 0.08)',
  },
  spotifyIconMuted: {
    opacity: 0.68,
  },
  rowTextBlock: {
    flex: 1,
    minWidth: 0,
    paddingRight: nrmTokens.space.sm,
  },
  rowLabel: {
    fontSize: nrmTokens.font.body,
    fontWeight: '500',
  },
  rowSubtitle: {
    marginTop: 2,
    fontSize: nrmTokens.font.caption,
    fontWeight: '400',
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
    width: 44,
    height: 44,
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
  duration: {
    fontSize: nrmTokens.font.caption,
    fontWeight: '400',
  },
});
