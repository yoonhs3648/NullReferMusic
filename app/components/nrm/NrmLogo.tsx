import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';

type Props = {
  compact?: boolean;
  tone?: 'light' | 'dark';
  onPress?: () => void;
};

export function NrmLogo({ compact = false, tone = 'light', onPress }: Props) {
  const fontSize = compact ? 20 : nrmTokens.font.logo;
  const nullColor = tone === 'dark' ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
  const musicColor =
    tone === 'dark' ? nrmTokens.color.primaryOnDark : nrmTokens.color.primary;
  const markSize = compact ? 26 : 34;

  const content = (
    <View style={styles.wrap} accessibilityRole="header">
      <Image
        source={require('@/assets/images/icon.png')}
        style={[styles.markImage, { width: markSize, height: markSize }]}
        resizeMode="contain"
      />
      <Text style={[styles.wordmark, { fontSize }]}>
        <Text style={[styles.wordNull, { color: nullColor }]}>Nullreference </Text>
        <Text style={[styles.wordMusic, { color: musicColor }]}>Music</Text>
      </Text>
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="메인 홈으로 이동"
      style={({ pressed }) => [pressed && styles.pressed]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.sm,
  },
  markImage: {
    borderRadius: nrmTokens.radius.sm,
  },
  wordmark: {
    fontWeight: '600',
    letterSpacing: Platform.OS === 'ios' ? -0.37 : -0.2,
  },
  pressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  wordNull: {},
  wordMusic: {},
});
