import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import WebView from 'react-native-webview';

import { NRM_CHARTS_SPOTIFY_URL } from '@/lib/nrmSpotifyChartsPlatform';
import { NRM_SPOTIFY_WEBVIEW_USER_AGENT } from '@/lib/nrmSpotifyChartsWebViewConfig';
import {
  NRM_SPOTIFY_CHARTS_HARVEST_BEFORE_JS,
  NRM_SPOTIFY_CHARTS_HARVEST_JS,
  useSpotifyChartsTokenHarvest,
} from '@/lib/useSpotifyChartsTokenHarvest';

const SILENT_TIMEOUT_MS = 3500;

type Props = {
  active: boolean;
  onCaptured: (bearerToken: string) => void;
  onNeedsLogin: () => void;
};

/**
 * 사용자에게 보이지 않는 WebView — charts.spotify.com에 이미 로그인된 경우
 * Bearer 토큰을 자동 획득합니다.
 * - 토큰 획득 성공: onCaptured(bearerToken)
 * - accounts.spotify.com 리디렉션 또는 타임아웃: onNeedsLogin()
 */
export function NrmSpotifyChartsSilentCapture({ active, onCaptured, onNeedsLogin }: Props) {
  const { webRef, onNavigation, onLoadEnd, onMessage, onHttpError, resetForNewCapture } =
    useSpotifyChartsTokenHarvest({
      onCaptured,
      onNeedsLogin,
      silentTimeoutMs: SILENT_TIMEOUT_MS,
    });

  useEffect(() => {
    if (!active) return;
    resetForNewCapture();
  }, [active, resetForNewCapture]);

  if (!active) return null;

  return (
    <View style={styles.hidden} pointerEvents="none">
      <WebView
        ref={webRef}
        style={styles.webview}
        source={{ uri: NRM_CHARTS_SPOTIFY_URL }}
        userAgent={NRM_SPOTIFY_WEBVIEW_USER_AGENT}
        originWhitelist={['https://*']}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        setSupportMultipleWindows={false}
        onNavigationStateChange={onNavigation}
        onLoadEnd={onLoadEnd}
        onMessage={onMessage}
        onHttpError={onHttpError}
        injectedJavaScriptBeforeContentLoaded={NRM_SPOTIFY_CHARTS_HARVEST_BEFORE_JS}
        injectedJavaScript={NRM_SPOTIFY_CHARTS_HARVEST_JS}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: {
    position: 'absolute',
    width: 1,
    height: 1,
    top: -9999,
    left: -9999,
    overflow: 'hidden',
    opacity: 0,
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
