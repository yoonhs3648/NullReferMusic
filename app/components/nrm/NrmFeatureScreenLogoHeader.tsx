import { StyleSheet, View } from 'react-native';

import { NrmLogo } from '@/components/nrm/NrmLogo';
import { nrmTokens } from '@/constants/nrmTokens';

type Props = {
  isDark: boolean;
  onPressHome?: () => void;
};

/**
 * 전체 화면 기능(실시간·기간별·장르별 차트, 검색 등) 상단 로고.
 * compact 크기·중앙 정렬 — docs/APP-NAVIGATION-RULES.md §5
 */
export function NrmFeatureScreenLogoHeader({ isDark, onPressHome }: Props) {
  return (
    <View style={styles.headerRow}>
      <NrmLogo compact tone={isDark ? 'dark' : 'light'} onPress={onPressHome} />
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    alignItems: 'center',
    marginBottom: nrmTokens.space.md,
    marginTop: nrmTokens.space.sm,
  },
});
