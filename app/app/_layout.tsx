import '@/lib/nrmDomMinimalPolyfills';
import '@/lib/nrmMetroLogBootstrap';
import '@/lib/nrmFileLogBootstrap';
import { ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import 'react-native-reanimated';

import { NrmAppPermissionGate } from '@/components/nrm/NrmAppPermissionGate';
import { NrmApkUpdateGate } from '@/components/nrm/NrmApkUpdateGate';
import { NrmTermsConsentGate } from '@/components/nrm/NrmTermsConsentGate';
import { NrmDeviceBindingGate } from '@/components/nrm/NrmDeviceBindingGate';
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
import { initNrmBrandIdentity, isNrmAdminBuild } from '@/lib/nrmBrandIdentity';

export { ErrorBoundary } from 'expo-router';

/**
 * 앱 진입 시 단계:
 *  checking      → AsyncStorage에서 약관 동의 여부 확인 중 (투명 화면)
 *  apk_update    → GitHub Releases APK 자동 업데이트 (Android만, identity 유지)
 *  terms         → 이용약관/개인정보처리방침 동의 화면
 *  permissions   → 앱 사용 권한 요청 화면 (Android만)
 *  device_check  → 커스텀 APK 디바이스 바인딩 검사 (SerialNo 있을 때만, Android만)
 *  ready         → 메인 앱 진입
 *
 * 약관 동의는 권한 허가 완료 이후에만 저장됩니다.
 * 권한 허가 전 앱이 종료되면 재실행 시 약관 화면부터 다시 시작합니다.
 */
type GatePhase = 'checking' | 'apk_update' | 'terms' | 'permissions' | 'device_check' | 'ready';

function RootLayoutInner() {
  const { isDark } = useNrmUiAppearance();
  const navigationTheme = getNrmNavigationTheme(isDark ? 'dark' : 'light');
  const rootBackground = getNrmRootBackgroundColor(isDark);
  const [phase, setPhase] = useState<GatePhase>('checking');

  useEffect(() => {
    void (async () => {
      if (Platform.OS === 'android') {
        await initNrmBrandIdentity();
        setPhase('apk_update');
        return;
      }
      await initNrmBrandIdentity();
      const consented = await isNrmTermsConsented();
      if (!consented) {
        setPhase('terms');
      } else {
        setPhase('ready');
      }
    })();
  }, []);

  const onApkUpdateComplete = useCallback(() => {
    void isNrmTermsConsented().then((consented) => {
      if (!consented) {
        setPhase('terms');
      } else if (Platform.OS === 'android') {
        setPhase('permissions');
      } else {
        setPhase('ready');
      }
    });
  }, []);

  const onTermsAgreed = useCallback(() => {
    if (Platform.OS === 'android') {
      setPhase('permissions');
    } else {
      void saveNrmTermsConsented();
      if (Platform.OS !== 'web') {
        void setupNrmMobileDownloadNotifications();
      }
      setPhase('ready');
    }
  }, []);

  const onPermissionsGranted = useCallback(() => {
    void saveNrmTermsConsented();
    void setupNrmMobileDownloadNotifications();
    // Android 커스텀 APK는 디바이스 바인딩 검사 추가 (admin APK 제외)
    if (Platform.OS === 'android' && !isNrmAdminBuild()) {
      setPhase('device_check');
    } else {
      setPhase('ready');
    }
  }, []);

  if (phase === 'checking') {
    return <View style={{ flex: 1, backgroundColor: rootBackground }} />;
  }

  if (phase === 'apk_update') {
    return <NrmApkUpdateGate onComplete={onApkUpdateComplete} />;
  }

  if (phase === 'terms') {
    return <NrmTermsConsentGate onAgreed={onTermsAgreed} />;
  }

  if (phase === 'permissions') {
    return <NrmAppPermissionGate onGranted={onPermissionsGranted} />;
  }

  if (phase === 'device_check') {
    return <NrmDeviceBindingGate onVerified={() => setPhase('ready')} />;
  }

  return (
    <ThemeProvider value={navigationTheme}>
      {/* Android: YouTube 방문 → CookieManager에 쿠키 적재 → yt-dlp 403 회피 */}
      <NrmYoutubeCookieHarvester />
      <NrmYoutubeDecipherHost />
      <NrmGoogleTranslateHost />
      <NrmUserBanGate>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: rootBackground },
          }}>
          <Stack.Screen name="index" />
        </Stack>
      </NrmUserBanGate>
      {/* 마지막에 두어 웹에서 다른 Modal(메뉴 드로어)보다 알림이 위에 쌓이게 함 */}
      <NrmNotifyHost />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <NrmUiAppearanceProvider>
      <RootLayoutInner />
    </NrmUiAppearanceProvider>
  );
}
