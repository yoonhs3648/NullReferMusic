import Ionicons from '@expo/vector-icons/Ionicons';
import { Platform, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';

export const HOME_CHART_NAV_BTN_SIZE = 38;
export const HOME_CHART_NAV_CHEVRON_SIZE = 18;

type Props = {
  direction: 'prev' | 'next';
  disabled?: boolean;
  isDark: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

const NAV_THEME = {
  dark: {
    bg: 'rgba(14, 14, 16, 0.46)',
    bgPressed: 'rgba(14, 14, 16, 0.62)',
    ring: 'rgba(255, 255, 255, 0.14)',
    chevron: nrmTokens.color.primaryOnDark,
    shadowOpacity: 0.28,
  },
  light: {
    bg: '#ffffff',
    bgPressed: '#f0f0f0',
    ring: 'rgba(0, 0, 0, 0.08)',
    chevron: nrmTokens.color.primary,
    shadowOpacity: 0.1,
  },
} as const;

/** 홈 차트 캐러셀 좌·우 스와이프 버튼 (MainPage 목업) */
export function NrmHomeChartNavButton({ direction, disabled = false, isDark, onPress, style }: Props) {
  const theme = isDark ? NAV_THEME.dark : NAV_THEME.light;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: pressed ? theme.bgPressed : theme.bg,
          borderColor: theme.ring,
          opacity: disabled ? 0 : 1,
          ...Platform.select({
            ios: { shadowOpacity: theme.shadowOpacity },
            default: {},
          }),
        },
        style,
        disabled && styles.hidden,
      ]}
      accessibilityRole="button"
      accessibilityLabel={direction === 'prev' ? '이전 순위' : '다음 순위'}
      accessibilityState={{ disabled }}>
      <Ionicons
        name={direction === 'prev' ? 'chevron-back' : 'chevron-forward'}
        size={HOME_CHART_NAV_CHEVRON_SIZE}
        color={theme.chevron}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: HOME_CHART_NAV_BTN_SIZE,
    height: HOME_CHART_NAV_BTN_SIZE,
    borderRadius: HOME_CHART_NAV_BTN_SIZE / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.28,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
      default: {},
    }),
  },
  hidden: {
    opacity: 0,
    pointerEvents: 'none',
  },
});
