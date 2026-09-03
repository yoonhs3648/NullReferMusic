import '@/lib/nrmDomMinimalPolyfills';
import '@/lib/nrmMetroLogBootstrap';
import '@/lib/nrmFileLogBootstrap';
import { ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Platform, View } from 'react-native';
import 'react-native-reanimated';

import { NrmAppPermissionGate } from '@/components/nrm/NrmAppPermissionGate';
import { NrmApkUpdateGate } from '@/components/nrm/NrmApkUpdateGate';
import { NrmTermsConsentGate } from '@/components/nrm/NrmTermsConsentGate';
import { NrmDeviceBindingGate } from '@/components/nrm/NrmDeviceBindingGate';
import { NrmLoginGate } from '@/components/nrm/NrmLoginGate';
import { NrmOAuthRegisterGate } from '@/components/nrm/NrmOAuthRegisterGate';
import { NrmNotifyHost } from '@/components/nrm/NrmNotifyHost';
import { NrmUserBanGate } from '@/components/nrm/NrmUserBanGate';
import { NrmGoogleTranslateHost } from '@/components/nrm/NrmGoogleTranslateHost';
import { NrmYoutubeCookieHarvester } from '@/components/nrm/NrmYoutubeCookieHarvester';
import { NrmYoutubeDecipherHost } from '@/components/nrm/NrmYoutubeDecipherHost';
import {
  NrmUiAppearanceProvider,
  useNrmUiAppearance,
} from '@/context/NrmUiAppearanceContext';
import { getNrmNavigationTheme } from '@/constants/nrmNavigationTheme';
import { getNrmRootBackgroundColor } from '@/lib/nrmUiAppearanceColors';
import { setupNrmMobileDownloadNotifications } from '@/lib/nrmMobileDownloadNotifications';
import { isNrmTermsConsented, saveNrmTermsConsented } from '@/lib/nrmTermsConsent';
import { initNrmBrandIdentity } from '@/lib/nrmBrandIdentity';
import {
  loadNrmAuthSession,
  loadNrmOAuthPendingProfile,
  registerNrmAuthSessionListener,
  syncNrmAdminSessionFromAuth,
} from '@/lib/nrmAuthSession';

export { ErrorBoundary } from 'expo-router';

/**
 * 앱 진입 시 단계:
 *  checking      → 브랜드/세션 확인
 *  apk_update    → GitHub Releases APK 자동 업데이트 (Android)
 *  login         → Google/Kakao 로그인
 *  terms         → 이용약관/개인정보처리방침 동의
 *  permissions   → 앱 사용 권한 (Android)
 *  register      → nrm_user_list 등록
 *  device_check  → 디바이스 바인딩
 *  ready         → 메인 앱
 */
type GatePhase =
  | 'checking'
  | 'apk_update'
  | 'login'
  | 'terms'
  | 'permissions'
  | 'register'
  | 'device_check'
  | 'ready';

async function nextPhaseAfterLogin(): Promise<Exclude<GatePhase, 'checking' | 'apk_update' | 'login'>> {
  const consented = await isNrmTermsConsented();
  if (!consented) return 'terms';
  if (Platform.OS === 'android') return 'permissions';
  return 'register';
}

async function resolvePhaseAfterIdentity(): Promise<GatePhase> {
  const [session, pending] = await Promise.all([
    loadNrmAuthSession(),
    loadNrmOAuthPendingProfile(),
  ]);
  await syncNrmAdminSessionFromAuth();
  if (!session && !pending) return 'login';
  return nextPhaseAfterLogin();
}

function RootLayoutInner() {
  const { isDark } = useNrmUiAppearance();
  const navigationTheme = getNrmNavigationTheme(isDark ? 'dark' : 'light');
  const rootBackground = getNrmRootBackgroundColor(isDark);
  const [phase, setPhase] = useState<GatePhase>('checking');

  useEffect(() => {
    registerNrmAuthSessionListener((session) => {
      if (!session) setPhase('login');
    });
    return () => registerNrmAuthSessionListener(null);
  }, []);

  useEffect(() => {
    void (async () => {
      await initNrmBrandIdentity();
      if (Platform.OS === 'android') {
        setPhase('apk_update');
        return;
      }
      setPhase(await resolvePhaseAfterIdentity());
    })();
  }, []);

  const onApkUpdateComplete = useCallback(() => {
    void resolvePhaseAfterIdentity().then(setPhase);
  }, []);

  const onLoggedIn = useCallback(() => {
    void nextPhaseAfterLogin().then(setPhase);
  }, []);

  const onTermsAgreed = useCallback(() => {
    if (Platform.OS === 'android') {
      setPhase('permissions');
      return;
    }
    void saveNrmTermsConsented();
    if (Platform.OS !== 'web') {
      void setupNrmMobileDownloadNotifications();
    }
    setPhase('register');
  }, []);

  const onPermissionsGranted = useCallback(() => {
    void saveNrmTermsConsented();
    void setupNrmMobileDownloadNotifications();
    setPhase('register');
  }, []);

  const onRegistered = useCallback(() => {
    if (Platform.OS === 'android') {
      setPhase('device_check');
      return;
    }
    setPhase('ready');
  }, []);

  if (phase === 'checking') {
    return <View style={{ flex: 1, backgroundColor: rootBackground }} />;
  }

  if (phase === 'apk_update') {
    return <NrmApkUpdateGate onComplete={onApkUpdateComplete} />;
  }

  let gated: ReactNode = null;
  if (phase === 'login') {
    gated = <NrmLoginGate onLoggedIn={onLoggedIn} />;
  } else if (phase === 'terms') {
    gated = <NrmTermsConsentGate onAgreed={onTermsAgreed} />;
  } else if (phase === 'permissions') {
    gated = <NrmAppPermissionGate onGranted={onPermissionsGranted} />;
  } else if (phase === 'register') {
    gated = <NrmOAuthRegisterGate onRegistered={onRegistered} />;
  } else if (phase === 'device_check') {
    gated = <NrmDeviceBindingGate onVerified={() => setPhase('ready')} />;
  } else {
    gated = (
      <ThemeProvider value={navigationTheme}>
        <NrmYoutubeCookieHarvester />
        <NrmYoutubeDecipherHost />
        <NrmGoogleTranslateHost />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: rootBackground },
          }}>
          <Stack.Screen name="index" />
        </Stack>
      </ThemeProvider>
    );
  }

  return (
    <>
      <NrmUserBanGate>{gated}</NrmUserBanGate>
      <NrmNotifyHost />
    </>
  );
}

export default function RootLayout() {
  return (
    <NrmUiAppearanceProvider>
      <RootLayoutInner />
    </NrmUiAppearanceProvider>
  );
}
