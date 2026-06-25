import { Linking, StyleSheet, View } from 'react-native';
import WebView from 'react-native-webview';

import { NRM_MELON_LOGIN_URL, NRM_MELON_MOBILE_UA } from '@/lib/nrmMelonAdultPlatform';

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
        userAgent={NRM_MELON_MOBILE_UA}
        applicationNameForUserAgent=""
        originWhitelist={['https://*', 'http://*']}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        setSupportMultipleWindows={false}
        allowsInlineMediaPlayback
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
