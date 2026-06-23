import { StyleSheet, View } from 'react-native';
import WebView from 'react-native-webview';

import { NRM_MELON_LOGIN_URL } from '@/lib/nrmMelonAdultPlatform';

const MELON_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

type Props = {
  sessionKey?: number;
};

export function NrmMelonAdultAuthWebView({ sessionKey = 0 }: Props) {
  return (
    <View style={styles.wrap}>
      <WebView
        key={sessionKey}
        style={styles.webview}
        cacheEnabled={false}
        incognito={false}
        source={{ uri: NRM_MELON_LOGIN_URL }}
        userAgent={MELON_UA}
        applicationNameForUserAgent=""
        originWhitelist={['https://*', 'http://*']}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        setSupportMultipleWindows={false}
        allowsInlineMediaPlayback
        onShouldStartLoadWithRequest={(req) =>
          req.url.startsWith('https://') || req.url.startsWith('http://')
        }
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
