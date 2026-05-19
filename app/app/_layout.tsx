import '@/lib/nrmDomMinimalPolyfills';
import '@/lib/nrmMetroLogBootstrap';
import { ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';
import 'react-native-reanimated';

import { NrmNotifyHost } from '@/components/nrm/NrmNotifyHost';
import { NrmYoutubeCookieHarvester } from '@/components/nrm/NrmYoutubeCookieHarvester';
import { NrmYoutubeDecipherHost } from '@/components/nrm/NrmYoutubeDecipherHost';
import { getNrmNavigationTheme } from '@/constants/nrmNavigationTheme';

export { ErrorBoundary } from 'expo-router';

export default function RootLayout() {
  const scheme = useColorScheme();
  const navigationTheme = getNrmNavigationTheme(scheme);

  return (
    <ThemeProvider value={navigationTheme}>
      <NrmNotifyHost />
      {/* Android: YouTube 방문 → CookieManager에 쿠키 적재 → yt-dlp 403 회피 */}
      <NrmYoutubeCookieHarvester />
      <NrmYoutubeDecipherHost />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
      </Stack>
    </ThemeProvider>
  );
}
