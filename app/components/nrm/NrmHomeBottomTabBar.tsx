import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { nrmTokens } from '@/constants/nrmTokens';

export type NrmHomeTab = 'library' | 'search' | 'home' | 'favorite' | 'history';

type TabSpec = {
  id: NrmHomeTab;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const TABS: TabSpec[] = [
  { id: 'library', label: 'Storage', icon: 'albums-outline' },
  { id: 'search', label: 'Search', icon: 'search-outline' },
  { id: 'home', label: 'Home', icon: 'home-outline' },
  { id: 'favorite', label: 'Favorite', icon: 'heart-outline' },
  { id: 'history', label: 'History', icon: 'time-outline' },
];

const TAB_INACTIVE_DARK = 'rgba(255,255,255,0.55)';
const TAB_INACTIVE_LIGHT = 'rgba(29,29,31,0.45)';

type Props = {
  isDark: boolean;
  active: NrmHomeTab;
  onChange: (tab: NrmHomeTab) => void;
  /** 미지정 시 다크/라이트 기본 surface */
  backgroundColor?: string;
};

/** 메인 홈 하단 탭 — Storage · Search · Home · Favorite · History */
export function NrmHomeBottomTabBar({ isDark, active, onChange, backgroundColor }: Props) {
  const insets = useSafeAreaInsets();
  const inactive = isDark ? TAB_INACTIVE_DARK : TAB_INACTIVE_LIGHT;
  const activeColor = isDark ? nrmTokens.color.primaryOnDark : nrmTokens.color.primary;

  return (
    <View
      style={[
        styles.wrap,
        {
          paddingBottom: Math.max(insets.bottom, nrmTokens.space.xs),
          borderTopColor: isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline,
          backgroundColor:
            backgroundColor ?? (isDark ? nrmTokens.color.surfaceTile1 : nrmTokens.color.canvas),
        },
      ]}>
      {TABS.map((tab) => {
        const selected = tab.id === active;
        const color = selected ? activeColor : inactive;
        return (
          <Pressable
            key={tab.id}
            onPress={() => onChange(tab.id)}
            style={({ pressed }) => [styles.tab, pressed && styles.tabPressed]}
            accessibilityRole="tab"
            accessibilityState={{ selected }}>
            <Ionicons name={tab.icon} size={22} color={color} />
            <Text style={[styles.label, { color }]} numberOfLines={1}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: nrmTokens.space.xs,
    paddingHorizontal: nrmTokens.space.xxs,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    gap: 3,
    paddingHorizontal: 2,
  },
  tabPressed: {
    opacity: 0.82,
  },
  label: {
    fontSize: nrmTokens.font.microLegal,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
