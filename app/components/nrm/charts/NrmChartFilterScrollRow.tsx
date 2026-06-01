import type { ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';

type Props = {
  children: ReactNode;
};

/**
 * 차트 필터 가로 탭.
 * Android/iOS: ScrollView 중첩 시 FlatList·Pressable 터치 경합 → 고정 행 View.
 * Web: 탭이 많을 수 있어 가로 스크롤 유지.
 */
export function NrmChartFilterScrollRow({ children }: Props) {
  if (Platform.OS !== 'web') {
    return (
      <View style={styles.nativeTabRow} collapsable={false} pointerEvents="box-none">
        {children}
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      nestedScrollEnabled
      keyboardShouldPersistTaps="always"
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.tabRow}
      style={styles.tabScroll}
      collapsable={false}>
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  tabScroll: { marginBottom: nrmTokens.space.sm, flexGrow: 0 },
  nativeTabRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: nrmTokens.space.xs,
    marginBottom: nrmTokens.space.sm,
    paddingBottom: nrmTokens.space.xs,
  },
  tabRow: {
    gap: nrmTokens.space.xs,
    paddingBottom: nrmTokens.space.xs,
  },
});
