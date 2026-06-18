import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
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

function modIndex(i: number, count: number): number {
  if (count <= 0) return 0;
  return ((i % count) + count) % count;
}

type CarouselSlideProps = {
  item: ChartTrackItem;
  index: number;
  coverSize: number;
  isDark: boolean;
  ink: string;
  muted: string;
  onPress: () => void;
};

function CarouselSlide({
  item,
  index,
  coverSize,
  isDark,
  ink,
  muted,
  onPress,
}: CarouselSlideProps) {
  const rank = item.rank > 0 ? item.rank : index + 1;
  const podiumColors = homeChartPodiumTextColors(rank, isDark);
  const rankTopLabelColor = podiumColors?.label ?? muted;
  const rankNumberColor = podiumColors?.number ?? ink;

  return (
    <View style={[styles.slide, { width: coverSize }]}>
      <View style={styles.rankHero} accessibilityLabel={`탑 ${rank}`}>
        <Text style={[styles.rankTopLabel, { color: rankTopLabelColor }]}>TOP</Text>
        <Text style={[styles.rankHeroNumber, { color: rankNumberColor }]}>{rank}</Text>
      </View>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.coverPress,
          { width: coverSize, height: coverSize },
          pressed && styles.coverPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${item.artists} ${item.title}`}>
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
              imageUrl={item.imageUrl}
              size={coverSize}
              borderRadius={nrmTokens.radius.lg}
              cacheKey={`${item.trackId}-${rank}`}
            />
          </View>
          <NrmHomeChartRankCrown rank={rank} coverSize={coverSize} />
        </View>
      </Pressable>
    </View>
  );
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
  const arrowGap = 10;
  const slideGap = Math.round(coverSize * 0.08);
  const slideStride = coverSize + slideGap;

  const ink = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
  const muted = isDark ? 'rgba(255,255,255,0.58)' : nrmTokens.color.inkMuted48;
  const accent = isDark ? nrmTokens.color.primaryOnDark : nrmTokens.color.primary;
  const arrowBg = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.045)';
  const arrowPressedBg = isDark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.08)';

  const count = items.length;
  const itemsFingerprint = useMemo(() => homeChartItemsFingerprint(items), [items]);
  const prevFingerprintRef = useRef(itemsFingerprint);

  const translateX = useRef(new Animated.Value(0)).current;
  const dragX = useRef(new Animated.Value(0)).current;
  const animatingRef = useRef(false);

  useEffect(() => {
    if (prevFingerprintRef.current === itemsFingerprint) return;
    prevFingerprintRef.current = itemsFingerprint;
    setIndex(0);
    translateX.setValue(0);
    dragX.setValue(0);
  }, [itemsFingerprint, translateX, dragX]);

  const current = count > 0 ? items[modIndex(index, count)] : null;
  const prevItem = count > 1 ? items[modIndex(index - 1, count)] : null;
  const nextItem = count > 1 ? items[modIndex(index + 1, count)] : null;

  const settleTo = useCallback(
    (nextIndex: number, direction: -1 | 0 | 1) => {
      if (count <= 1 || animatingRef.current) return;
      if (direction === 0) {
        Animated.spring(dragX, {
          toValue: 0,
          useNativeDriver: true,
          tension: 140,
          friction: 18,
        }).start();
        return;
      }
      animatingRef.current = true;
      Animated.timing(dragX, {
        toValue: direction * -slideStride,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) {
          animatingRef.current = false;
          dragX.setValue(0);
          return;
        }
        setIndex(nextIndex);
        dragX.setValue(0);
        animatingRef.current = false;
      });
    },
    [count, dragX, slideStride],
  );

  const goPrev = useCallback(() => {
    if (count <= 1 || animatingRef.current) return;
    settleTo(modIndex(indexRef.current - 1, count), 1);
  }, [count, settleTo]);

  const goNext = useCallback(() => {
    if (count <= 1 || animatingRef.current) return;
    settleTo(modIndex(indexRef.current + 1, count), -1);
  }, [count, settleTo]);

  const edgeGuard = menuSwipeGuardPx(insets.left);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (evt, g) => {
          if (animatingRef.current || count <= 1) return false;
          if (evt.nativeEvent.pageX < edgeGuard) return false;
          return Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.15;
        },
        onPanResponderMove: (_, g) => {
          if (animatingRef.current) return;
          const maxDrag = slideStride * 0.92;
          const clamped = Math.max(-maxDrag, Math.min(maxDrag, g.dx));
          dragX.setValue(clamped);
        },
        onPanResponderRelease: (_, g) => {
          if (animatingRef.current) return;
          const threshold = slideStride * 0.22;
          if (g.dx > threshold) {
            settleTo(modIndex(indexRef.current - 1, count), 1);
          } else if (g.dx < -threshold) {
            settleTo(modIndex(indexRef.current + 1, count), -1);
          } else {
            settleTo(indexRef.current, 0);
          }
        },
        onPanResponderTerminate: () => {
          if (!animatingRef.current) settleTo(indexRef.current, 0);
        },
      }),
    [count, edgeGuard, dragX, settleTo, slideStride],
  );

  const onPressTrack = useCallback(() => {
    if (current) onTrackPress(current);
  }, [current, onTrackPress]);

  const trackTranslateX = Animated.add(translateX, dragX);

  if (loading) {
    return (
      <View style={styles.root}>
        <ActivityIndicator size="large" color={accent} />
        <Text style={[styles.loadingText, { color: muted }]}>실시간 차트 불러오는 중…</Text>
      </View>
    );
  }

  if (!current) return null;

  return (
    <View style={styles.root} accessibilityRole="adjustable" {...panResponder.panHandlers}>
      <View style={styles.content}>
        <View
          style={[
            styles.coverStage,
            {
              width: coverSize,
              height: coverSize + 72,
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
                top: (coverSize + 72) / 2 - arrowH / 2,
                left: -(arrowW + arrowGap),
              },
              count <= 1 && styles.navBtnHidden,
            ]}
            accessibilityRole="button"
            accessibilityLabel="이전 순위">
            <Ionicons name="chevron-back" size={20} color={ink} style={styles.navIcon} />
          </Pressable>

          <View style={[styles.carouselViewport, { width: coverSize, height: coverSize + 72 }]}>
            <Animated.View
              style={[
                styles.carouselTrack,
                {
                  width: slideStride * 3 - slideGap,
                  transform: [{ translateX: trackTranslateX }],
                  marginLeft: -slideStride,
                },
              ]}>
              {prevItem ? (
                <CarouselSlide
                  item={prevItem}
                  index={modIndex(index - 1, count)}
                  coverSize={coverSize}
                  isDark={isDark}
                  ink={ink}
                  muted={muted}
                  onPress={() => onTrackPress(prevItem)}
                />
              ) : (
                <View style={{ width: coverSize }} />
              )}
              <View style={{ width: slideGap }} />
              <CarouselSlide
                item={current}
                index={modIndex(index, count)}
                coverSize={coverSize}
                isDark={isDark}
                ink={ink}
                muted={muted}
                onPress={onPressTrack}
              />
              <View style={{ width: slideGap }} />
              {nextItem ? (
                <CarouselSlide
                  item={nextItem}
                  index={modIndex(index + 1, count)}
                  coverSize={coverSize}
                  isDark={isDark}
                  ink={ink}
                  muted={muted}
                  onPress={() => onTrackPress(nextItem)}
                />
              ) : (
                <View style={{ width: coverSize }} />
              )}
            </Animated.View>
          </View>

          <Pressable
            onPress={goNext}
            disabled={count <= 1}
            style={({ pressed }) => [
              styles.navBtn,
              {
                width: arrowW,
                height: arrowH,
                backgroundColor: pressed && count > 1 ? arrowPressedBg : arrowBg,
                top: (coverSize + 72) / 2 - arrowH / 2,
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
  carouselViewport: {
    overflow: 'hidden',
  },
  carouselTrack: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  slide: {
    alignItems: 'center',
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
