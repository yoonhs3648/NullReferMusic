import { Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';

const PANEL_BORDER = Platform.OS === 'web' ? StyleSheet.hairlineWidth : 1;

type Props = {
  visible: boolean;
  isDark: boolean;
  titleColor: string;
  bodyColor: string;
  onClose: () => void;
};

export function NrmDownloadMetadataUnavailableOverlay({
  visible,
  isDark,
  titleColor,
  bodyColor,
  onClose,
}: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const cardBg = isDark ? nrmTokens.color.surfaceTile1 : nrmTokens.color.canvas;
  const cardBorder = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;

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
          <Text style={[styles.title, { color: titleColor }]}>메타데이터</Text>
          <Text style={[styles.message, { color: bodyColor }]}>
            메타데이터 정보를 가져올 수 없습니다.
          </Text>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              styles.btn,
              { borderColor: cardBorder },
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="확인">
            <Text style={[styles.btnLabel, { color: titleColor }]}>확인</Text>
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
  btn: {
    alignSelf: 'stretch',
    paddingVertical: 12,
    borderRadius: nrmTokens.radius.pill,
    borderWidth: PANEL_BORDER,
    alignItems: 'center',
  },
  btnLabel: {
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
  pressed: { opacity: 0.88 },
});
