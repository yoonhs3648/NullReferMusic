import { StyleSheet, View } from 'react-native';
import WebView from 'react-native-webview';

import { NRM_SPOTIFY_CHARTS_LOGIN_URL } from '@/lib/nrmSpotifyChartsPlatform';
import { useSpotifyWebViewUserAgent } from '@/lib/useSpotifyWebViewUserAgent';
import {
  NRM_SPOTIFY_CHARTS_HARVEST_BEFORE_JS,
  NRM_SPOTIFY_CHARTS_HARVEST_JS,
  useSpotifyChartsTokenHarvest,
} from '@/lib/useSpotifyChartsTokenHarvest';
import type { SpotifyChartsSessionSave } from '@/lib/nrmSpotifyChartsSession';

type Props = {
  /** 로그아웃 후 WebView 인스턴스·캐시를 비우기 위해 증가시킵니다 */
  sessionKey?: number;
  onLoginComplete: (payload: SpotifyChartsSessionSave) => void;
};

export function NrmSpotifyChartsLoginWebView({ sessionKey = 0, onLoginComplete }: Props) {
  const userAgent = useSpotifyWebViewUserAgent();
  const { webRef, onNavigation, onLoadEnd, onMessage, onHttpError } =
    useSpotifyChartsTokenHarvest({
    onCaptured: (bearerToken) => onLoginComplete({ bearerToken }),
    // onNeedsLogin 미제공 → 로그인 페이지를 사용자에게 그대로 보여줌
  });

  if (!userAgent) return null;

  return (
    <View style={styles.wrap}>
      <WebView
        key={sessionKey}
        ref={webRef}
        style={styles.webview}
        cacheEnabled={false}
        incognito={false}
        source={{ uri: NRM_SPOTIFY_CHARTS_LOGIN_URL }}
        userAgent={userAgent}
        applicationNameForUserAgent=""
        originWhitelist={['https://*', 'http://*']}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        setSupportMultipleWindows={false}
        allowsInlineMediaPlayback
        onNavigationStateChange={onNavigation}
        onLoadEnd={onLoadEnd}
        onMessage={onMessage}
        onHttpError={onHttpError}
        injectedJavaScriptBeforeContentLoaded={NRM_SPOTIFY_CHARTS_HARVEST_BEFORE_JS}
        injectedJavaScript={NRM_SPOTIFY_CHARTS_HARVEST_JS}
        onShouldStartLoadWithRequest={(req) => {
          // https/http 외의 스킴(spotify:// 등)은 WebView 내에서 열지 않음
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
