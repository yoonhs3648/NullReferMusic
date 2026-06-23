import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';
import {
  TRACK_LIST_INDEX_LABELS,
  type TrackListIndexLabel,
} from '@/lib/nrmTrackListIndex';

/** 리스트 열 옆 시각적 인덱스 바 너비 */
export const TRACK_LIST_INDEX_BAR_WIDTH = 22;
/** 드래그 터치 영역 — 시각 바보다 넓게 */
const TRACK_LIST_INDEX_TOUCH_WIDTH = 38;

type Props = {
  onSelect: (label: TrackListIndexLabel, animated?: boolean) => void;
  mutedColor: string;
  isDark?: boolean;
};

export function NrmTrackListSectionIndex({ onSelect, mutedColor, isDark = true }: Props) {
  const labels = TRACK_LIST_INDEX_LABELS;
  const barWindowRef = useRef({ pageY: 0, height: 1 });
  const lastLabelRef = useRef<TrackListIndexLabel | null>(null);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hintLabel, setHintLabel] = useState<TrackListIndexLabel | null>(null);
  const [itemHeight, setItemHeight] = useState(10);

  const clearHintTimer = useCallback(() => {
    if (hintTimerRef.current) {
      clearTimeout(hintTimerRef.current);
      hintTimerRef.current = null;
    }
  }, []);

  const showHint = useCallback(
    (label: TrackListIndexLabel) => {
      setHintLabel(label);
      clearHintTimer();
    },
    [clearHintTimer],
  );

  const hideHintSoon = useCallback(() => {
    clearHintTimer();
    hintTimerRef.current = setTimeout(() => setHintLabel(null), 320);
  }, [clearHintTimer]);

  const pickLabelFromPageY = useCallback(
    (pageY: number): TrackListIndexLabel => {
      const { pageY: top, height } = barWindowRef.current;
      const innerPad = 6;
      const usable = Math.max(1, height - innerPad * 2);
      const localY = pageY - top - innerPad;
      const ratio = Math.min(1, Math.max(0, localY / usable));
      const idx = Math.min(labels.length - 1, Math.floor(ratio * labels.length));
      return labels[idx]!;
    },
    [labels],
  );

  const barRef = useRef<View>(null);

  const syncBarMeasure = useCallback(() => {
    barRef.current?.measureInWindow((_x, y, _w, h) => {
      barWindowRef.current = { pageY: y, height: Math.max(1, h) };
      const innerPad = 6;
      const usable = Math.max(1, h - innerPad * 2);
      setItemHeight(Math.max(7, Math.floor(usable / labels.length)));
    });
  }, [labels.length]);

  const emitSelect = useCallback(
    (label: TrackListIndexLabel, animated: boolean) => {
      if (lastLabelRef.current === label) return;
      lastLabelRef.current = label;
      showHint(label);
      onSelect(label, animated);
    },
    [onSelect, showHint],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (evt) => {
          emitSelect(pickLabelFromPageY(evt.nativeEvent.pageY), false);
        },
        onPanResponderMove: (evt) => {
          emitSelect(pickLabelFromPageY(evt.nativeEvent.pageY), false);
        },
        onPanResponderRelease: () => {
          lastLabelRef.current = null;
          hideHintSoon();
        },
        onPanResponderTerminate: () => {
          lastLabelRef.current = null;
          hideHintSoon();
        },
      }),
    [emitSelect, hideHintSoon, pickLabelFromPageY],
  );

  const onTapLabel = useCallback(
    (label: TrackListIndexLabel) => {
      lastLabelRef.current = null;
      showHint(label);
      onSelect(label, true);
      hideHintSoon();
    },
    [hideHintSoon, onSelect, showHint],
  );

  return (
    <>
      <Modal visible={hintLabel !== null} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.hintScrim} pointerEvents="none">
          <View
            style={[
              styles.hintBubble,
              isDark ? styles.hintBubbleDark : styles.hintBubbleLight,
            ]}>
            <Text style={[styles.hintText, isDark ? styles.hintTextDark : styles.hintTextLight]}>
              {hintLabel}
            </Text>
          </View>
        </View>
      </Modal>

      <View
        ref={barRef}
        style={styles.touchWrap}
        onLayout={syncBarMeasure}
        accessibilityRole="adjustable"
        accessibilityLabel="목록 인덱스"
        {...panResponder.panHandlers}>
        <View style={[styles.bar, isDark ? styles.barDark : styles.barLight]}>
          {labels.map((label) => (
            <Pressable
              key={label}
              onPress={() => onTapLabel(label)}
              style={({ pressed }) => [
                styles.item,
                { height: itemHeight },
                pressed && styles.itemPressed,
              ]}
              hitSlop={2}
              accessibilityRole="button"
              accessibilityLabel={`${label} 섹션`}>
              <Text style={[styles.label, { color: mutedColor }]} numberOfLines={1}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  touchWrap: {
    width: TRACK_LIST_INDEX_TOUCH_WIDTH,
    alignSelf: 'stretch',
    justifyContent: 'center',
    paddingVertical: nrmTokens.space.xs,
    marginLeft: 0,
  },
  bar: {
    alignSelf: 'flex-end',
    width: TRACK_LIST_INDEX_BAR_WIDTH,
    flex: 1,
    borderRadius: nrmTokens.radius.pill,
    paddingVertical: 3,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  barDark: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  barLight: {
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  item: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemPressed: {
    opacity: 0.65,
  },
  label: {
    fontSize: 9,
    fontWeight: '600',
    lineHeight: 10,
    textAlign: 'center',
  },
  hintScrim: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  hintBubble: {
    minWidth: 80,
    minHeight: 80,
    paddingHorizontal: nrmTokens.space.md,
    paddingVertical: nrmTokens.space.sm,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintBubbleDark: {
    backgroundColor: 'rgba(28, 28, 32, 0.72)',
  },
  hintBubbleLight: {
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  hintText: {
    fontSize: 40,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  hintTextDark: {
    color: '#fff',
  },
  hintTextLight: {
    color: '#fff',
  },
});
