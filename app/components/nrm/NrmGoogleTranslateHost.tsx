/**
 * Google Translate 웹 자동화 — 숨김 WebView로 translate.google.com을 로드합니다.
 */
import { useCallback } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import WebView from 'react-native-webview';

import {
  attachGoogleTranslateWebView,
  markGoogleTranslateWebViewLoading,
  markGoogleTranslateWebViewReady,
  routeGoogleTranslateWebViewMessage,
} from '@/lib/nrmGoogleTranslateBridge';

const GT_URL = 'https://translate.google.com/';

export function NrmGoogleTranslateHost() {
  const onLoadStart = useCallback(() => {
    markGoogleTranslateWebViewLoading();
  }, []);

  const onLoadEnd = useCallback(() => {
    markGoogleTranslateWebViewReady();
  }, []);

  const onMessage = useCallback((e: { nativeEvent: { data: string } }) => {
    routeGoogleTranslateWebViewMessage(e.nativeEvent.data);
  }, []);

  if (Platform.OS === 'web') {
    return null;
  }

  return (
    <View style={styles.host} pointerEvents="none" collapsable={false}>
      <WebView
        ref={(r) => attachGoogleTranslateWebView(r)}
        style={styles.web}
        source={{ uri: GT_URL }}
        originWhitelist={['https://*']}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        onLoadStart={onLoadStart}
        onLoadEnd={onLoadEnd}
        onMessage={onMessage}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    overflow: 'hidden',
    left: -9999,
    top: -9999,
  },
  web: {
    width: 1,
    height: 1,
    opacity: 0,
  },
});
