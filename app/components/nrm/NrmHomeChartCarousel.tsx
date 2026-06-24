import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  PanResponder,
  PixelRatio,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ViewToken,
} from 'react-native';import { coverArtUrlForDisplaySize } from '@/lib/nrmCoverArtUrl';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NrmChartTrackArt } from '@/components/nrm/charts/NrmChartTrackArt';
import {
  HOME_CHART_NAV_BTN_SIZE,
  NrmHomeChartNavButton,
} from '@/components/nrm/NrmHomeChartNavButton';
import { NrmHomeChartPodiumBackdropGlow } from '@/components/nrm/NrmHomeChartPodiumBackdropGlow';
import type { HomeChartBackdropGlowTier } from '@/components/nrm/NrmHomeChartPodiumBackdropGlow';
import { NrmHomeChartRankSparkle } from '@/components/nrm/NrmHomeChartRankSparkle';
import { NrmHomeChartRankHeroNumber } from '@/components/nrm/NrmHomeChartRankHeroNumber';
import {
  NrmHomeChartRankCrown,
  homeChartCrownClearanceInset,
  homeChartPodiumTier,
  homeChartRankTopLabelColor,
} from '@/components/nrm/NrmHomeChartRankCrown';
import { nrmTokens } from '@/constants/nrmTokens';
import { homeChartItemsFingerprint } from '@/lib/nrmHomeChartClient';
import type { ChartTrackItem } from '@/lib/nrmChartsTypes';

const AUTO_ADVANCE_MS = 5000;
/** TOP 라벨 + 스파클 + 숫자 블록 — 캐러셀 viewport 밖 고정 */
export const HOME_CHART_RANK_HERO_BLOCK_HEIGHT = 148;
/** rankHero ↔ 앨범 이미지 행 사이 */
export const HOME_CHART_RANK_TO_COVER_GAP = nrmTokens.space.sm;

/** 앨범 이미지(멜론 커버) 하단 — 캐러셀 root 기준 Y */
export function homeChartAlbumImageBottomY(coverSize: number, trackInset: number): number {
  return (
    nrmTokens.space.xs +
    nrmTokens.space.sm +
    HOME_CHART_RANK_HERO_BLOCK_HEIGHT +
    HOME_CHART_RANK_TO_COVER_GAP +
    trackInset +
    coverSize
  );
}
/** TOP 1·2·3 월계수가 제목 아래에 담기는 최소 높이 — coverSize별 계산으로 대체 */
export const HOME_CHART_COVER_WIDTH_FRAC = 0.56;
export const HOME_CHART_COVER_MAX = 268;
export const HOME_CHART_NAV_OUTSIDE_GAP = 14;

export function homeChartStageMetrics(windowWidth: number) {
  const coverSize = Math.min(Math.round(windowWidth * HOME_CHART_COVER_WIDTH_FRAC), HOME_CHART_COVER_MAX);
  const navBtnSize = HOME_CHART_NAV_BTN_SIZE;
  const navOutsideGap = HOME_CHART_NAV_OUTSIDE_GAP;
  const stageWidth = coverSize + 2 * (navBtnSize + navOutsideGap);
  return { coverSize, navBtnSize, navOutsideGap, stageWidth };
}

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

/** 마지막→첫·첫→마지막 래핑 시 인접 복제 슬라이드로 무한 루프 연출 */
function isLoopWrapForward(from: number, to: number, count: number): boolean {
  return count > 1 && from === count - 1 && to === 0;
}

function isLoopWrapBackward(from: number, to: number, count: number): boolean {
  return count > 1 && from === 0 && to === count - 1;
}

/** 메뉴 좌측 엣지 스와이프와 겹치지 않도록 차트 팬 시작 X (px) */
function menuSwipeGuardPx(insetsLeft: number): number {
  const base = Platform.OS === 'web' ? 36 : 32;
  return base + insetsLeft;
}

const MANUAL_SWIPE_THRESHOLD_FRAC = 0.22;
/** 애니메이션 완료 대기 — 여유 있게 잡아 silent-jump가 애니메이션 도중 발생하지 않도록 */
const SCROLL_SNAP_MS = Platform.select({ ios: 480, android: 460, default: 460 }) ?? 460;

type CarouselSlideProps = {
  item: ChartTrackItem;
  index: number;
  pageWidth: number;
  coverSize: number;
  trackInset: number;
  slideHeight: number;
  coverPixelSize: number;
  onPress: () => void;
};

function CarouselSlide({
  item,
  index,
  pageWidth,
  coverSize,
  trackInset,
  slideHeight,
  coverPixelSize,
  onPress,
}: CarouselSlideProps) {
  const rank = item.rank > 0 ? item.rank : index + 1;

  return (
    <View style={[styles.page, { width: pageWidth, height: slideHeight, overflow: 'hidden' }]}>
      <View style={{ height: trackInset }} />
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.coverPress,
          {
            width: coverSize,
            height: coverSize,
          },
          pressed && styles.coverPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${item.artists} ${item.title}`}>
        <View style={[styles.coverFrame, { width: coverSize, height: coverSize }]}>
          <View style={[styles.coverShadow, { width: coverSize, height: coverSize }]}>
            <NrmChartTrackArt
              imageUrl={item.imageUrl}
              size={coverSize}
              minPixelSize={coverPixelSize}
              borderRadius={nrmTokens.radius.lg}
              cacheKey={`${item.trackId}-${rank}`}
            />
          </View>
        </View>
      </Pressable>
    </View>
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
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<ChartTrackItem>>(null);
  const snapScrollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const carouselViewportWidthRef = useRef(0);
  const [carouselViewportWidth, setCarouselViewportWidth] = useState(0);
  const [index, setIndex] = useState(() => clampIndex(initialIndex, items.length));
  const indexRef = useRef(index);
  indexRef.current = index;
  /** 탐색 추적용 — 버튼/자동재생 시 즉시 갱신 (UI 상태 index와 분리) */
  const navIndexRef = useRef(index);

  const countRef = useRef(items.length);
  countRef.current = items.length;
  const loopEnabledRef = useRef(items.length > 1);
  loopEnabledRef.current = items.length > 1;

  const userDraggingRef = useRef(false);
  const autoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const repositioningRef = useRef(false);
  /** 무음 위치 교정(non-animated jump) 중에만 true — 이 구간만 onViewableItemsChanged 차단 */
  const silentJumpRef = useRef(false);
  const onIndexChangeRef = useRef(onIndexChange);
  onIndexChangeRef.current = onIndexChange;

  const { coverSize, stageWidth } = homeChartStageMetrics(width);
  const trackInset = homeChartCrownClearanceInset(coverSize);
  const slideHeight = trackInset + coverSize;
  const [rootLayout, setRootLayout] = useState({ width: 0, height: 0 });
  const glowWidth = width;
  const glowHeight = rootLayout.height > 0 ? rootLayout.height : Math.round(coverSize * 3.2);
  const glowMarginLeft = rootLayout.width > 0 ? (rootLayout.width - glowWidth) / 2 : 0;
  const albumImageBottomY = homeChartAlbumImageBottomY(coverSize, trackInset);
  const pageWidth = carouselViewportWidth > 0 ? carouselViewportWidth : coverSize;
  const coverPixelSize = Math.ceil(coverSize * PixelRatio.get());

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
  const backdropGlowTier: HomeChartBackdropGlowTier | null =
    currentRank > 0 ? (podiumTier ?? 'blue') : null;
  const rankTopLabelColor = homeChartRankTopLabelColor(currentRank, isDark);

  const syncIndex = useCallback((nextIndex: number, force = false) => {
    const c = countRef.current;
    if (c <= 0) return;
    const logical = wrapIndex(nextIndex, c);
    if (!force && logical === indexRef.current) return;
    indexRef.current = logical;
    navIndexRef.current = logical;
    setIndex(logical);
    onIndexChangeRef.current?.(logical);
  }, []);

  const scrollToOffset = useCallback(
    (physical: number, animated: boolean, onComplete?: () => void) => {
      const offset = Math.round(physical * pageWidth);
      listRef.current?.scrollToOffset({ offset, animated });
      if (snapScrollRef.current) {
        clearTimeout(snapScrollRef.current);
        snapScrollRef.current = null;
      }
      if (animated) {
        // 애니메이션이 완료될 때까지 대기 후 onComplete 호출
        // re-snap 없이 onComplete로 바로 이어지므로 불필요한 이중 scrollToOffset 방지
        snapScrollRef.current = setTimeout(() => {
          snapScrollRef.current = null;
          onComplete?.();
        }, SCROLL_SNAP_MS);
      } else {
        onComplete?.();
      }
    },
    [pageWidth],
  );

  const resnapToCurrentPage = useCallback(() => {
    const c = countRef.current;
    if (c <= 0 || pageWidth <= 0) return;
    scrollToOffset(toPhysicalIndex(navIndexRef.current, c), false);
  }, [pageWidth, scrollToOffset]);

  const scrollToLogicalIndex = useCallback(
    (logicalIndex: number, animated = true) => {
      const c = countRef.current;
      if (c <= 0) return;
      if (snapScrollRef.current) {
        clearTimeout(snapScrollRef.current);
        snapScrollRef.current = null;
      }
      const from = navIndexRef.current;
      const logical = wrapIndex(logicalIndex, c);

      navIndexRef.current = logical;
      syncIndex(logical, true);

      if (!loopEnabledRef.current || c <= 1) {
        scrollToOffset(clampIndex(logical, c), animated);
        return;
      }

      const wrapForward = animated && isLoopWrapForward(from, logical, c);
      const wrapBackward = animated && isLoopWrapBackward(from, logical, c);

      if (wrapForward) {
        repositioningRef.current = true;
        scrollToOffset(2 * c, true, () => {
          silentJumpRef.current = true;
          scrollToOffset(c, false, () => {
            silentJumpRef.current = false;
            repositioningRef.current = false;
          });
        });
        return;
      }

      if (wrapBackward) {
        repositioningRef.current = true;
        scrollToOffset(c - 1, true, () => {
          silentJumpRef.current = true;
          scrollToOffset(c + c - 1, false, () => {
            silentJumpRef.current = false;
            repositioningRef.current = false;
          });
        });
        return;
      }

      scrollToOffset(toPhysicalIndex(logical, c), animated);
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
      if (!mountedRef.current || userDraggingRef.current || silentJumpRef.current) return;
      scrollToLogicalIndex(navIndexRef.current + 1, true);
    }, AUTO_ADVANCE_MS);
  }, [clearAutoAdvance, scrollToLogicalIndex]);

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 55,
    minimumViewTime: 0,
  }).current;

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (
        repositioningRef.current ||
        silentJumpRef.current ||
        userDraggingRef.current ||
        viewableItems.length === 0
      ) {
        return;
      }
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
      if (snapScrollRef.current) {
        clearTimeout(snapScrollRef.current);
        snapScrollRef.current = null;
      }
      clearAutoAdvance();
    };
  }, [clearAutoAdvance]);

  useEffect(() => {
    if (carouselViewportWidth <= 0 || count <= 0) return;
    resnapToCurrentPage();
  }, [carouselViewportWidth, count, resnapToCurrentPage]);

  useEffect(() => {
    scheduleAutoAdvance();
    return clearAutoAdvance;
  }, [index, count, scheduleAutoAdvance, clearAutoAdvance]);

  useEffect(() => {
    if (prevFingerprintRef.current === itemsFingerprint) return;
    prevFingerprintRef.current = itemsFingerprint;
    navIndexRef.current = 0;
    syncIndex(0, true);
    requestAnimationFrame(() => {
      scrollToOffset(toPhysicalIndex(0, count), false);
    });
  }, [count, itemsFingerprint, scrollToOffset, syncIndex]);

  /** 차트 데이터가 바뀌면 커버 이미지를 백그라운드에서 prefetch */
  useEffect(() => {
    if (items.length === 0 || coverPixelSize <= 0) return;
    const timer = setTimeout(() => {
      for (const it of items) {
        const url = it.imageUrl?.trim();
        if (!url) continue;
        const displayUrl = coverArtUrlForDisplaySize(url, coverPixelSize);
        Image.prefetch(displayUrl).catch(() => {});
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [items, coverPixelSize]);

  useEffect(() => {
    if (count <= 0) return;
    const logical = wrapIndex(initialIndex, count);
    if (logical === navIndexRef.current) return;
    scrollToLogicalIndex(logical, false);
  }, [initialIndex, count, scrollToLogicalIndex]);

  const edgeGuard = menuSwipeGuardPx(insets.left);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (evt, gesture) => {
          if (count <= 1 || silentJumpRef.current) return false;
          if (evt.nativeEvent.pageX < edgeGuard) return false;
          return Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.15;
        },
        onPanResponderGrant: () => {
          userDraggingRef.current = true;
          clearAutoAdvance();
        },
        onPanResponderRelease: (_, gesture) => {
          userDraggingRef.current = false;
          const threshold = pageWidth * MANUAL_SWIPE_THRESHOLD_FRAC;
          if (gesture.dx > threshold) {
            clearAutoAdvance();
            scrollToLogicalIndex(navIndexRef.current - 1, true);
            scheduleAutoAdvance();
          } else if (gesture.dx < -threshold) {
            clearAutoAdvance();
            scrollToLogicalIndex(navIndexRef.current + 1, true);
            scheduleAutoAdvance();
          } else {
            scheduleAutoAdvance();
          }
        },
        onPanResponderTerminate: () => {
          userDraggingRef.current = false;
          scheduleAutoAdvance();
        },
      }),
    [clearAutoAdvance, count, edgeGuard, pageWidth, scheduleAutoAdvance, scrollToLogicalIndex],
  );

  const goPrev = useCallback(() => {
    if (!loopEnabled || silentJumpRef.current || repositioningRef.current || snapScrollRef.current) return;
    clearAutoAdvance();
    scrollToLogicalIndex(navIndexRef.current - 1, true);
    scheduleAutoAdvance();
  }, [clearAutoAdvance, loopEnabled, scheduleAutoAdvance, scrollToLogicalIndex]);

  const goNext = useCallback(() => {
    if (!loopEnabled || silentJumpRef.current || repositioningRef.current || snapScrollRef.current) return;
    clearAutoAdvance();
    scrollToLogicalIndex(navIndexRef.current + 1, true);
    scheduleAutoAdvance();
  }, [clearAutoAdvance, loopEnabled, scheduleAutoAdvance, scrollToLogicalIndex]);

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
        slideHeight={slideHeight}
        coverPixelSize={coverPixelSize}
        onPress={() => onTrackPress(item)}
      />
    ),
    [
      count,
      coverPixelSize,
      coverSize,
      loopEnabled,
      onTrackPress,
      pageWidth,
      slideHeight,
      trackInset,
    ],
  );

  const keyExtractor = useCallback(
    (item: ChartTrackItem, i: number) => `chart-${i}-${item.trackId}-${item.rank}`,
    [],
  );

  const onPressTrack = useCallback(() => {
    if (current) onTrackPress(current);
  }, [current, onTrackPress]);

  const initialPhysical = toPhysicalIndex(clampIndex(initialIndex, count), count);

  const rankHeroBlock = (
    <View
      style={[
        styles.rankHero,
        { width: Math.max(coverSize, 190), height: HOME_CHART_RANK_HERO_BLOCK_HEIGHT },
      ]}
      collapsable={false}
      accessibilityLabel={`탑 ${currentRank}`}>
      <Text style={[styles.rankTopLabel, { color: rankTopLabelColor }]}>TOP</Text>
      <View style={styles.rankNumberWrap}>
        {podiumTier ? <NrmHomeChartRankSparkle tier={podiumTier} /> : null}
        <NrmHomeChartRankHeroNumber rank={currentRank} isDark={isDark} />
      </View>
    </View>
  );

  const carouselBlock = (
    <View style={[styles.coverCarouselColumn, { width: coverSize, height: slideHeight }]}>
      <View style={{ height: trackInset }} pointerEvents="none" />
      <View
        style={[styles.carouselViewport, { width: coverSize, height: coverSize }]}
        collapsable={false}
        onLayout={(e) => {
          const w = Math.round(e.nativeEvent.layout.width);
          if (w <= 0 || w === carouselViewportWidthRef.current) return;
          carouselViewportWidthRef.current = w;
          setCarouselViewportWidth(w);
        }}>
        <FlatList
          ref={listRef}
          data={loopData}
          horizontal
          scrollEnabled={false}
          pagingEnabled={false}
          bounces={false}
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
          scrollEventThrottle={16}
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged}
          removeClippedSubviews={Platform.OS === 'android'}
          style={[
            styles.carouselList,
            { width: pageWidth, height: slideHeight, marginTop: -trackInset },
          ]}
          contentContainerStyle={styles.carouselListContent}
          extraData={itemsFingerprint}
        />
      </View>
      <View
        style={[styles.crownOverlay, { top: trackInset, width: coverSize, height: coverSize }]}
        collapsable={false}
        pointerEvents="none">
        <NrmHomeChartRankCrown rank={currentRank} coverSize={coverSize} />
      </View>
    </View>
  );

  const navCoverCenterOffset = trackInset + (coverSize - HOME_CHART_NAV_BTN_SIZE) / 2;

  const navCoverRow = (
    <View
      style={[
        styles.navCoverRow,
        {
          width: stageWidth,
          marginTop: HOME_CHART_RANK_TO_COVER_GAP,
        },
      ]}>
      <NrmHomeChartNavButton
        direction="prev"
        disabled={!loopEnabled}
        isDark={isDark}
        onPress={goPrev}
        style={{ marginTop: navCoverCenterOffset }}
      />
      {carouselBlock}
      <NrmHomeChartNavButton
        direction="next"
        disabled={!loopEnabled}
        isDark={isDark}
        onPress={goNext}
        style={{ marginTop: navCoverCenterOffset }}
      />
    </View>
  );

  const metaBlock = (
    <Pressable
      onPress={onPressTrack}
      style={({ pressed }) => [
        styles.metaPress,
        { width: coverSize },
        pressed && styles.metaPressed,
      ]}
      accessibilityRole="button">
      <Text style={[styles.artist, { color: muted }]} numberOfLines={2}>
        {current?.artists || '—'}
      </Text>
      <View style={styles.titleLaurelWrap}>
        <Text style={[styles.title, { color: ink }]} numberOfLines={2}>
          {current?.title || '—'}
        </Text>
      </View>
    </Pressable>
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
    <View
      style={styles.root}
      accessibilityRole="adjustable"
      onLayout={(e) => {
        const { width: w, height: h } = e.nativeEvent.layout;
        setRootLayout((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
      }}>
      {backdropGlowTier ? (
        <View
          style={[
            styles.backdropGlowSlot,
            { width: glowWidth, height: glowHeight, marginLeft: glowMarginLeft },
          ]}
          pointerEvents="none">
          <NrmHomeChartPodiumBackdropGlow
            tier={backdropGlowTier}
            isDark={isDark}
            width={glowWidth}
            height={glowHeight}
            coverCenterX={glowWidth / 2}
            coverBottomY={albumImageBottomY}
            coverSize={coverSize}
          />
        </View>
      ) : null}
      <View style={styles.content}>
        <View style={[styles.coverStage, { width: stageWidth }]}>
          <View
            style={[styles.swipeColumn, { width: coverSize }]}
            collapsable={false}
            {...panResponder.panHandlers}>
            {rankHeroBlock}
            {navCoverRow}
            {metaBlock}
          </View>
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
    paddingHorizontal: nrmTokens.space.lg,
    paddingTop: nrmTokens.space.xs,
    paddingBottom: nrmTokens.space.xl,
    overflow: 'visible',
    ...Platform.select({
      android: { overflow: 'visible' as const },
      default: {},
    }),
  },
  backdropGlowSlot: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 0,
    overflow: 'visible',
  },
  content: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: nrmTokens.space.sm,
    zIndex: 1,
    overflow: 'visible',
    ...Platform.select({
      android: { overflow: 'visible' as const },
      default: {},
    }),
  },
  loadingText: {
    marginTop: nrmTokens.space.sm,
    fontSize: nrmTokens.font.caption,
    textAlign: 'center',
  },
  page: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  rankHero: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    alignSelf: 'center',
    gap: 4,
    paddingBottom: nrmTokens.space.xs,
    overflow: 'visible',
    zIndex: 10,
    ...Platform.select({
      android: { elevation: 10, overflow: 'visible' as const },
      default: {},
    }),
  },
  rankNumberWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    width: 190,
    minHeight: 112,
    overflow: 'visible',
  },
  rankTopLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 3.2,
    textTransform: 'uppercase',
    lineHeight: 14,
  },
  coverStage: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    minHeight: 0,
    overflow: 'visible',
    ...Platform.select({
      android: { overflow: 'visible' as const },
      default: {},
    }),
  },
  coverCarouselColumn: {
    position: 'relative',
    flexShrink: 0,
    overflow: 'visible',
    ...Platform.select({
      android: { overflow: 'visible' as const },
      default: {},
    }),
  },
  crownOverlay: {
    position: 'absolute',
    left: 0,
    zIndex: 5,
    overflow: 'visible',
    ...Platform.select({
      android: { overflow: 'visible' as const, elevation: 8 },
      default: {},
    }),
  },
  navCoverRow: {
    position: 'relative',
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: HOME_CHART_NAV_OUTSIDE_GAP,
  },
  swipeColumn: {
    position: 'relative',
    alignItems: 'center',
    flexShrink: 0,
    overflow: 'visible',
    ...Platform.select({
      android: { overflow: 'visible' as const },
      default: {},
    }),
  },
  albumStageGlow: {
    position: 'absolute',
    zIndex: 0,
    overflow: 'visible',
  },
  carouselViewport: {
    overflow: 'hidden',
    flexShrink: 0,
    ...Platform.select({
      android: { clipChildren: true },
      default: {},
    }),
  },
  carouselList: {
    overflow: 'hidden',
    flexGrow: 0,
  },
  carouselListContent: {
    alignItems: 'flex-start',
  },
  coverPress: {
    alignItems: 'center',
    zIndex: 1,
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
    position: 'relative',
    zIndex: 2,
    alignItems: 'center',
    paddingHorizontal: nrmTokens.space.sm,
    paddingTop: nrmTokens.space.sm,
    paddingBottom: nrmTokens.space.sm,
    overflow: 'visible',
  },
  metaPressed: {
    opacity: 0.88,
  },
  titleLaurelWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginTop: nrmTokens.space.xxs,
  },
  artist: {
    fontSize: 18,
    fontWeight: '500',
    lineHeight: 24,
    textAlign: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 36,
    letterSpacing: -0.4,
    textAlign: 'center',
  },
});
