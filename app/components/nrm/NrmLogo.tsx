import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';

type Props = {
  compact?: boolean;
  tone?: 'light' | 'dark';
  /** 차트 API 실패 등 — 흐리게·비활성 느낌 */
  disabled?: boolean;
  /** 워드마크 없이 CI 마크만 표시 (차트 에러 히어로 등) */
  markOnly?: boolean;
  /** markOnly일 때 마크 한 변 길이(px) */
  markSize?: number;
  onPress?: () => void;
};

export function NrmLogo({
  compact = false,
  tone = 'light',
  disabled = false,
  markOnly = false,
  markSize: markSizeProp,
  onPress,
}: Props) {
  const fontSize = compact ? 20 : nrmTokens.font.logo;
  const nullColor = disabled
    ? 'rgba(128,128,128,0.45)'
    : tone === 'dark'
      ? nrmTokens.color.bodyOnDark
      : nrmTokens.color.ink;
  const musicColor = disabled
    ? 'rgba(128,128,128,0.35)'
    : tone === 'dark'
      ? nrmTokens.color.primaryOnDark
      : nrmTokens.color.primary;
  const markSize = markSizeProp ?? (markOnly ? 72 : compact ? 26 : 34);
  const lineHeight = Math.round(fontSize * 1.15);
  const androidTextPad =
    Platform.OS === 'android' ? ({ includeFontPadding: false } as const) : {};

  const mark = (
    <View style={[styles.markSlot, { width: markSize, height: markSize }]}>
      <Image
        source={require('@/assets/images/icon.png')}
        style={[
          styles.markImage,
          { width: markSize, height: markSize },
          disabled && styles.markDisabled,
        ]}
        resizeMode="contain"
      />
    </View>
  );

  const content = markOnly ? (
    <View style={styles.markOnlyWrap} accessibilityRole="image">
      {mark}
    </View>
  ) : (
    <View style={styles.wrap} accessibilityRole="header">
      {mark}
      <Text
        style={[
          styles.wordmark,
          { fontSize, lineHeight },
          androidTextPad,
        ]}>
        <Text style={[styles.wordNull, { color: nullColor }]}>NullReference </Text>
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
  markOnlyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  markDisabled: {
    opacity: 0.35,
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
