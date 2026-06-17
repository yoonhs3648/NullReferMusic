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

import { NrmChartTrackArt } from '@/components/nrm/charts/NrmChartTrackArt';
import { NrmHomeChartRankMedal } from '@/components/nrm/NrmHomeChartRankMedal';
import { nrmTokens } from '@/constants/nrmTokens';
import { homeChartItemsFingerprint } from '@/lib/nrmHomeChartClient';
import type { ChartTrackItem } from '@/lib/nrmChartsTypes';

type Props = {
  isDark: boolean;
  items: ChartTrackItem[];
  loading?: boolean;
  onTrackPress: (item: ChartTrackItem) => void;
};

export function NrmHomeChartCarousel({
  isDark,
  items,
  loading = false,
  onTrackPress,
}: Props) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  indexRef.current = index;

  const coverSize = Math.min(Math.round(width * 0.62), 300);

  const ink = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
  const muted = isDark ? 'rgba(255,255,255,0.58)' : nrmTokens.color.inkMuted48;
  const accent = isDark ? nrmTokens.color.primaryOnDark : nrmTokens.color.primary;
  const arrowBg = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)';
  const arrowBorder = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)';

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

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.2,
        onPanResponderRelease: (_, g) => {
          if (g.dx > 48) goPrev();
          else if (g.dx < -48) goNext();
        },
      }),
    [goNext, goPrev],
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

  return (
    <View style={styles.root} accessibilityRole="adjustable">
      <View style={styles.rankRow}>
        <View style={[styles.rankBadge, { borderColor: arrowBorder, backgroundColor: arrowBg }]}>
          <Text style={[styles.rankPrefix, { color: muted }]}>TOP</Text>
          <Text style={[styles.rankNumber, { color: accent }]}>{rank}</Text>
        </View>
        {count > 1 ? (
          <Text style={[styles.rankCounter, { color: muted }]}>
            {index + 1} / {count}
          </Text>
        ) : null}
      </View>

      <View style={styles.slideRow}>
        <Pressable
          onPress={goPrev}
          disabled={count <= 1}
          style={({ pressed }) => [
            styles.arrowBtn,
            { backgroundColor: arrowBg, borderColor: arrowBorder },
            count <= 1 && styles.arrowBtnHidden,
            pressed && count > 1 && styles.arrowBtnPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="이전 순위">
          <Ionicons name="chevron-back" size={22} color={ink} />
        </Pressable>

        <View style={styles.slideCenter} {...panResponder.panHandlers}>
          <Pressable
            onPress={onPressTrack}
            style={({ pressed }) => [styles.coverPress, pressed && styles.coverPressed]}
            accessibilityRole="button"
            accessibilityLabel={`${current.artists} ${current.title}`}>
            <View
              style={[
                styles.coverFrame,
                {
                  width: coverSize,
                  height: coverSize,
                },
              ]}>
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
              <NrmHomeChartRankMedal rank={rank} coverSize={coverSize} />
            </View>
          </Pressable>

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

        <Pressable
          onPress={goNext}
          disabled={count <= 1}
          style={({ pressed }) => [
            styles.arrowBtn,
            { backgroundColor: arrowBg, borderColor: arrowBorder },
            count <= 1 && styles.arrowBtnHidden,
            pressed && count > 1 && styles.arrowBtnPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="다음 순위">
          <Ionicons name="chevron-forward" size={22} color={ink} />
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
    paddingTop: nrmTokens.space.md,
    paddingBottom: nrmTokens.space.xl,
    justifyContent: 'center',
    alignItems: 'center',
    gap: nrmTokens.space.lg,
  },
  loadingText: {
    marginTop: nrmTokens.space.sm,
    fontSize: nrmTokens.font.caption,
  },
  rankRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: nrmTokens.space.md,
  },
  rankBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: nrmTokens.radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rankPrefix: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.4,
  },
  rankNumber: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  rankCounter: {
    fontSize: 13,
    fontWeight: '500',
  },
  slideRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: nrmTokens.space.sm,
  },
  slideCenter: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: nrmTokens.space.md,
  },
  arrowBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowBtnHidden: {
    opacity: 0,
  },
  arrowBtnPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.94 }],
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
    transform: [{ scale: 0.98 }],
  },
  coverShadow: {
    borderRadius: nrmTokens.radius.lg,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.22,
        shadowRadius: 18,
      },
      android: {
        elevation: 8,
      },
      default: {},
    }),
  },
  metaPress: {
    width: '100%',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: nrmTokens.space.sm,
  },
  metaPressed: {
    opacity: 0.88,
  },
  artist: {
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 22,
    textAlign: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 30,
    letterSpacing: -0.35,
    textAlign: 'center',
  },
});
