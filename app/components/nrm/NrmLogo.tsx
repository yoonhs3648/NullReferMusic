import { Image, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import {
  HOME_CHART_PODIUM_TEXT,
  type HomeChartPodiumTier,
} from '@/components/nrm/NrmHomeChartRankCrown';
import { nrmTokens } from '@/constants/nrmTokens';
import { getNrmProductDisplayName, splitNrmLogoWordmark } from '@/lib/nrmAppBrand';

type Props = {
  compact?: boolean;
  tone?: 'light' | 'dark';
  layout?: 'inline' | 'stacked';
  /** 차트 API 실패 등 — 흐리게·비활성 느낌 */
  disabled?: boolean;
  /** TOP 1·2·3 — accent(마지막 단어) 금·은·동 */
  podiumTier?: HomeChartPodiumTier | null;
  /** 워드마크 없이 CI 마크만 표시 (차트 에러 히어로 등) */
  markOnly?: boolean;
  /** markOnly일 때 마크 한 변 길이(px) */
  markSize?: number;
  /** 메인 상단 CI 전용 표시명 — 미지정 시 NullReference Music */
  displayName?: string;
  onPress?: () => void;
};

function resolveAccentColor(
  tone: 'light' | 'dark',
  disabled: boolean,
  podiumTier: HomeChartPodiumTier | null | undefined,
): string {
  if (disabled) return 'rgba(128,128,128,0.35)';
  if (podiumTier) {
    return HOME_CHART_PODIUM_TEXT[podiumTier][tone === 'dark' ? 'dark' : 'light'].number;
  }
  return tone === 'dark' ? nrmTokens.color.primaryOnDark : nrmTokens.color.primary;
}

export function NrmLogo({
  compact = false,
  tone = 'light',
  layout = 'stacked',
  disabled = false,
  podiumTier = null,
  markOnly = false,
  markSize: markSizeProp,
  displayName,
  onPress,
}: Props) {
  const { width } = useWindowDimensions();
  const resolvedDisplayName = displayName ?? getNrmProductDisplayName();
  const { primary: logoPrimary, accent: logoAccent } = splitNrmLogoWordmark(resolvedDisplayName);
  const nullColor = disabled
    ? 'rgba(128,128,128,0.45)'
    : tone === 'dark'
      ? nrmTokens.color.bodyOnDark
      : nrmTokens.color.ink;
  const musicColor = resolveAccentColor(tone, disabled, podiumTier);
  const androidTextPad =
    Platform.OS === 'android' ? ({ includeFontPadding: false } as const) : {};

  const primarySize = compact
    ? Math.min(17, Math.round(width * 0.042))
    : Math.min(20, Math.max(16, Math.round(width * 0.048)));
  const accentSize = compact
    ? Math.max(10, Math.round(primarySize * 0.58))
    : Math.max(11, Math.round(primarySize * 0.55));
  const accentWord = (logoAccent || 'Music').toUpperCase();
  const primaryLine = logoAccent ? logoPrimary.trimEnd() : logoPrimary;
  const markSize = markSizeProp ?? (markOnly ? 72 : compact ? 26 : 34);

  const mark = (
    <View style={[styles.markSlot, { width: markSize, height: markSize }]}>
      <Image
        source={require('@/assets/images/logo-mark.png')}
        style={[
          { width: markSize, height: markSize },
          disabled && styles.markDisabled,
        ]}
        resizeMode="contain"
      />
    </View>
  );

  if (markOnly) {
    const markOnlyContent = (
      <View style={styles.markOnlyWrap} accessibilityRole="image">
        {mark}
      </View>
    );
    if (!onPress) return markOnlyContent;
    return (
      <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [pressed && styles.pressed]}>
        {markOnlyContent}
      </Pressable>
    );
  }

  const stacked = (
    <View style={styles.stackedWrap} accessibilityRole="header">
      <Text
        style={[
          styles.primaryLine,
          { fontSize: primarySize, lineHeight: Math.round(primarySize * 1.12), color: nullColor },
          androidTextPad,
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.82}>
        {primaryLine}
      </Text>
      {logoAccent ? (
        <Text
          style={[
            styles.accentLine,
            {
              fontSize: accentSize,
              lineHeight: Math.round(accentSize * 1.2),
              color: musicColor,
              letterSpacing: accentSize * 0.28,
            },
            androidTextPad,
          ]}
          numberOfLines={1}>
          {accentWord}
        </Text>
      ) : null}
    </View>
  );

  const inline = (
    <Text
      style={[styles.inlineWordmark, { fontSize: primarySize }, androidTextPad]}
      accessibilityRole="header">
      {logoAccent ? (
        <>
          <Text style={{ color: nullColor }}>{logoPrimary}</Text>
          <Text style={{ color: musicColor }}>{logoAccent}</Text>
        </>
      ) : (
        <Text style={{ color: nullColor }}>{logoPrimary}</Text>
      )}
    </Text>
  );

  const content = layout === 'stacked' ? stacked : inline;

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
  markSlot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  markDisabled: {
    opacity: 0.35,
  },
  stackedWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLine: {
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: Platform.OS === 'ios' ? -0.2 : 0,
  },
  accentLine: {
    fontWeight: '700',
    textAlign: 'center',
    textTransform: 'uppercase',
    marginTop: 1,
  },
  inlineWordmark: {
    fontWeight: '600',
    letterSpacing: Platform.OS === 'ios' ? -0.37 : -0.2,
  },
  pressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
});
