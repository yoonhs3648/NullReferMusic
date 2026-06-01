import type { ReactNode } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';

type SegmentOption<T extends string> = {
  id: T;
  label: string;
};

type Props<T extends string> = {
  options: SegmentOption<T>[];
  value: T;
  onChange: (id: T) => void;
  onReselect?: () => void;
  isDark: boolean;
  titleColor: string;
  bodyColor: string;
  accessibilityRole?: 'tab' | 'button';
  style?: StyleProp<ViewStyle>;
};

/**
 * 기간별 차트 필터용 균등 분할 세그먼트.
 * Android: TouchableOpacity — FlatList·메뉴 스와이프 레이어와의 터치 경합 완화.
 */
export function NrmChartSegmentedRow<T extends string>({
  options,
  value,
  onChange,
  onReselect,
  isDark,
  titleColor,
  bodyColor,
  accessibilityRole = 'button',
  style,
}: Props<T>) {
  const trackBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';
  const activeBg = isDark
    ? 'rgba(0, 102, 204, 0.28)'
    : 'rgba(0, 102, 204, 0.12)';
  const border = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;

  const handlePress = (id: T) => {
    if (id === value) {
      onReselect?.();
      return;
    }
    onChange(id);
  };

  return (
    <View
      style={[styles.track, { backgroundColor: trackBg, borderColor: border }, style]}
      collapsable={false}
      pointerEvents="auto">
      {options.map((opt, index) => {
        const selected = opt.id === value;
        const segmentStyle: StyleProp<ViewStyle> = [
          styles.segment,
          index > 0 && styles.segmentDivider,
          { borderColor: border },
          selected && { backgroundColor: activeBg },
        ];
        const label = (
          <Text
            style={[
              styles.label,
              {
                color: selected ? titleColor : bodyColor,
                fontWeight: selected ? '600' : '500',
              },
            ]}
            numberOfLines={1}>
            {opt.label}
          </Text>
        );

        if (Platform.OS === 'android') {
          return (
            <TouchableOpacity
              key={opt.id}
              onPress={() => handlePress(opt.id)}
              activeOpacity={0.85}
              style={segmentStyle}
              accessibilityRole={accessibilityRole}
              accessibilityState={{ selected }}>
              {label}
            </TouchableOpacity>
          );
        }

        return (
          <Pressable
            key={opt.id}
            onPress={() => handlePress(opt.id)}
            style={({ pressed }) => [
              segmentStyle,
              pressed && !selected && styles.pressed,
            ]}
            accessibilityRole={accessibilityRole}
            accessibilityState={{ selected }}>
            {label}
          </Pressable>
        );
      })}
    </View>
  );
}

/** 세그먼트 행 + 하위 컨트롤(날짜 드롭다운 등) */
export function NrmChartFilterSection({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.section, style]} collapsable={false} pointerEvents="auto">
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: nrmTokens.space.sm,
  },
  track: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: nrmTokens.radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    minHeight: 40,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: nrmTokens.space.sm,
    paddingVertical: nrmTokens.space.sm,
    minHeight: 40,
  },
  segmentDivider: {
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  pressed: {
    opacity: 0.9,
  },
  label: {
    fontSize: nrmTokens.font.caption,
    textAlign: 'center',
  },
});
