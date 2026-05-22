import { StyleSheet, View } from 'react-native';
import WebView from 'react-native-webview';

import { NRM_CHARTS_SPOTIFY_URL } from '@/lib/nrmSpotifyChartsPlatform';
import {
  NRM_SPOTIFY_CHARTS_HARVEST_BEFORE_JS,
  NRM_SPOTIFY_CHARTS_HARVEST_JS,
  useSpotifyChartsTokenHarvest,
} from '@/lib/useSpotifyChartsTokenHarvest';
import type { SpotifyChartsSessionSave } from '@/lib/nrmSpotifyChartsSession';

type Props = {
  onLoginComplete: (payload: SpotifyChartsSessionSave) => void;
};

export function NrmSpotifyChartsLoginWebView({ onLoginComplete }: Props) {
  const { webRef, onNavigation, onLoadEnd, onMessage } = useSpotifyChartsTokenHarvest({
    onCaptured: (bearerToken) => onLoginComplete({ bearerToken }),
    // onNeedsLogin 미제공 → 로그인 페이지를 사용자에게 그대로 보여줌
  });

  return (
    <View style={styles.wrap}>
      <WebView
        ref={webRef}
        style={styles.webview}
        source={{ uri: NRM_CHARTS_SPOTIFY_URL }}
        originWhitelist={['https://*']}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        setSupportMultipleWindows={false}
        onNavigationStateChange={onNavigation}
        onLoadEnd={onLoadEnd}
        onMessage={onMessage}
        injectedJavaScriptBeforeContentLoaded={NRM_SPOTIFY_CHARTS_HARVEST_BEFORE_JS}
        injectedJavaScript={NRM_SPOTIFY_CHARTS_HARVEST_JS}
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
