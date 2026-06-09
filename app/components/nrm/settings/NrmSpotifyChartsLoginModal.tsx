import Ionicons from '@expo/vector-icons/Ionicons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NrmSpotifyChartsLoginWebView } from '@/components/nrm/settings/NrmSpotifyChartsLoginWebView';
import { nrmTokens } from '@/constants/nrmTokens';
import type { SpotifyChartsSessionSave } from '@/lib/nrmSpotifyChartsSession';

type Props = {
  visible: boolean;
  titleColor: string;
  bodyColor: string;
  /** 갱신·재시도 후에도 실패했을 때 만료 안내 문구 */
  bearerExpired?: boolean;
  /** 로그아웃 후 WebView를 새로 마운트할 때 증가 */
  webViewSessionKey?: number;
  onClose: () => void;
  onSessionCaptured: (payload: SpotifyChartsSessionSave) => void;
};

export function NrmSpotifyChartsLoginModal({
  visible,
  titleColor,
  bodyColor,
  bearerExpired = false,
  webViewSessionKey = 0,
  onClose,
  onSessionCaptured,
}: Props) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: titleColor }]}>
            {bearerExpired ? 'Charts Bearer 갱신' : 'charts.spotify.com 로그인'}
          </Text>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              styles.closeBtn,
              pressed && styles.closeBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="닫기">
            <Ionicons name="close" size={28} color={titleColor} />
          </Pressable>
        </View>
        <Text style={[styles.hint, { color: bodyColor }]}>
          {bearerExpired
            ? '토큰이 만료되었거나 잘못되었습니다. 다시 로그인해 Bearer를 저장해 주세요.'
            : '로그인 후 차트가 로드되면 Bearer 토큰을 자동으로 저장하고 닫습니다.'}
        </Text>
        <View style={styles.webWrap}>
          {visible ? (
            <NrmSpotifyChartsLoginWebView
              sessionKey={webViewSessionKey}
              onLoginComplete={(payload) => {
                onSessionCaptured(payload);
                onClose();
              }}
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
});
