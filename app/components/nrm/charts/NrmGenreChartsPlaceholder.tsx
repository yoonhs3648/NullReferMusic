import { StyleSheet, Text, View } from 'react-native';

import { NrmFeatureScreenLogoHeader } from '@/components/nrm/NrmFeatureScreenLogoHeader';
import { nrmTokens } from '@/constants/nrmTokens';

type Props = {
  isDark: boolean;
  paddingHorizontal: number;
  onBackToHome: () => void;
  onOpenChartsSession?: () => void;
  onRenewChartsBearer?: () => Promise<boolean>;
  onShowBearerExpired?: () => void;
};

export function NrmGenreChartsPlaceholder({
  isDark,
  paddingHorizontal,
  onBackToHome,
}: Props) {
  const titleColor = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
  const bodyColor = isDark ? 'rgba(255,255,255,0.72)' : 'rgba(0,0,0,0.62)';

  return (
    <View style={[styles.wrap, { paddingHorizontal }]}>
      <NrmFeatureScreenLogoHeader isDark={isDark} onPressHome={onBackToHome} />
      <Text style={[styles.title, { color: titleColor }]}>장르별 차트</Text>
      <Text style={[styles.lead, { color: bodyColor }]}>
        Last.fm API를 활용합니다.
      </Text>
      <View
        style={[
          styles.card,
          {
            borderColor: isDark
              ? nrmTokens.color.borderOnDark
              : nrmTokens.color.hairline,
            backgroundColor: isDark
              ? nrmTokens.color.surfaceTile2
              : nrmTokens.color.canvas,
          },
        ]}>
        <Text style={[styles.cardText, { color: bodyColor }]}>
          장르별 차트 기능은 준비 중입니다.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    paddingBottom: nrmTokens.space.xxl,
    maxWidth: nrmTokens.layout.maxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },
  title: {
    fontSize: nrmTokens.font.lead,
    fontWeight: '600',
    letterSpacing: -0.4,
    marginBottom: nrmTokens.space.sm,
  },
  lead: {
    fontSize: nrmTokens.font.body,
    marginBottom: nrmTokens.space.lg,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: nrmTokens.radius.lg,
    padding: nrmTokens.space.lg,
  },
  cardText: {
    fontSize: nrmTokens.font.caption,
    lineHeight: 20,
    textAlign: 'center',
  },
});
