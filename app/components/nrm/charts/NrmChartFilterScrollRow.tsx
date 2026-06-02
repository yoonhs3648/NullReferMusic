import type { ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';

type Props = {
  children: ReactNode;
};

/** 차트 필터 가로 탭 — 한 줄 인라인, 스와이프로 넘김 (FlatList 헤더 내 nestedScroll) */
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
  tabScroll: {
    marginBottom: nrmTokens.space.sm,
    flexGrow: 0,
  },
  tabRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    gap: nrmTokens.space.xs,
    paddingBottom: nrmTokens.space.xs,
  },
});
