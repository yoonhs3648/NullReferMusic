import { StyleSheet, Text, View } from 'react-native';

import { NrmLogo } from '@/components/nrm/NrmLogo';
import { nrmTokens } from '@/constants/nrmTokens';
import type { ChartErrorCode, ChartPlatformId } from '@/lib/nrmChartErrors';
import { chartUserMessage } from '@/lib/nrmChartErrors';

type Props = {
  isDark: boolean;
  platform: ChartPlatformId;
  errorCode: ChartErrorCode;
  paddingHorizontal: number;
};

export function NrmChartErrorHero({
  isDark,
  platform,
  errorCode,
  paddingHorizontal,
}: Props) {
  const bodyColor = isDark ? nrmTokens.color.textMuted : nrmTokens.color.inkMuted80;
  const message = chartUserMessage(platform, errorCode);

  return (
    <View
      style={[
        styles.wrap,
        { paddingHorizontal },
      ]}
      accessibilityRole="alert"
      accessibilityLabel={message}>
      <View style={styles.logoSlot} pointerEvents="none">
        <NrmLogo
          markOnly
          markSize={148}
          tone={isDark ? 'dark' : 'light'}
          disabled
        />
      </View>
      <Text style={[styles.message, { color: bodyColor }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minHeight: 360,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: nrmTokens.space.xxl,
  },
  logoSlot: {
    marginBottom: nrmTokens.space.xl,
    opacity: 0.38,
  },
  message: {
    fontSize: nrmTokens.font.body,
    fontWeight: '400',
    lineHeight: 24,
    textAlign: 'center',
    maxWidth: 320,
  },
});
