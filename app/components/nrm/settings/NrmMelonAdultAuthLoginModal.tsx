import Ionicons from '@expo/vector-icons/Ionicons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NrmMelonAdultAuthWebView } from '@/components/nrm/settings/NrmMelonAdultAuthWebView';
import { nrmTokens } from '@/constants/nrmTokens';

type Props = {
  visible: boolean;
  titleColor: string;
  bodyColor: string;
  webViewSessionKey?: number;
  onClose: () => void;
  onRequestSave: () => void;
};

export function NrmMelonAdultAuthLoginModal({
  visible,
  titleColor,
  bodyColor,
  webViewSessionKey = 0,
  onClose,
  onRequestSave,
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
        <Text style={[styles.hint, { color: bodyColor }]}>
          1. 멜론에 로그인합니다.{'\n'}
          2. 19금 곡 가사에서 성인인증 팝업이 뜨면 본인인증을 완료합니다.{'\n'}
          3. 완료 후 아래 「세션 저장」을 눌러 주세요.
        </Text>
        <View style={styles.webWrap}>
          {visible ? <NrmMelonAdultAuthWebView sessionKey={webViewSessionKey} /> : null}
        </View>
        <Pressable
          onPress={onRequestSave}
          style={({ pressed }) => [styles.saveBtn, pressed && styles.saveBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel="세션 저장">
          <Text style={styles.saveBtnText}>세션 저장</Text>
        </Pressable>
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
  hint: {
    fontSize: nrmTokens.font.caption,
    lineHeight: 18,
    paddingHorizontal: nrmTokens.space.md,
    marginBottom: nrmTokens.space.sm,
  },
  webWrap: {
    flex: 1,
    minHeight: 0,
  },
  saveBtn: {
    marginHorizontal: nrmTokens.space.md,
    marginVertical: nrmTokens.space.sm,
    backgroundColor: nrmTokens.color.primary,
    borderRadius: nrmTokens.radius.md,
    paddingVertical: nrmTokens.space.md,
    alignItems: 'center',
  },
  saveBtnPressed: {
    opacity: 0.85,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
});
