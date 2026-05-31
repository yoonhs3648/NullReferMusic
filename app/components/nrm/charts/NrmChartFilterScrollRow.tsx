import type { ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';

type Props = {
  children: ReactNode;
};

/** FlatList 헤더 안 가로 탭 — Android nested scroll·터치 경합 방지 */
export function NrmChartFilterScrollRow({ children }: Props) {
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
  tabRow: {
    gap: nrmTokens.space.xs,
    paddingBottom: nrmTokens.space.xs,
  },
});
