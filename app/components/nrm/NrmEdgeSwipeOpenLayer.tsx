import { useMemo, useRef } from 'react';
import { PanResponder, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const EDGE_HIT_WIDTH = 32;
const MOBILE_SWIPE_EDGE_WIDTH = 24;
const EDGE_SWIPE_OPEN_PX = 44;
const IS_NATIVE_MOBILE = Platform.OS === 'ios' || Platform.OS === 'android';

export type NrmEdgeSwipeOpenLayerProps = {
  /** false면 레이어 미마운트 (다른 화면 스와이프와 충돌 방지) */
  enabled: boolean;
  onOpen: () => void;
  /** 화면 왼쪽 기준 — 이 폭만큼은 스와이프 캡처에서 제외(좁은 strip만 사용) */
  leftEdgeSwipeReserve?: number;
};

/**
 * 좌측 가장자리 → 오른쪽 스와이프로 메뉴/드로어 열기.
 * 앱 메뉴·AI Lab 등이 동일 모듈을 쓰되, enabled 로 한 화면만 활성.
 */
export function NrmEdgeSwipeOpenLayer({
  enabled,
  onOpen,
  leftEdgeSwipeReserve,
}: NrmEdgeSwipeOpenLayerProps) {
  const insets = useSafeAreaInsets();
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  const edgePanHandlers = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) =>
        gesture.dx > 6 && Math.abs(gesture.dy) < Math.abs(gesture.dx) * 1.8,
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx >= EDGE_SWIPE_OPEN_PX) onOpenRef.current();
      },
    }),
  ).current;

  const mobileEdgePanHandlers = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gesture) =>
          gesture.dx > 8 && Math.abs(gesture.dy) < Math.abs(gesture.dx) * 1.5,
        onPanResponderTerminationRequest: () => true,
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx >= EDGE_SWIPE_OPEN_PX) onOpenRef.current();
        },
      }),
    [],
  );

  if (!enabled) return null;

  const mobileSwipeEdgeWidth = MOBILE_SWIPE_EDGE_WIDTH + insets.left;
  const mobileEdgeStripWidth = 16;
  const useNarrowStrip = leftEdgeSwipeReserve != null && leftEdgeSwipeReserve > 0;

  if (IS_NATIVE_MOBILE) {
    return (
      <View
        style={styles.mobileSwipeLayer}
        pointerEvents="box-none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        <View
          style={[
            styles.mobileSwipeEdge,
            { left: 0, width: useNarrowStrip ? mobileEdgeStripWidth : mobileSwipeEdgeWidth },
          ]}
          collapsable={false}
          pointerEvents="auto"
          {...mobileEdgePanHandlers.panHandlers}
        />
      </View>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <View
        style={[
          styles.edgeZone,
          {
            width: EDGE_HIT_WIDTH + insets.left,
            paddingLeft: insets.left,
          },
        ]}
        pointerEvents="box-none"
        {...edgePanHandlers.panHandlers}
      />
    );
  }

  return null;
}

const styles = StyleSheet.create({
  mobileSwipeLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 51,
    ...Platform.select({
      android: { elevation: 51 },
      default: {},
    }),
  },
  mobileSwipeEdge: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  edgeZone: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    zIndex: 50,
  },
});
