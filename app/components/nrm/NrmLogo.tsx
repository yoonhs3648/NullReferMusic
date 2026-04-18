import { Platform, StyleSheet, Text, View } from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';

type Props = {
  isDark: boolean;
};

export function NrmLogo({ isDark }: Props) {
  return (
    <View style={styles.wrap} accessibilityRole="header">
      <Text style={styles.wordmark}>
        <Text style={styles.wordNull}>NullRefer</Text>
        <Text style={styles.wordMusic}>Music</Text>
      </Text>
      <Text
        style={[
          styles.tagline,
          { color: isDark ? nrmTokens.color.textMuted : '#6b4a52' },
        ]}>
        로컬에서 · YouTube → 오디오
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    marginBottom: nrmTokens.space.xl,
  },
  wordmark: {
    fontSize: nrmTokens.font.logo,
    fontWeight: '800',
    letterSpacing: Platform.OS === 'ios' ? -0.5 : 0,
  },
  /** 메인 테마: LFC 구 실드 빨강 — 라이트/다크 모두 대비 확보 */
  wordNull: {
    color: nrmTokens.color.accent,
  },
  /** 보조 테마: 클럽 그린 */
  wordMusic: {
    color: nrmTokens.color.accent2,
  },
  tagline: {
    marginTop: nrmTokens.space.sm,
    fontSize: nrmTokens.font.small,
    fontWeight: '500',
  },
});
