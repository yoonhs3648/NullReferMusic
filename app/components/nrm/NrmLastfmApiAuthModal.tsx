import { Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';
import { chartUserMessage } from '@/lib/nrmChartErrors';
import type { ChartErrorCode } from '@/lib/nrmChartErrors';
import type { LastfmSearchErrorCode } from '@/lib/nrmLastfmSearchTypes';

const PANEL_BORDER = Platform.OS === 'web' ? StyleSheet.hairlineWidth : 1;

type Props = {
  visible: boolean;
  isDark: boolean;
  titleColor: string;
  bodyColor: string;
  errorCode: ChartErrorCode | LastfmSearchErrorCode;
  onClose: () => void;
  onOpenSettings: () => void;
};

export function NrmLastfmApiAuthModal({
  visible,
  isDark,
  titleColor,
  bodyColor,
  errorCode,
  onClose,
  onOpenSettings,
}: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const cardBg = isDark ? nrmTokens.color.surfaceTile1 : nrmTokens.color.canvas;
  const cardBorder = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const message =
    errorCode === 'not_configured'
      ? chartUserMessage('lastfm', 'not_configured')
      : chartUserMessage('lastfm', 'auth_failed');

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent>
      <View style={styles.root}>
        <Pressable
          style={[StyleSheet.absoluteFill, styles.scrim]}
          onPress={onClose}
          accessibilityLabel="닫기"
        />
        <View
          style={[
            styles.card,
            {
              width: Math.min(windowWidth * 0.86, 400),
              backgroundColor: cardBg,
              borderColor: cardBorder,
            },
          ]}>
          <Text style={[styles.title, { color: titleColor }]}>Last.fm API</Text>
          <Text style={[styles.message, { color: bodyColor }]}>{message}</Text>
          <Pressable
            onPress={onOpenSettings}
            style={({ pressed }) => [
              styles.btnPrimary,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="API 설정 열기">
            <Text style={styles.btnPrimaryLabel}>API 설정 열기</Text>
          </Pressable>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              styles.btnSecondary,
              { borderColor: cardBorder },
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="닫기">
            <Text style={[styles.btnSecondaryLabel, { color: titleColor }]}>닫기</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: nrmTokens.space.lg,
  },
  scrim: { backgroundColor: 'rgba(0,0,0,0.45)' },
  card: {
    borderRadius: nrmTokens.radius.lg,
    borderWidth: PANEL_BORDER,
    padding: nrmTokens.space.lg,
    zIndex: 1,
  },
  title: {
    fontSize: nrmTokens.font.lead,
    fontWeight: '600',
    marginBottom: nrmTokens.space.sm,
  },
  message: {
    fontSize: nrmTokens.font.body,
    lineHeight: 22,
    marginBottom: nrmTokens.space.lg,
  },
  btnPrimary: {
    alignSelf: 'stretch',
    paddingVertical: 12,
    borderRadius: nrmTokens.radius.pill,
    backgroundColor: nrmTokens.color.primary,
    alignItems: 'center',
    marginBottom: nrmTokens.space.sm,
  },
  btnPrimaryLabel: {
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
    color: '#fff',
  },
  btnSecondary: {
    alignSelf: 'stretch',
    paddingVertical: 12,
    borderRadius: nrmTokens.radius.pill,
    borderWidth: PANEL_BORDER,
    alignItems: 'center',
  },
  btnSecondaryLabel: {
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
  pressed: { opacity: 0.88 },
});
