import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
  type ViewToken,
} from 'react-native';

import { NrmChartTrackArt } from '@/components/nrm/charts/NrmChartTrackArt';
import { NrmHomeChartLaurelWreath } from '@/components/nrm/NrmHomeChartLaurelWreath';
import {
  NrmHomeChartRankCrown,
  homeChartCrownClearanceInset,
  homeChartPodiumTextColors,
  homeChartPodiumTier,
} from '@/components/nrm/NrmHomeChartRankCrown';
import { nrmTokens } from '@/constants/nrmTokens';
import { homeChartItemsFingerprint } from '@/lib/nrmHomeChartClient';
import type { ChartTrackItem } from '@/lib/nrmChartsTypes';

const AUTO_ADVANCE_MS = 5000;
/** TOP 라벨 + 숫자 블록 높이 — 위치 고정 */
const RANK_HERO_BLOCK_HEIGHT = 72;

type Props = {
  isDark: boolean;
  items: ChartTrackItem[];
  loading?: boolean;
  initialIndex?: number;
  onIndexChange?: (index: number) => void;
  onTrackPress: (item: ChartTrackItem) => void;
};

function wrapIndex(i: number, count: number): number {
  if (count <= 0) return 0;
  return ((i % count) + count) % count;
}

function clampIndex(i: number, count: number): number {
  if (count <= 0) return 0;
  return Math.min(Math.max(i, 0), count - 1);
}

function toPhysicalIndex(logical: number, count: number): number {
  if (count <= 1) return clampIndex(logical, count);
  return count + wrapIndex(logical, count);
}

function toLogicalIndex(physical: number, count: number): number {
  if (count <= 0) return 0;
  return wrapIndex(physical, count);
}

/** 마지막→첫·첫→마지막 래핑 시 FlatList가 중간 페이지를 모두 지나가는 것을 방지 */
function isLoopWrap(from: number, to: number, count: number, direction: number): boolean {
  if (count <= 1) return false;
  if (direction > 0) return from === count - 1 && to === 0;
  if (direction < 0) return from === 0 && to === count - 1;
  return false;
}

type CarouselSlideProps = {
  item: ChartTrackItem;
  index: number;
  pageWidth: number;
  coverSize: number;
  trackInset: number;
  onPress: () => void;
};

function CarouselSlide({ item, index, pageWidth, coverSize, trackInset, onPress }: CarouselSlideProps) {
  const rank = item.rank > 0 ? item.rank : index + 1;

  return (
    <View style={[styles.page, { width: pageWidth }]}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.coverPress,
          {
            width: coverSize,
            height: coverSize,
            marginTop: trackInset,
          },
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

type ChartNavButtonProps = {
  direction: 'prev' | 'next';
  disabled: boolean;
  isDark: boolean;
  onPress: () => void;
  style: StyleProp<ViewStyle>;
};

function ChartNavButton({ direction, disabled, isDark, onPress, style }: ChartNavButtonProps) {
  const borderColor = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const bg = isDark ? 'rgba(255,255,255,0.06)' : nrmTokens.color.canvas;
  const iconColor = isDark ? nrmTokens.color.primaryOnDark : nrmTokens.color.primary;
  const pressedBg = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.05)';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={{ top: 8, bottom: 8, left: direction === 'prev' ? 4 : 8, right: direction === 'next' ? 4 : 8 }}
      style={({ pressed }) => [
        styles.navBtn,
        {
          backgroundColor: pressed ? pressedBg : bg,
          borderColor,
          opacity: disabled ? 0 : 1,
        },
        style,
        disabled && styles.navBtnHidden,
      ]}
      accessibilityRole="button"
      accessibilityLabel={direction === 'prev' ? '이전 순위' : '다음 순위'}>
      <Ionicons
        name={direction === 'prev' ? 'chevron-back' : 'chevron-forward'}
        size={20}
        color={iconColor}
      />
    </Pressable>
  );
}

export function NrmHomeChartCarousel({
  isDark,
  items,
  loading = false,
  initialIndex = 0,
  onIndexChange,
  onTrackPress,
}: Props) {
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<ChartTrackItem>>(null);
  const [index, setIndex] = useState(() => clampIndex(initialIndex, items.length));
  const indexRef = useRef(index);
  indexRef.current = index;

  const countRef = useRef(items.length);
  countRef.current = items.length;
  const loopEnabledRef = useRef(items.length > 1);
  loopEnabledRef.current = items.length > 1;

  const userDraggingRef = useRef(false);
  const autoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const repositioningRef = useRef(false);
  const onIndexChangeRef = useRef(onIndexChange);
  onIndexChangeRef.current = onIndexChange;

  const coverSize = Math.min(Math.round(width * 0.74), 340);
  const trackInset = homeChartCrownClearanceInset(coverSize);
  const slideHeight = trackInset + coverSize;
  const navBtnSize = 40;
  const navBtnGap = 6;
  const pageWidth = coverSize;

  const ink = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
  const muted = isDark ? 'rgba(255,255,255,0.58)' : nrmTokens.color.inkMuted48;
  const accent = isDark ? nrmTokens.color.primaryOnDark : nrmTokens.color.primary;

  const count = items.length;
  const loopEnabled = count > 1;
  const itemsFingerprint = useMemo(() => homeChartItemsFingerprint(items), [items]);
  const prevFingerprintRef = useRef(itemsFingerprint);

  const loopData = useMemo(() => {
    if (!loopEnabled) return items;
    return [...items, ...items, ...items];
  }, [items, loopEnabled]);

  const current = count > 0 ? items[clampIndex(index, count)] : null;
  const currentRank = current ? (current.rank > 0 ? current.rank : index + 1) : 0;
  const podiumTier = homeChartPodiumTier(currentRank);
  const podiumColors = homeChartPodiumTextColors(currentRank, isDark);
  const rankTopLabelColor = podiumColors?.label ?? muted;
  const rankNumberColor = podiumColors?.number ?? ink;

  const syncIndex = useCallback((nextIndex: number, force = false) => {
    const c = countRef.current;
    if (c <= 0) return;
    const logical = wrapIndex(nextIndex, c);
    if (!force && logical === indexRef.current) return;
    indexRef.current = logical;
    setIndex(logical);
    onIndexChangeRef.current?.(logical);
  }, []);

  const scrollToOffset = useCallback(
    (physical: number, animated: boolean) => {
      listRef.current?.scrollToOffset({
        offset: physical * pageWidth,
        animated,
      });
    },
    [pageWidth],
  );

  const recenterIfNeeded = useCallback(
    (physical: number) => {
      const c = countRef.current;
      if (!loopEnabledRef.current || repositioningRef.current || c <= 1) return physical;
      let target = physical;
      if (physical < c) target = physical + c;
      else if (physical >= c * 2) target = physical - c;
      if (target !== physical) {
        repositioningRef.current = true;
        requestAnimationFrame(() => {
          scrollToOffset(target, false);
          repositioningRef.current = false;
          syncIndex(toLogicalIndex(target, c), true);
        });
      }
      return target;
    },
    [scrollToOffset, syncIndex],
  );

  const scrollToLogicalIndex = useCallback(
    (logicalIndex: number, animated = true) => {
      const c = countRef.current;
      if (c <= 0) return;
      const from = indexRef.current;
      const logical = wrapIndex(logicalIndex, c);
      const direction = logicalIndex - from;
      const wraps = isLoopWrap(from, logical, c, direction);
      const useAnimated = animated && !wraps;
      const physical = toPhysicalIndex(logical, c);

      syncIndex(logical, true);
      scrollToOffset(physical, useAnimated);
    },
    [scrollToOffset, syncIndex],
  );

  const clearAutoAdvance = useCallback(() => {
    if (autoTimerRef.current) {
      clearInterval(autoTimerRef.current);
      autoTimerRef.current = null;
    }
  }, []);

  const scheduleAutoAdvance = useCallback(() => {
    clearAutoAdvance();
    if (!loopEnabledRef.current) return;
    autoTimerRef.current = setInterval(() => {
      if (!mountedRef.current || userDraggingRef.current) return;
      scrollToLogicalIndex(indexRef.current + 1, true);
    }, AUTO_ADVANCE_MS);
  }, [clearAutoAdvance, scrollToLogicalIndex]);

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 55,
    minimumViewTime: 0,
  }).current;

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (repositioningRef.current || viewableItems.length === 0) return;
      const token = viewableItems.find((v) => v.isViewable) ?? viewableItems[0];
      if (token?.index == null) return;
      const c = countRef.current;
      const logical = loopEnabledRef.current ? toLogicalIndex(token.index, c) : token.index;
      syncIndex(logical);
    },
  ).current;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearAutoAdvance();
    };
  }, [clearAutoAdvance]);

  useEffect(() => {
    scheduleAutoAdvance();
    return clearAutoAdvance;
  }, [index, count, scheduleAutoAdvance, clearAutoAdvance]);

  useEffect(() => {
    if (prevFingerprintRef.current === itemsFingerprint) return;
    prevFingerprintRef.current = itemsFingerprint;
    syncIndex(0, true);
    requestAnimationFrame(() => {
      scrollToOffset(toPhysicalIndex(0, count), false);
    });
  }, [count, itemsFingerprint, scrollToOffset, syncIndex]);

  useEffect(() => {
    if (count <= 0) return;
    const logical = wrapIndex(initialIndex, count);
    if (logical === indexRef.current) return;
    scrollToLogicalIndex(logical, false);
  }, [initialIndex, count, scrollToLogicalIndex]);

  const resolveScrollIndex = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const physical = Math.round(x / pageWidth);
      const logical = toLogicalIndex(physical, count);
      syncIndex(logical, true);
      recenterIfNeeded(physical);
    },
    [count, pageWidth, recenterIfNeeded, syncIndex],
  );

  const onScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (repositioningRef.current) return;
      userDraggingRef.current = false;
      resolveScrollIndex(e);
      scheduleAutoAdvance();
    },
    [resolveScrollIndex, scheduleAutoAdvance],
  );

  const onScrollEndDrag = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const velocity = e.nativeEvent.velocity?.x ?? 0;
      if (Math.abs(velocity) <= 0.05) {
        onScrollEnd(e);
        return;
      }
      userDraggingRef.current = false;
      scheduleAutoAdvance();
    },
    [onScrollEnd, scheduleAutoAdvance],
  );

  const goPrev = useCallback(() => {
    if (!loopEnabled) return;
    clearAutoAdvance();
    scrollToLogicalIndex(indexRef.current - 1, true);
    scheduleAutoAdvance();
  }, [clearAutoAdvance, loopEnabled, scheduleAutoAdvance, scrollToLogicalIndex]);

  const goNext = useCallback(() => {
    if (!loopEnabled) return;
    clearAutoAdvance();
    scrollToLogicalIndex(indexRef.current + 1, true);
    scheduleAutoAdvance();
  }, [clearAutoAdvance, loopEnabled, scheduleAutoAdvance, scrollToLogicalIndex]);

  const onScrollBeginDrag = useCallback(() => {
    userDraggingRef.current = true;
    clearAutoAdvance();
  }, [clearAutoAdvance]);

  const getItemLayout = useCallback(
    (_: ArrayLike<ChartTrackItem> | null | undefined, i: number) => ({
      length: pageWidth,
      offset: pageWidth * i,
      index: i,
    }),
    [pageWidth],
  );

  const renderItem = useCallback(
    ({ item, index: itemIndex }: { item: ChartTrackItem; index: number }) => (
      <CarouselSlide
        item={item}
        index={loopEnabled ? toLogicalIndex(itemIndex, count) : itemIndex}
        pageWidth={pageWidth}
        coverSize={coverSize}
        trackInset={trackInset}
        onPress={() => onTrackPress(item)}
      />
    ),
    [count, coverSize, loopEnabled, onTrackPress, pageWidth, trackInset],
  );

  const keyExtractor = useCallback(
    (item: ChartTrackItem, i: number) => `chart-${i}-${item.trackId}-${item.rank}`,
    [],
  );

  const onPressTrack = useCallback(() => {
    if (current) onTrackPress(current);
  }, [current, onTrackPress]);

  const navBtnTop = RANK_HERO_BLOCK_HEIGHT + slideHeight / 2 - navBtnSize / 2;
  const initialPhysical = toPhysicalIndex(clampIndex(initialIndex, count), count);

  const carouselBlock = (
    <View style={[styles.carouselViewport, { width: coverSize, height: slideHeight }]}>
      <FlatList
        ref={listRef}
        data={loopData}
        horizontal
        pagingEnabled
        bounces={loopEnabled}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        getItemLayout={getItemLayout}
        initialScrollIndex={loopEnabled ? initialPhysical : clampIndex(initialIndex, count)}
        onScrollToIndexFailed={(info) => {
          requestAnimationFrame(() => {
            scrollToOffset(info.index, false);
          });
        }}
        onScrollBeginDrag={onScrollBeginDrag}
        onMomentumScrollEnd={onScrollEnd}
        onScrollEndDrag={onScrollEndDrag}
        scrollEventThrottle={16}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        style={{ width: pageWidth }}
        contentContainerStyle={{ alignItems: 'flex-start' }}
        extraData={itemsFingerprint}
      />
    </View>
  );

  const metaBlock = (
    <Pressable
      onPress={onPressTrack}
      style={({ pressed }) => [
        styles.metaPress,
        podiumTier ? styles.metaPressPodium : null,
        pressed && styles.metaPressed,
      ]}
      accessibilityRole="button">
      <Text style={[styles.artist, { color: muted }]} numberOfLines={2}>
        {current?.artists || '—'}
      </Text>
      <Text style={[styles.title, { color: ink }]} numberOfLines={2}>
        {current?.title || '—'}
      </Text>
      {podiumTier ? <NrmHomeChartLaurelWreath rank={currentRank} width={coverSize} /> : null}
    </Pressable>
  );

  const trackBody = (
    <View style={styles.plainTrackBody}>
      {carouselBlock}
      {metaBlock}
    </View>
  );

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
    <View style={styles.root} accessibilityRole="adjustable">
      <View style={styles.content}>
        <View
          style={[
            styles.coverStage,
            {
              width: coverSize,
              height: RANK_HERO_BLOCK_HEIGHT + slideHeight,
            },
          ]}>
          <View style={[styles.rankHero, { height: RANK_HERO_BLOCK_HEIGHT }]} accessibilityLabel={`탑 ${currentRank}`}>
            <Text style={[styles.rankTopLabel, { color: rankTopLabelColor }]}>TOP</Text>
            <Text style={[styles.rankHeroNumber, { color: rankNumberColor }]}>{currentRank}</Text>
          </View>

          <ChartNavButton
            direction="prev"
            disabled={!loopEnabled}
            isDark={isDark}
            onPress={goPrev}
            style={{
              width: navBtnSize,
              height: navBtnSize,
              top: navBtnTop,
              left: navBtnGap,
            }}
          />

          {trackBody}

          <ChartNavButton
            direction="next"
            disabled={!loopEnabled}
            isDark={isDark}
            onPress={goNext}
            style={{
              width: navBtnSize,
              height: navBtnSize,
              top: navBtnTop,
              left: coverSize - navBtnSize - navBtnGap,
            }}
          />
        </View>
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
  },
  loadingText: {
    marginTop: nrmTokens.space.sm,
    fontSize: nrmTokens.font.caption,
    textAlign: 'center',
  },
  page: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  rankHero: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
    paddingBottom: nrmTokens.space.xs,
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
    justifyContent: 'flex-start',
    minHeight: 0,
    overflow: 'visible',
  },
  plainTrackBody: {
    width: '100%',
    alignItems: 'center',
  },
  carouselViewport: {
    overflow: 'hidden',
  },
  navBtn: {
    position: 'absolute',
    zIndex: 55,
    borderRadius: nrmTokens.radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
      },
      android: {
        elevation: 55,
      },
      default: {},
    }),
  },
  navBtnHidden: {
    opacity: 0,
    pointerEvents: 'none',
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
        shadowColor: '#1d1d1f',
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
    paddingTop: nrmTokens.space.md,
    paddingBottom: nrmTokens.space.sm,
  },
  metaPressPodium: {
    paddingTop: nrmTokens.space.sm,
    paddingBottom: nrmTokens.space.md,
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
