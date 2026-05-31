import '@/lib/nrmDomMinimalPolyfills';
import '@/lib/nrmMetroLogBootstrap';
import '@/lib/nrmFileLogBootstrap';
import { ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import 'react-native-reanimated';

import { NrmNotifyHost } from '@/components/nrm/NrmNotifyHost';
import { NrmYoutubeCookieHarvester } from '@/components/nrm/NrmYoutubeCookieHarvester';
import { NrmYoutubeDecipherHost } from '@/components/nrm/NrmYoutubeDecipherHost';
import {
  NrmUiAppearanceProvider,
  useNrmUiAppearance,
} from '@/context/NrmUiAppearanceContext';
import { getNrmNavigationTheme } from '@/constants/nrmNavigationTheme';
import { getNrmRootBackgroundColor } from '@/lib/nrmUiAppearanceColors';

export { ErrorBoundary } from 'expo-router';

function RootLayoutInner() {
  const { isDark } = useNrmUiAppearance();
  const navigationTheme = getNrmNavigationTheme(isDark ? 'dark' : 'light');
  const rootBackground = getNrmRootBackgroundColor(isDark);

  return (
    <ThemeProvider value={navigationTheme}>
      {/* Android: YouTube 방문 → CookieManager에 쿠키 적재 → yt-dlp 403 회피 */}
      <NrmYoutubeCookieHarvester />
      <NrmYoutubeDecipherHost />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: rootBackground },
        }}>
        <Stack.Screen name="index" />
      </Stack>
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
