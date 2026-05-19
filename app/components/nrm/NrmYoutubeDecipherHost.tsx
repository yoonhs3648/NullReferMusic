/**
 * youtubei `Player.decipher`용 — 네이티브에서만 보이지 않는 WebView를 띄웁니다.
 */
import { useCallback } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import WebView from 'react-native-webview';

import {
  attachDecipherWebView,
  markDecipherWebViewLoading,
  markDecipherWebViewReady,
  routeYoutubeWebViewMessage,
} from '@/lib/nrmYoutubeDecipherBridge';

const BLANK_HTML =
  '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body></body></html>';

// iOS: YouTube iOS 앱 UA로 설정해 decipher/fetch 요청이 iOS 클라이언트처럼 보이게 함.
// Android: yt-dlp가 다운로드를 처리하므로 이 WebView는 decipher에만 사용.
const IOS_YT_UA =
  'com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5 like Mac OS X)';

export function NrmYoutubeDecipherHost() {
  const onLoadStart = useCallback(() => {
    if (Platform.OS !== 'web') {
      markDecipherWebViewLoading();
    }
  }, []);

  const onLoadEnd = useCallback(() => {
    if (Platform.OS !== 'web') {
      markDecipherWebViewReady();
    }
  }, []);

  const onMessage = useCallback((e: { nativeEvent: { data: string } }) => {
    if (Platform.OS !== 'web') {
      routeYoutubeWebViewMessage(e.nativeEvent.data);
    }
  }, []);

  if (Platform.OS === 'web') {
    return null;
  }

  return (
    <View style={styles.host} pointerEvents="none" collapsable={false}>
      <WebView
        ref={(r) => attachDecipherWebView(r)}
        style={styles.web}
        source={{ html: BLANK_HTML }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        // iOS: fetch 요청이 iOS YouTube 앱처럼 보이도록 UA 고정
        userAgent={Platform.OS === 'ios' ? IOS_YT_UA : undefined}
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
    opacity: 0.01,
    overflow: 'hidden',
    left: 0,
    bottom: 0,
  },
  web: { width: 1, height: 1 },
});
