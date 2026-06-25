import Ionicons from '@expo/vector-icons/Ionicons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NrmMelonAdultAuthWebView } from '@/components/nrm/settings/NrmMelonAdultAuthWebView';
import { nrmTokens } from '@/constants/nrmTokens';
import { hasNrmMelonCookieNativeModule, readMelonLoginCookieHeader } from '@/lib/nrmMelonCookie';
import { melonCookieHeaderHasLogin } from '@/lib/nrmMelonAdultSession';
import { notifyUser } from '@/lib/nrmUserNotify';

type Props = {
  visible: boolean;
  titleColor: string;
  bodyColor?: string;
  webViewSessionKey?: number;
  onClose: () => void;
  /** [완료] — WebView CookieManager 에서 쿠키를 읽어 저장 (로그인·성인인증 후) */
  onCookieCaptured: (cookieHeader: string) => void;
};

export function NrmMelonAdultAuthLoginModal({
  visible,
  titleColor,
  bodyColor = 'rgba(255,255,255,0.65)',
  webViewSessionKey = 0,
  onClose,
  onCookieCaptured,
}: Props) {
  const canReadCookie = hasNrmMelonCookieNativeModule();

  const onComplete = () => {
    void (async () => {
      if (!canReadCookie) {
        onClose();
        return;
      }
      const cookie = await readMelonLoginCookieHeader();
      if (!cookie || !melonCookieHeaderHasLogin(cookie)) {
        void notifyUser(
          '멜론 로그인 쿠키(MLCP)가 없습니다. 로그인·성인인증을 완료한 뒤 [완료]를 눌러 주세요.',
        );
        return;
      }
      onCookieCaptured(cookie);
    })();
  };

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
          2. 19금 곡 상세에서 「성인 인증」을 완료합니다.{'\n'}
          3. 아래 [완료]를 눌러 쿠키를 저장합니다. (로그인만으로는 저장되지 않습니다)
        </Text>
        <View style={styles.webWrap}>
          {visible ? <NrmMelonAdultAuthWebView sessionKey={webViewSessionKey} /> : null}
        </View>
        <Pressable
          onPress={onComplete}
          style={({ pressed }) => [styles.completeBtn, pressed && styles.completeBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel="완료">
          <Text style={[styles.completeBtnLabel, { color: titleColor }]}>완료 — 쿠키 저장</Text>
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
  hint: {
    fontSize: nrmTokens.font.caption,
    lineHeight: 18,
    paddingHorizontal: nrmTokens.space.md,
    paddingBottom: nrmTokens.space.sm,
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
  completeBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: nrmTokens.space.md,
    marginTop: nrmTokens.space.sm,
    marginBottom: nrmTokens.space.md,
    paddingVertical: 12,
    borderRadius: nrmTokens.radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(128,128,128,0.4)',
  },
  completeBtnPressed: {
    opacity: 0.88,
  },
  completeBtnLabel: {
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
});
