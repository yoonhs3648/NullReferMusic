import Ionicons from '@expo/vector-icons/Ionicons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NrmMelonAdultAuthWebView } from '@/components/nrm/settings/NrmMelonAdultAuthWebView';
import { nrmTokens } from '@/constants/nrmTokens';

type Props = {
  visible: boolean;
  titleColor: string;
  webViewSessionKey?: number;
  onClose: () => void;
  /** MLCP 쿠키 감지 시 호출 — 쿠키 저장 후 모달을 닫을 책임은 호출자에게 있음 */
  onCookieCaptured: (cookieHeader: string) => void;
};

export function NrmMelonAdultAuthLoginModal({
  visible,
  titleColor,
  webViewSessionKey = 0,
  onClose,
  onCookieCaptured,
}: Props) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: titleColor }]}>멜론 로그인 · 성인인증</Text>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel="닫기">
            <Ionicons name="close" size={28} color={titleColor} />
          </Pressable>
        </View>
        <View style={styles.webWrap}>
          {visible ? (
            <NrmMelonAdultAuthWebView
              sessionKey={webViewSessionKey}
              onCookieCaptured={onCookieCaptured}
            />
          ) : null}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: nrmTokens.space.md,
    paddingVertical: nrmTokens.space.sm,
  },
  headerTitle: {
    fontSize: nrmTokens.font.lead,
    fontWeight: '600',
    flex: 1,
    paddingRight: nrmTokens.space.sm,
  },
  closeBtn: {
    padding: nrmTokens.space.xs,
  },
  closeBtnPressed: {
    opacity: 0.7,
  },
  webWrap: {
    flex: 1,
    minHeight: 0,
  },
});
