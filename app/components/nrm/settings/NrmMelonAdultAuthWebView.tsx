import { useCallback } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import WebView from 'react-native-webview';
import type { WebViewNavigation } from 'react-native-webview';

import { NRM_MELON_LOGIN_URL } from '@/lib/nrmMelonAdultPlatform';
import { melonCookieHeaderHasLogin } from '@/lib/nrmMelonAdultSession';
import { hasNrmMelonCookieNativeModule, readMelonLoginCookieHeader } from '@/lib/nrmMelonCookie';

/** 모바일 UA — KakaoTalk 등 소셜 로그인 버튼 노출 */
const MELON_MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

type Props = {
  sessionKey?: number;
  /** melon.com 에서 MLCP 쿠키가 감지되면 호출 — WebView 자동 닫기에 사용 */
  onCookieCaptured?: (cookieHeader: string) => void;
};

export function NrmMelonAdultAuthWebView({ sessionKey = 0, onCookieCaptured }: Props) {
  const checkCookieOnNavigation = useCallback(
    async (nav: WebViewNavigation) => {
      if (!hasNrmMelonCookieNativeModule()) return;
      const url = nav.url ?? '';
      if (!url.includes('melon.com')) return;
      const cookie = await readMelonLoginCookieHeader();
      if (cookie && melonCookieHeaderHasLogin(cookie)) {
        onCookieCaptured?.(cookie);
      }
    },
    [onCookieCaptured],
  );

  return (
    <View style={styles.wrap}>
      <WebView
        key={sessionKey}
        style={styles.webview}
        cacheEnabled={false}
        incognito={false}
        source={{ uri: NRM_MELON_LOGIN_URL }}
        userAgent={MELON_MOBILE_UA}
        applicationNameForUserAgent=""
        originWhitelist={['https://*', 'http://*']}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        setSupportMultipleWindows={false}
        allowsInlineMediaPlayback
        onNavigationStateChange={(nav) => {
          void checkCookieOnNavigation(nav);
        }}
        onShouldStartLoadWithRequest={(req) => {
          // kakao/intent 계열 스킴은 외부 앱으로 열기
          if (
            req.url.startsWith('kakaotalk://') ||
            req.url.startsWith('kakaolink://') ||
            req.url.startsWith('intent://')
          ) {
            void Linking.openURL(req.url).catch(() => {});
            return false;
          }
          return req.url.startsWith('https://') || req.url.startsWith('http://');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: '#121212',
  },
  webview: {
    flex: 1,
    backgroundColor: '#121212',
  },
});
