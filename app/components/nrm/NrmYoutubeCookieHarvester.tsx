/**
 * 숨겨진 WebView로 YouTube 홈을 방문해 세션 쿠키를 Android CookieManager에 적재합니다.
 *
 * 동작 방식
 * ─────────
 * 1. 앱 마운트 시 youtube.com 을 백그라운드 WebView로 방문
 * 2. 페이지 로드 완료 → Android CookieManager에 YouTube 쿠키(VISITOR_INFO1_LIVE, YSC 등) 저장됨
 * 3. 이후 다운로드 시 OnDeviceDownloadModule 이 CookieManager.getCookie() 로 쿠키 수집
 *    → Netscape 파일 → yt-dlp --cookies 로 전달 → 403 회피
 *
 * iOS / 웹
 * ────────
 * - iOS: WebView는 렌더링되지만 yt-dlp 경로에서는 쿠키를 사용하지 않으므로 no-op
 * - 웹: null 반환
 *
 * 주의
 * ────
 * - YouTube 계정으로 로그인한 쿠키가 있으면 더욱 효과적입니다.
 * - 로그인 없이도 방문 세션 쿠키(VISITOR_INFO1_LIVE 등)만으로 403 회피에 도움이 됩니다.
 * - 데이터 사용량: YouTube 홈 방문 1회 (~1-2 MB, 최초 1회만)
 */
import { useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import WebView from 'react-native-webview';

const YT_SEED_URL = 'https://www.youtube.com/';

export function NrmYoutubeCookieHarvester() {
  const [done, setDone] = useState(false);
  const timedOut = useRef(false);

  if (Platform.OS === 'web') return null;
  // 쿠키 수집 완료 후에는 WebView를 DOM에서 제거합니다.
  if (done) return null;

  return (
    <View style={styles.host} pointerEvents="none" collapsable={false}>
      <WebView
        style={styles.wv}
        source={{ uri: YT_SEED_URL }}
        originWhitelist={['https://*']}
        javaScriptEnabled
        domStorageEnabled
        // 시스템 쿠키 저장소(CookieManager)와 공유 — 핵심 설정
        sharedCookiesEnabled
        // 로그인 쿠키도 유지되도록 thirdPartyCookiesEnabled 허용
        thirdPartyCookiesEnabled
        // 자동 미디어 재생 방지
        mediaPlaybackRequiresUserAction
        // 페이지 로드 완료 → done = true → unmount
        onLoadEnd={() => {
          if (!timedOut.current) {
            setDone(true);
          }
        }}
        onError={() => {
          setDone(true);
        }}
        onHttpError={() => {
          setDone(true);
        }}
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
  wv: { width: 1, height: 1 },
});
