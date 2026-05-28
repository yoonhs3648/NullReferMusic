import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';

const PANEL_BORDER = Platform.OS === 'web' ? StyleSheet.hairlineWidth : 1;

type Props = {
  visible: boolean;
  isDark: boolean;
  titleColor: string;
  bodyColor: string;
  onClose: () => void;
};

export function NrmLyricsTranslationFailedOverlay({
  visible,
  isDark,
  titleColor,
  bodyColor,
  onClose,
}: Props) {
  const cardBg = isDark ? nrmTokens.color.surfaceTile1 : nrmTokens.color.canvas;
  const cardBorder = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable style={[StyleSheet.absoluteFill, styles.scrim]} onPress={onClose} accessibilityLabel="닫기" />
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <Text style={[styles.title, { color: titleColor }]}>가사 번역 안내</Text>
          <Text style={[styles.message, { color: bodyColor }]}>
            가사번역에 실패했습니다. 원본 가사로 임베드되었습니다.
          </Text>
          <Pressable onPress={onClose} style={({ pressed }) => [styles.btnPrimary, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="확인">
            <Text style={styles.btnPrimaryLabel}>알겠어요</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: nrmTokens.space.lg },
  scrim: { backgroundColor: 'rgba(0,0,0,0.45)' },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: nrmTokens.radius.lg,
    borderWidth: PANEL_BORDER,
    padding: nrmTokens.space.lg,
    zIndex: 1,
  },
  title: { fontSize: nrmTokens.font.lead, fontWeight: '600', marginBottom: nrmTokens.space.sm },
  message: { fontSize: nrmTokens.font.body, lineHeight: 22, marginBottom: nrmTokens.space.lg },
  btnPrimary: {
    alignSelf: 'stretch',
    paddingVertical: 12,
    borderRadius: nrmTokens.radius.pill,
    backgroundColor: nrmTokens.color.primary,
    alignItems: 'center',
  },
  btnPrimaryLabel: { fontSize: nrmTokens.font.body, fontWeight: '600', color: '#fff' },
  pressed: { opacity: 0.88 },
});
