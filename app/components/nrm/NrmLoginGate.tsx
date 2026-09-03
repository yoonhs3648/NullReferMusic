import { useCallback, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { nrmTokens } from '@/constants/nrmTokens';
import { getNrmProductDisplayName } from '@/lib/nrmAppBrand';
import { saveNrmOAuthPendingProfile } from '@/lib/nrmAuthSession';
import { loginWithNrmOAuth } from '@/lib/nrmOAuthLogin';

type Props = {
  onLoggedIn: () => void;
};

function GoogleLogo() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" accessibilityLabel="Google">
      <Path
        fill="#4285F4"
        d="M21.35 11.1h-9.18v3.71h5.28c-.23 1.2-.92 2.22-1.96 2.9v2.42h3.17c1.85-1.71 2.92-4.22 2.92-7.2 0-.63-.06-1.24-.17-1.83h-.06Z"
      />
      <Path
        fill="#34A853"
        d="M12.17 21.5c2.64 0 4.86-.87 6.48-2.37l-3.17-2.42c-.88.59-2 .94-3.31.94-2.55 0-4.71-1.72-5.48-4.03H3.42v2.5a9.79 9.79 0 0 0 8.75 5.38Z"
      />
      <Path
        fill="#FBBC05"
        d="M6.69 13.62a5.9 5.9 0 0 1 0-3.78v-2.5H3.42a9.82 9.82 0 0 0 0 8.78l3.27-2.5Z"
      />
      <Path
        fill="#EA4335"
        d="M12.17 5.81c1.44 0 2.73.5 3.74 1.47l2.81-2.81C17.02 2.88 14.81 2 12.17 2a9.79 9.79 0 0 0-8.75 5.34l3.27 2.5c.77-2.31 2.93-4.03 5.48-4.03Z"
      />
    </Svg>
  );
}

function KakaoLogo() {
  return (
    <Svg width={23} height={23} viewBox="0 0 24 24" accessibilityLabel="카카오">
      <Path
        fill="#191919"
        d="M12 2.75c-5.66 0-10.25 3.62-10.25 8.08 0 2.87 1.9 5.39 4.77 6.82l-1.21 4.47c-.11.4.34.71.68.48l5.32-3.52c.23.02.46.02.69.02 5.66 0 10.25-3.62 10.25-8.09S17.66 2.75 12 2.75Z"
      />
    </Svg>
  );
}

export function NrmLoginGate({ onLoggedIn }: Props) {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState<'google' | 'kakao' | null>(null);
  const [error, setError] = useState('');

  const runLogin = useCallback(
    async (kind: 'google' | 'kakao') => {
      if (busy) return;
      setError('');
      setBusy(kind);
      try {
        const profile = await loginWithNrmOAuth(kind);
        await saveNrmOAuthPendingProfile(profile);
        onLoggedIn();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg !== 'cancelled') {
          setError(msg || '로그인에 실패했습니다.');
        }
      } finally {
        setBusy(null);
      }
    },
    [busy, onLoggedIn],
  );

  return (
    <View style={styles.root}>
      <StatusBar style="dark" backgroundColor="#f7f9fc" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: Math.max(insets.top, 24),
            paddingBottom: Math.max(insets.bottom, 24),
          },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        <View style={styles.content}>
          <View style={styles.brandMark}>
            <Image
              source={require('../../assets/images/logo-mark.png')}
              resizeMode="contain"
              style={styles.brandMarkImage}
            />
          </View>
          <Text style={styles.brand}>{getNrmProductDisplayName()}</Text>
          <Text style={styles.lead}>
            간편 로그인으로 음악을 더 빠르게 만나보세요.
          </Text>

          <View style={styles.buttonGroup}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Google로 계속하기"
              disabled={busy != null}
              onPress={() => void runLogin('google')}
              style={({ pressed }) => [
                styles.loginBtn,
                styles.googleBtn,
                busy != null && styles.loginBtnDisabled,
                pressed && busy == null && styles.loginBtnPressed,
              ]}>
              {busy === 'google' ? (
                <ActivityIndicator color="#4285F4" />
              ) : (
                <>
                  <View style={styles.providerLogo}>
                    <GoogleLogo />
                  </View>
                  <Text style={styles.googleBtnText}>Google로 계속하기</Text>
                </>
              )}
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="카카오로 계속하기"
              disabled={busy != null}
              onPress={() => void runLogin('kakao')}
              style={({ pressed }) => [
                styles.loginBtn,
                styles.kakaoBtn,
                busy != null && styles.loginBtnDisabled,
                pressed && busy == null && styles.loginBtnPressed,
              ]}>
              {busy === 'kakao' ? (
                <ActivityIndicator color="#191919" />
              ) : (
                <>
                  <View style={styles.providerLogo}>
                    <KakaoLogo />
                  </View>
                  <Text style={styles.kakaoBtnText}>카카오로 계속하기</Text>
                </>
              )}
            </Pressable>
          </View>

          <Text style={styles.termsHint}>
            계속하면 이용약관 및 개인정보처리방침 확인 단계로 이동합니다.
          </Text>
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.error}>{error}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f7f9fc',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: nrmTokens.space.lg,
  },
  content: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    paddingHorizontal: nrmTokens.space.sm,
    paddingVertical: nrmTokens.space.lg,
  },
  brandMark: {
    width: 76,
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: nrmTokens.space.md,
  },
  brandMarkImage: {
    width: 62,
    height: 62,
  },
  brand: {
    color: '#64748b',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginBottom: nrmTokens.space.sm,
  },
  lead: {
    color: '#64748b',
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
    marginBottom: 28,
  },
  buttonGroup: {
    width: '100%',
    gap: 12,
  },
  loginBtn: {
    position: 'relative',
    width: '100%',
    height: 54,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  googleBtn: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d7dce2',
    shadowColor: '#4285f4',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  googleBtnText: {
    color: '#202124',
    fontSize: 16,
    fontWeight: '600',
  },
  kakaoBtn: {
    backgroundColor: '#fee500',
    borderWidth: 1,
    borderColor: '#f2d900',
  },
  kakaoBtnText: {
    color: '#191919',
    fontSize: 16,
    fontWeight: '600',
  },
  providerLogo: {
    position: 'absolute',
    left: 18,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginBtnPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.985 }],
  },
  loginBtnDisabled: {
    opacity: 0.62,
  },
  termsHint: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: nrmTokens.space.lg,
  },
  errorBox: {
    width: '100%',
    marginTop: nrmTokens.space.md,
    paddingHorizontal: nrmTokens.space.md,
    paddingVertical: nrmTokens.space.sm,
    borderRadius: nrmTokens.radius.md,
    backgroundColor: '#fff1f2',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#fecdd3',
  },
  error: {
    color: '#be123c',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
});
