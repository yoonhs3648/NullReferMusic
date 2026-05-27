import { useCallback, useMemo, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';
import { clampAudioQuality } from '@/lib/nrmDownloadSettings';

const STEPS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
const TICK_W = 28;

type Props = {
  value: number;
  onChange: (quality: number) => void;
  titleColor: string;
};

/** 비트레이트 0(최고) ~ 9(최저) — 눈금 탭 + 트랙 드래그 */
export function NrmDownloadQualitySlider({ value, onChange, titleColor }: Props) {
  const q = clampAudioQuality(value);
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

  return (
    <View style={styles.wrap}>
      <View
        style={[styles.sliderColumn, trackWidth > 0 ? { width: trackWidth } : null]}
        onLayout={onLayout}>
        <View style={styles.trackArea} {...panHandlers.panHandlers}>
          <View style={styles.trackBg} />
          <View style={[styles.trackFill, { width: fillWidth }]} />
          <View style={[styles.thumb, { left: thumbLeft }]} />
        </View>

        {trackWidth > 0 ? (
          <View style={[styles.tickRow, { width: trackWidth, height: 44 }]} pointerEvents="box-none">
            {STEPS.map((n) => {
              const active = n === q;
              const edgeHint = n === 0 ? '최고' : n === 9 ? '최저' : null;
              const centerX = (n / 9) * trackWidth;
              return (
                <Pressable
                  key={n}
                  onPress={() => onChange(n)}
                  style={({ pressed }) => [
                    styles.tickCell,
                    {
                      left: centerX - TICK_W / 2,
                      width: TICK_W,
                    },
                    active && styles.tickCellActive,
                    pressed && styles.tickCellPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={
                    edgeHint ? `비트레이트 ${n} ${edgeHint}` : `비트레이트 ${n}`
                  }>
                  <Text
                    style={[
                      styles.tickLabel,
                      { color: active ? nrmTokens.color.primary : titleColor },
                      active && styles.tickLabelActive,
                    ]}>
                    {n}
                  </Text>
                  {edgeHint ? (
                    <Text
                      style={[
                        styles.edgeHint,
                        {
                          color: active
                            ? nrmTokens.color.primary
                            : 'rgba(128,128,128,0.75)',
                        },
                      ]}>
                      {edgeHint}
                    </Text>
                  ) : (
                    <View style={styles.edgeHintSpacer} />
                  )}
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: nrmTokens.space.xxs,
    paddingBottom: nrmTokens.space.xxs,
    alignItems: 'stretch',
  },
  sliderColumn: {
    alignSelf: 'stretch',
    maxWidth: '100%',
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
    marginTop: nrmTokens.space.xxs,
  },
  tickCell: {
    position: 'absolute',
    top: 0,
    alignItems: 'center',
    justifyContent: 'flex-start',
    minHeight: 44,
    borderRadius: nrmTokens.radius.sm,
    paddingTop: 2,
  },
  tickCellActive: {
    backgroundColor: 'rgba(0,102,204,0.12)',
  },
  tickCellPressed: {
    opacity: 0.75,
  },
  tickLabel: {
    fontSize: nrmTokens.font.caption,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
    lineHeight: 18,
    textAlign: 'center',
  },
  tickLabelActive: {
    fontWeight: '700',
  },
  edgeHint: {
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 14,
    marginTop: 1,
    textAlign: 'center',
  },
  edgeHintSpacer: {
    height: 15,
  },
});
