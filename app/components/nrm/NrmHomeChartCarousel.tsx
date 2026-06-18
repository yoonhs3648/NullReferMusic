import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NrmChartTrackArt } from '@/components/nrm/charts/NrmChartTrackArt';
import { NrmHomeChartRankCrown, homeChartPodiumTextColors } from '@/components/nrm/NrmHomeChartRankCrown';
import { nrmTokens } from '@/constants/nrmTokens';
import { homeChartItemsFingerprint } from '@/lib/nrmHomeChartClient';
import type { ChartTrackItem } from '@/lib/nrmChartsTypes';

type Props = {
  isDark: boolean;
  items: ChartTrackItem[];
  loading?: boolean;
  onTrackPress: (item: ChartTrackItem) => void;
};

/** 메뉴 좌측 스와이프 영역과 겹치지 않도록 여유를 둔 시작 X (px) */
function menuSwipeGuardPx(insetsLeft: number): number {
  const base = Platform.OS === 'web' ? 36 : 32;
  return base + insetsLeft;
}

export function NrmHomeChartCarousel({
  isDark,
  items,
  loading = false,
  onTrackPress,
}: Props) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  indexRef.current = index;

  const coverSize = Math.min(Math.round(width * 0.74), 340);
  const arrowW = 38;
  const arrowH = 48;
  /** 앨범 커버 바깥쪽으로 살짝 띄운 간격 */
  const arrowGap = 10;

  const ink = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
  const muted = isDark ? 'rgba(255,255,255,0.58)' : nrmTokens.color.inkMuted48;
  const accent = isDark ? nrmTokens.color.primaryOnDark : nrmTokens.color.primary;
  const arrowBg = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.045)';
  const arrowPressedBg = isDark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.08)';

  const count = items.length;
  const itemsFingerprint = useMemo(() => homeChartItemsFingerprint(items), [items]);
  const prevFingerprintRef = useRef(itemsFingerprint);

  useEffect(() => {
    if (prevFingerprintRef.current === itemsFingerprint) return;
    prevFingerprintRef.current = itemsFingerprint;
    setIndex(0);
  }, [itemsFingerprint]);

  const current = count > 0 ? items[Math.min(index, count - 1)] : null;

  const goPrev = useCallback(() => {
    if (count <= 1) return;
    setIndex((i) => (i - 1 + count) % count);
  }, [count]);

  const goNext = useCallback(() => {
    if (count <= 1) return;
    setIndex((i) => (i + 1) % count);
  }, [count]);

  const edgeGuard = menuSwipeGuardPx(insets.left);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (evt, g) => {
          if (evt.nativeEvent.pageX < edgeGuard) return false;
          return Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.15;
        },
        onPanResponderRelease: (_, g) => {
          if (g.dx > 48) goPrev();
          else if (g.dx < -48) goNext();
        },
      }),
    [edgeGuard, goNext, goPrev],
  );

  const onPressTrack = useCallback(() => {
    if (current) onTrackPress(current);
  }, [current, onTrackPress]);

  if (loading) {
    return (
      <View style={styles.root}>
        <ActivityIndicator size="large" color={accent} />
        <Text style={[styles.loadingText, { color: muted }]}>실시간 차트 불러오는 중…</Text>
      </View>
    );
  }

  if (!current) return null;

  const rank = current.rank > 0 ? current.rank : index + 1;
  const podiumColors = homeChartPodiumTextColors(rank, isDark);
  const rankTopLabelColor = podiumColors?.label ?? muted;
  const rankNumberColor = podiumColors?.number ?? ink;

  return (
    <View style={styles.root} accessibilityRole="adjustable" {...panResponder.panHandlers}>
      <View style={styles.content}>
        <View style={styles.rankHero} accessibilityLabel={`탑 ${rank}`}>
          <Text style={[styles.rankTopLabel, { color: rankTopLabelColor }]}>TOP</Text>
          <Text style={[styles.rankHeroNumber, { color: rankNumberColor }]}>{rank}</Text>
        </View>

        <View
          style={[
            styles.coverStage,
            {
              width: coverSize,
              height: coverSize,
            },
          ]}>
          <Pressable
            onPress={goPrev}
            disabled={count <= 1}
            style={({ pressed }) => [
              styles.navBtn,
              {
                width: arrowW,
                height: arrowH,
                backgroundColor: pressed && count > 1 ? arrowPressedBg : arrowBg,
                top: coverSize / 2 - arrowH / 2,
                left: -(arrowW + arrowGap),
              },
              count <= 1 && styles.navBtnHidden,
            ]}
            accessibilityRole="button"
            accessibilityLabel="이전 순위">
            <Ionicons name="chevron-back" size={20} color={ink} style={styles.navIcon} />
          </Pressable>

          <Pressable
            onPress={onPressTrack}
            style={({ pressed }) => [
              styles.coverPress,
              {
                width: coverSize,
                height: coverSize,
              },
              pressed && styles.coverPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${current.artists} ${current.title}`}>
            <View style={[styles.coverFrame, { width: coverSize, height: coverSize }]}>
              <View
                style={[
                  styles.coverShadow,
                  {
                    width: coverSize,
                    height: coverSize,
                    shadowColor: isDark ? '#000' : '#1d1d1f',
                  },
                ]}>
                <NrmChartTrackArt
                  imageUrl={current.imageUrl}
                  size={coverSize}
                  borderRadius={nrmTokens.radius.lg}
                  cacheKey={`${current.trackId}-${rank}`}
                />
              </View>
              <NrmHomeChartRankCrown rank={rank} coverSize={coverSize} />
            </View>
          </Pressable>

          <Pressable
            onPress={goNext}
            disabled={count <= 1}
            style={({ pressed }) => [
              styles.navBtn,
              {
                width: arrowW,
                height: arrowH,
                backgroundColor: pressed && count > 1 ? arrowPressedBg : arrowBg,
                top: coverSize / 2 - arrowH / 2,
                left: coverSize + arrowGap,
              },
              count <= 1 && styles.navBtnHidden,
            ]}
            accessibilityRole="button"
            accessibilityLabel="다음 순위">
            <Ionicons name="chevron-forward" size={20} color={ink} style={styles.navIcon} />
          </Pressable>
        </View>

        <Pressable
          onPress={onPressTrack}
          style={({ pressed }) => [styles.metaPress, pressed && styles.metaPressed]}
          accessibilityRole="button">
          <Text style={[styles.artist, { color: muted }]} numberOfLines={2}>
            {current.artists || '—'}
          </Text>
          <Text style={[styles.title, { color: ink }]} numberOfLines={2}>
            {current.title || '—'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    maxWidth: nrmTokens.layout.homeSearchClusterMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: nrmTokens.space.md,
    paddingTop: nrmTokens.space.xs,
    paddingBottom: nrmTokens.space.xl,
  },
  content: {
    width: '100%',
    alignItems: 'center',
    gap: nrmTokens.space.md,
  },
  loadingText: {
    marginTop: nrmTokens.space.sm,
    fontSize: nrmTokens.font.caption,
    textAlign: 'center',
  },
  rankHero: {
    alignItems: 'center',
    gap: 2,
    marginBottom: nrmTokens.space.xs,
  },
  rankTopLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 3.2,
    textTransform: 'uppercase',
  },
  rankHeroNumber: {
    fontSize: 44,
    fontWeight: '800',
    letterSpacing: -1.2,
    lineHeight: 48,
    fontVariant: ['tabular-nums'],
  },
  coverStage: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 0,
    overflow: 'visible',
  },
  navBtn: {
    position: 'absolute',
    zIndex: 2,
    borderRadius: nrmTokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
      },
      android: {
        elevation: 2,
      },
      default: {},
    }),
  },
  navBtnHidden: {
    opacity: 0,
    pointerEvents: 'none',
  },
  navIcon: {
    opacity: 0.88,
  },
  coverPress: {
    alignItems: 'center',
  },
  coverFrame: {
    position: 'relative',
    overflow: 'visible',
  },
  coverPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  coverShadow: {
    borderRadius: nrmTokens.radius.lg,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.24,
        shadowRadius: 20,
      },
      android: {
        elevation: 10,
      },
      default: {},
    }),
  },
  metaPress: {
    width: '100%',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: nrmTokens.space.sm,
    paddingTop: nrmTokens.space.xs,
  },
  metaPressed: {
    opacity: 0.88,
  },
  artist: {
    fontSize: 18,
    fontWeight: '500',
    lineHeight: 24,
    textAlign: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    lineHeight: 34,
    letterSpacing: -0.4,
    textAlign: 'center',
  },
});
