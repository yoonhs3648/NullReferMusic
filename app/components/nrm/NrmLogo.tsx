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
  const lineHeight = Math.round(fontSize * 1.15);
  const androidTextPad =
    Platform.OS === 'android' ? ({ includeFontPadding: false } as const) : {};

  const content = (
    <View style={styles.wrap} accessibilityRole="header">
      <View
        style={[styles.markSlot, { width: markSize, height: markSize }]}>
        <Image
          source={require('@/assets/images/icon.png')}
          style={[styles.markImage, { width: markSize, height: markSize }]}
          resizeMode="contain"
        />
      </View>
      <Text
        style={[
          styles.wordmark,
          { fontSize, lineHeight },
          androidTextPad,
        ]}>
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
    justifyContent: 'center',
    gap: nrmTokens.space.xxs,
  },
  markSlot: {
    alignItems: 'center',
    justifyContent: 'center',
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
