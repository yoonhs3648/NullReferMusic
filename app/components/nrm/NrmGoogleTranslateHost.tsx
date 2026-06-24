/**
 * Google Translate 웹 자동화 — 숨김 WebView로 translate.google.com을 로드합니다.
 *
 * 레이지 마운트: 네이티브 GTX 번역이 실패해 WebView fallback이 실제로 필요할 때만
 * WebView를 마운트하고, 3분 idle 후 언마운트해 translate.google.com 페이지가
 * 상시 메모리를 차지하는 것을 방지합니다.
 */
import { useCallback, useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import WebView from 'react-native-webview';

import {
  attachGoogleTranslateWebView,
  markGoogleTranslateWebViewLoading,
  markGoogleTranslateWebViewReady,
  registerGoogleTranslateWebViewCallbacks,
  routeGoogleTranslateWebViewMessage,
} from '@/lib/nrmGoogleTranslateBridge';

const GT_URL = 'https://translate.google.com/';

export function NrmGoogleTranslateHost() {
  const [webViewMounted, setWebViewMounted] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    registerGoogleTranslateWebViewCallbacks(
      () => setWebViewMounted(true),
      () => setWebViewMounted(false),
    );
    return () => {
      registerGoogleTranslateWebViewCallbacks(null, null);
    };
  }, []);

  const onLoadStart = useCallback(() => {
    markGoogleTranslateWebViewLoading();
  }, []);

  const onLoadEnd = useCallback(() => {
    markGoogleTranslateWebViewReady();
  }, []);

  const onMessage = useCallback((e: { nativeEvent: { data: string } }) => {
    routeGoogleTranslateWebViewMessage(e.nativeEvent.data);
  }, []);

  if (Platform.OS === 'web' || !webViewMounted) {
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
