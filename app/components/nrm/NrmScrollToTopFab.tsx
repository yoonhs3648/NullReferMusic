import Ionicons from '@expo/vector-icons/Ionicons';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';

type Props = {
  visible: boolean;
  onPress: () => void;
  isDark: boolean;
  /** 메뉴 FAB·Safe area 위 여백 */
  bottomOffset?: number;
};

/** 스크롤 일정 이상 내렸을 때 우측 하단에 표시하는 맨 위로 버튼 */
export function NrmScrollToTopFab({
  visible,
  onPress,
  isDark,
  bottomOffset = nrmTokens.space.xl,
}: Props) {
  if (!visible) return null;

  const bg = isDark ? nrmTokens.color.surfaceTile2 : nrmTokens.color.canvas;
  const border = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const iconColor = isDark ? nrmTokens.color.primaryOnDark : nrmTokens.color.primary;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: bottomOffset }]}
      accessibilityElementsHidden={false}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="맨 위로"
        style={({ pressed }) => [
          styles.btn,
          {
            backgroundColor: bg,
            borderColor: border,
            ...Platform.select({
              ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: isDark ? 0.35 : 0.12,
                shadowRadius: 6,
              },
              android: { elevation: 4 },
              default: {},
            }),
          },
          pressed && styles.btnPressed,
        ]}>
        <Ionicons name="chevron-up" size={22} color={iconColor} />
      </Pressable>
    </View>
  );
}

const BTN = 44;

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: nrmTokens.space.lg,
    zIndex: 20,
  },
  btn: {
    width: BTN,
    height: BTN,
    borderRadius: BTN / 2,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.96 }],
  },
});
