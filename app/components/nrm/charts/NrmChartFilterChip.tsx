import type { ReactNode } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

type Props = {
  selected: boolean;
  onPress: () => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'tab';
};

/** Android APK: Pressable+FlatList 조합보다 TouchableOpacity가 탭 인식이 안정적 */
export function NrmChartFilterChip({
  selected,
  onPress,
  children,
  style,
  accessibilityLabel,
  accessibilityRole = 'button',
}: Props) {
  if (Platform.OS === 'android') {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.85}
        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
        style={style}
        accessibilityRole={accessibilityRole}
        accessibilityState={{ selected }}
        accessibilityLabel={accessibilityLabel}>
        {children}
      </TouchableOpacity>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [style, pressed && styles.pressed]}
      accessibilityRole={accessibilityRole}
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.9 },
});
