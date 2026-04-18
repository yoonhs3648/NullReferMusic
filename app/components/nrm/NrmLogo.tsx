import { Platform, StyleSheet, Text, View } from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';

export function NrmLogo() {
  return (
    <View style={styles.wrap} accessibilityRole="header">
      <Text style={styles.wordmark}>
        <Text style={styles.wordNull}>NullRefer</Text>
        <Text style={styles.wordMusic}>Music</Text>
      </Text>
      <Text style={styles.tagline}>로컬에서 · YouTube → 오디오</Text>
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
  wordNull: {
    color: nrmTokens.color.text,
  },
  wordMusic: {
    color: nrmTokens.color.accent,
  },
  tagline: {
    marginTop: nrmTokens.space.sm,
    fontSize: nrmTokens.font.small,
    color: nrmTokens.color.textMuted,
    fontWeight: '500',
  },
});
