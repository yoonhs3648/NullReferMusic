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

/** 리스트 열과 나란히 배치할 인덱스 바 너비 */
export const TRACK_LIST_INDEX_BAR_WIDTH = 26;

type Props = {
  onSelect: (label: TrackListIndexLabel, animated?: boolean) => void;
  mutedColor: string;
  isDark?: boolean;
};

export function NrmTrackListSectionIndex({ onSelect, mutedColor, isDark = true }: Props) {
  const labels = TRACK_LIST_INDEX_LABELS;
  const heightRef = useRef(1);
  const lastLabelRef = useRef<TrackListIndexLabel | null>(null);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hintLabel, setHintLabel] = useState<TrackListIndexLabel | null>(null);

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

  const pickLabel = useCallback(
    (locationY: number): TrackListIndexLabel => {
      const h = heightRef.current;
      const ratio = Math.min(1, Math.max(0, locationY / h));
      const idx = Math.min(labels.length - 1, Math.floor(ratio * labels.length));
      return labels[idx]!;
    },
    [labels],
  );

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
          emitSelect(pickLabel(evt.nativeEvent.locationY), false);
        },
        onPanResponderMove: (evt) => {
          emitSelect(pickLabel(evt.nativeEvent.locationY), false);
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
    [emitSelect, hideHintSoon, pickLabel],
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
        style={styles.wrap}
        onLayout={(e) => {
          heightRef.current = Math.max(1, e.nativeEvent.layout.height);
        }}
        accessibilityRole="adjustable"
        accessibilityLabel="목록 인덱스"
        {...panResponder.panHandlers}>
        <View style={[styles.inner, isDark ? styles.innerDark : styles.innerLight]}>
          {labels.map((label) => (
            <Pressable
              key={label}
              onPress={() => onTapLabel(label)}
              style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
              hitSlop={1}
              accessibilityRole="button"
              accessibilityLabel={`${label} 섹션`}>
              <Text style={[styles.label, { color: mutedColor }]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: TRACK_LIST_INDEX_BAR_WIDTH,
    alignSelf: 'stretch',
    justifyContent: 'center',
    paddingVertical: nrmTokens.space.xs,
    marginLeft: nrmTokens.space.xxs,
  },
  inner: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: nrmTokens.radius.pill,
    paddingVertical: 3,
  },
  innerDark: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  innerLight: {
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  item: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 9,
  },
  itemPressed: {
    opacity: 0.65,
  },
  label: {
    fontSize: nrmTokens.font.microLegal,
    fontWeight: '600',
    lineHeight: 11,
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
