import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NrmHamburgerIcon } from '@/components/nrm/NrmHamburgerIcon';
import { NrmLogo } from '@/components/nrm/NrmLogo';
import { nrmTokens } from '@/constants/nrmTokens';
import { useNrmMainLogoDisplayName } from '@/lib/nrmMainLogoDisplayNameSettings';
import type { HomeChartPodiumTier } from '@/components/nrm/NrmHomeChartRankCrown';

type Props = {
  isDark: boolean;
  onMenuPress: () => void;
  onNotificationPress: () => void;
  onLogoPress?: () => void;
  podiumTier?: HomeChartPodiumTier | null;
  menuHidden?: boolean;
  unreadAlarmCount?: number;
};

const ICON_HIT = 44;

/** 상단 메뉴 · 로고 · 알림 */
export function NrmAppTopBar({
  isDark,
  onMenuPress,
  onNotificationPress,
  onLogoPress,
  podiumTier = null,
  menuHidden = false,
  unreadAlarmCount = 0,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const mainLogoDisplayName = useNrmMainLogoDisplayName();
  const iconColor = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
  const padH = Math.max(nrmTokens.space.md, Math.round(width * 0.04));

  return (
    <View
      style={[
        styles.wrap,
        {
          paddingTop: insets.top + nrmTokens.space.xs,
          paddingHorizontal: padH,
        },
      ]}>
      {menuHidden ? (
        <View style={styles.sideSlot} />
      ) : (
        <Pressable
          onPress={onMenuPress}
          hitSlop={8}
          style={({ pressed }) => [styles.sideSlot, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="메뉴">
          <NrmHamburgerIcon color={iconColor} size={22} />
        </Pressable>
      )}

      <View style={styles.logoSlot} pointerEvents="box-none">
        <NrmLogo
          layout="stacked"
          tone={isDark ? 'dark' : 'light'}
          podiumTier={podiumTier}
          displayName={mainLogoDisplayName}
          onPress={onLogoPress}
        />
      </View>

      <Pressable
        onPress={onNotificationPress}
        hitSlop={8}
        style={({ pressed }) => [styles.sideSlot, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={
          unreadAlarmCount > 0 ? `알림, 읽지 않음 ${unreadAlarmCount}건` : '알림'
        }>
        <View style={styles.bellWrap}>
          <Ionicons name="notifications-outline" size={24} color={iconColor} />
          {unreadAlarmCount > 0 ? (
            <View
              style={[
                styles.badge,
                { borderColor: isDark ? nrmTokens.color.surfaceTile1 : '#ffffff' },
              ]}>
              <Text style={styles.badgeText}>
                {unreadAlarmCount > 99 ? '99+' : String(unreadAlarmCount)}
              </Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 60,
  },
  sideSlot: {
    width: ICON_HIT,
    height: ICON_HIT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: ICON_HIT,
    paddingHorizontal: nrmTokens.space.xs,
  },
  pressed: {
    opacity: 0.72,
  },
  bellWrap: {
    width: ICON_HIT,
    height: ICON_HIT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: '#e53935',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
  },
});
