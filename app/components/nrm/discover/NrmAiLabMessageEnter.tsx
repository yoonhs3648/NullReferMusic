import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** 답변이 사용자 메시지보다 한 박자 늦게 뜰 때 */
  delayMs?: number;
};

/** 채팅 말풍선 등장 — 아래에서 살짝 통통 튀며 올라옴. */
export function NrmAiLabMessageEnter({ children, style, delayMs = 0 }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(14)).current;
  const scale = useRef(new Animated.Value(0.94)).current;

  useEffect(() => {
    const snapVisible = () => {
      opacity.setValue(1);
      translateY.setValue(0);
      scale.setValue(1);
    };
    const anim = Animated.sequence([
      Animated.delay(delayMs),
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          friction: 6,
          tension: 120,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          friction: 5,
          tension: 140,
          useNativeDriver: true,
        }),
      ]),
    ]);
    anim.start(({ finished }) => {
      // 탭 이탈·언마운트로 애니메이션이 끊기면 opacity 0에 고착될 수 있음
      if (!finished) snapVisible();
    });
    return () => {
      anim.stop();
      snapVisible();
    };
  }, [delayMs, opacity, scale, translateY]);

  return (
    <Animated.View
      style={[
        styles.wrap,
        style,
        {
          opacity,
          transform: [{ translateY }, { scale }],
        },
      ]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
});
