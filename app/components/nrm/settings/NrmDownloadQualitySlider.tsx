import { useCallback, useMemo, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  PanResponder,
  PixelRatio,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';
import {
  audioQualityBitrateKbps,
  clampAudioQuality,
} from '@/lib/nrmDownloadSettings';

const STEPS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

type Props = {
  value: number;
  onChange: (quality: number) => void;
  titleColor: string;
};

/** 접근성 글자 크기 반영(과도 확대는 상한). */
function layoutScale(): number {
  return Math.min(Math.max(PixelRatio.getFontScale(), 1), 1.45);
}

/** 비트레이트 0(최고) ~ 9(최저) — 눈금 탭 + 트랙 드래그 */
export function NrmDownloadQualitySlider({ value, onChange, titleColor }: Props) {
  const q = clampAudioQuality(value);
  const scale = layoutScale();
  const tickW = Math.ceil(28 * scale);
  const tickRowH = Math.ceil(28 * scale);
  const edgeHintFs = Math.max(10, Math.round(10 * scale));
  const edgeHintLh = Math.ceil(edgeHintFs * 1.35);

  const [trackWidth, setTrackWidth] = useState(0);
  const trackWidthRef = useRef(0);
  const grantXRef = useRef(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const valueFromX = useCallback((x: number) => {
    const w = trackWidthRef.current;
    if (w <= 0) return 0;
    const ratio = Math.min(1, Math.max(0, x / w));
    return clampAudioQuality(Math.round(ratio * 9));
  }, []);

  const panHandlers = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (evt) => {
          grantXRef.current = evt.nativeEvent.locationX;
          onChangeRef.current(valueFromX(grantXRef.current));
        },
        onPanResponderMove: (_evt, gestureState) => {
          const w = trackWidthRef.current;
          if (w <= 0) return;
          const x = Math.min(w, Math.max(0, grantXRef.current + gestureState.dx));
          onChangeRef.current(valueFromX(x));
        },
      }),
    [valueFromX],
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    trackWidthRef.current = w;
    setTrackWidth(w);
  };

  const fillWidth = trackWidth > 0 ? (q / 9) * trackWidth : 0;
  const thumbLeft = trackWidth > 0 ? (q / 9) * trackWidth - 11 : 0;
  const kbps = audioQualityBitrateKbps(q);

  /** 눈금이 트랙 밖으로 나가 잘리지 않도록 left를 [0, trackW-cellW]로 클램프 */
  const tickLeft = (n: number, cellW: number) => {
    if (trackWidth <= 0) return 0;
    const centerX = (n / 9) * trackWidth;
    return Math.max(0, Math.min(trackWidth - cellW, centerX - cellW / 2));
  };

  return (
    <View style={styles.wrap}>
      <Text style={[styles.kbpsHint, { color: titleColor }]}>
        CBR 모드 기준 mp3 · m4a {kbps} kbps
      </Text>
      <View style={styles.sliderColumn} onLayout={onLayout}>
        <View style={styles.trackArea} {...panHandlers.panHandlers}>
          <View style={styles.trackBg} />
          <View style={[styles.trackFill, { width: fillWidth }]} />
          <View style={[styles.thumb, { left: thumbLeft }]} />
        </View>

        {trackWidth > 0 ? (
          <>
            <View
              style={[styles.tickRow, { height: tickRowH }]}
              pointerEvents="box-none">
              {STEPS.map((n) => {
                const active = n === q;
                return (
                  <Pressable
                    key={n}
                    onPress={() => onChange(n)}
                    style={({ pressed }) => [
                      styles.tickCell,
                      {
                        left: tickLeft(n, tickW),
                        width: tickW,
                        height: tickRowH,
                      },
                      active && styles.tickCellActive,
                      pressed && styles.tickCellPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={
                      n === 0
                        ? '비트레이트 0 최고'
                        : n === 9
                          ? '비트레이트 9 최저'
                          : `비트레이트 ${n}`
                    }>
                    <Text
                      style={[
                        styles.tickLabel,
                        {
                          color: active ? nrmTokens.color.primary : titleColor,
                          fontSize: Math.round(nrmTokens.font.caption * Math.min(scale, 1.2)),
                          lineHeight: Math.ceil(18 * Math.min(scale, 1.2)),
                        },
                        active && styles.tickLabelActive,
                      ]}>
                      {n}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* 최고/최저는 좁은 눈금 셀 밖 — 전체 폭 space-between으로 잘림 방지 */}
            <View
              style={[styles.edgeHintRow, { minHeight: edgeHintLh + 4 }]}
              pointerEvents="none">
              <Text
                style={[
                  styles.edgeHint,
                  {
                    fontSize: edgeHintFs,
                    lineHeight: edgeHintLh,
                    color:
                      q === 0 ? nrmTokens.color.primary : 'rgba(128,128,128,0.75)',
                    fontWeight: q === 0 ? '700' : '600',
                  },
                ]}
                numberOfLines={1}>
                최고
              </Text>
              <Text
                style={[
                  styles.edgeHint,
                  {
                    fontSize: edgeHintFs,
                    lineHeight: edgeHintLh,
                    color:
                      q === 9 ? nrmTokens.color.primary : 'rgba(128,128,128,0.75)',
                    fontWeight: q === 9 ? '700' : '600',
                    textAlign: 'right',
                  },
                ]}
                numberOfLines={1}>
                최저
              </Text>
            </View>
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: nrmTokens.space.xxs,
    paddingBottom: nrmTokens.space.sm,
    alignItems: 'stretch',
    overflow: 'visible',
  },
  kbpsHint: {
    fontSize: nrmTokens.font.caption,
    fontWeight: '600',
    marginBottom: nrmTokens.space.xs,
    opacity: 0.88,
  },
  sliderColumn: {
    alignSelf: 'stretch',
    width: '100%',
    maxWidth: '100%',
    overflow: 'visible',
  },
  trackArea: {
    height: 40,
    justifyContent: 'center',
  },
  trackBg: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(128,128,128,0.28)',
    width: '100%',
  },
  trackFill: {
    position: 'absolute',
    left: 0,
    height: 8,
    borderRadius: 4,
    backgroundColor: nrmTokens.color.primary,
  },
  thumb: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: nrmTokens.color.primary,
    top: 9,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  tickRow: {
    position: 'relative',
    width: '100%',
    marginTop: nrmTokens.space.xxs,
    overflow: 'visible',
  },
  tickCell: {
    position: 'absolute',
    top: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: nrmTokens.radius.sm,
  },
  tickCellActive: {
    backgroundColor: 'rgba(0,102,204,0.12)',
  },
  tickCellPressed: {
    opacity: 0.75,
  },
  tickLabel: {
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  tickLabelActive: {
    fontWeight: '700',
  },
  edgeHintRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 2,
    paddingHorizontal: 0,
  },
  edgeHint: {
    flexShrink: 0,
    includeFontPadding: false,
  },
});
