import { useCallback, useEffect, useRef } from 'react';
import type { WebViewMessageEvent, WebViewNavigation } from 'react-native-webview';
import type WebView from 'react-native-webview';

import {
  NRM_SPOTIFY_TOKEN_ENDPOINT,
} from '@/lib/nrmSpotifyChartsPlatform';
import {
  NRM_SPOTIFY_CHARTS_HARVEST_BURST_JS,
  NRM_SPOTIFY_CHARTS_HARVEST_JS,
  NRM_SPOTIFY_CHARTS_HARVEST_BEFORE_JS,
  NRM_SPOTIFY_TOKEN_PAGE_HARVEST_JS,
} from '@/lib/nrmSpotifyChartsLoginInject';

export {
  NRM_SPOTIFY_CHARTS_HARVEST_BEFORE_JS,
  NRM_SPOTIFY_CHARTS_HARVEST_JS,
};

export type TokenHarvestOpts = {
  /** 토큰 수집 성공 */
  onCaptured: (bearerToken: string) => void;
  /**
   * accounts.spotify.com 리디렉션 감지 또는 타임아웃 발생 시 호출.
   * 미제공 시 로그인 페이지를 그냥 통과(사용자에게 직접 보이는 WebView용).
   */
  onNeedsLogin?: () => void;
  /** 제공 시 해당 ms 이후 `onNeedsLogin` 호출 (불가시 모드용) */
  silentTimeoutMs?: number;
};

type HarvestMessage = { type: 'charts_bearer'; bearerToken: string };

function parseHarvestMessage(raw: string): string | null {
  try {
    const data = JSON.parse(raw) as HarvestMessage;
    if (data?.type === 'charts_bearer') {
      const t = data.bearerToken?.trim();
      return t || null;
    }
  } catch {
    // ignore
  }
  return null;
}

function isHost(url: string, hostname: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === hostname || u.hostname.endsWith(`.${hostname}`);
  } catch {
    return false;
  }
}

/**
 * charts.spotify.com에서 Bearer 토큰을 수집하는 공통 WebView 로직 hook.
 *
 * `onNeedsLogin` + `silentTimeoutMs` 를 제공하면 불가시(silent) 모드로 동작하고,
 * 미제공 시 사용자에게 직접 보이는 WebView 모드로 동작합니다.
 */
export function useSpotifyChartsTokenHarvest(opts: TokenHarvestOpts) {
  const { onCaptured, onNeedsLogin, silentTimeoutMs } = opts;

  const webRef = useRef<WebView>(null);
  const finished = useRef(false);
  const burstTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const tokenUrlFallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silentTimeoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigatedToTokenUrl = useRef(false);

  const clearTimers = useCallback(() => {
    if (burstTimer.current) { clearInterval(burstTimer.current); burstTimer.current = null; }
    if (tokenUrlFallbackTimer.current) { clearTimeout(tokenUrlFallbackTimer.current); tokenUrlFallbackTimer.current = null; }
    if (silentTimeoutTimer.current) { clearTimeout(silentTimeoutTimer.current); silentTimeoutTimer.current = null; }
  }, []);

  /** burst·fallback 타이머만 취소 (silentTimeout 은 유지) — 로그인 페이지 체류 중 호출 */
  const pauseHarvestTimers = useCallback(() => {
    if (burstTimer.current) { clearInterval(burstTimer.current); burstTimer.current = null; }
    if (tokenUrlFallbackTimer.current) { clearTimeout(tokenUrlFallbackTimer.current); tokenUrlFallbackTimer.current = null; }
  }, []);

  const finishWithToken = useCallback(
    (bearerToken: string) => {
      if (finished.current || !bearerToken) return;
      finished.current = true;
      clearTimers();
      onCaptured(bearerToken);
    },
    [clearTimers, onCaptured],
  );

  const finishWithNeedsLogin = useCallback(() => {
    if (finished.current || !onNeedsLogin) return;
    finished.current = true;
    clearTimers();
    onNeedsLogin();
  }, [clearTimers, onNeedsLogin]);

  const injectBurst = useCallback(() => {
    webRef.current?.injectJavaScript(NRM_SPOTIFY_CHARTS_HARVEST_BURST_JS);
  }, []);

  const scheduleTokenUrlFallback = useCallback(() => {
    if (tokenUrlFallbackTimer.current || navigatedToTokenUrl.current) return;
    tokenUrlFallbackTimer.current = setTimeout(() => {
      tokenUrlFallbackTimer.current = null;
      if (finished.current || navigatedToTokenUrl.current) return;
      navigatedToTokenUrl.current = true;
      webRef.current?.injectJavaScript(
        `window.location.href = '${NRM_SPOTIFY_TOKEN_ENDPOINT}'; true;`,
      );
    }, 3500);
  }, []);

  const onChartsPageReady = useCallback(
    (url: string) => {
      if (finished.current) return;
      if (!isHost(url, 'charts.spotify.com') && !isHost(url, 'open.spotify.com')) return;
      injectBurst();
      if (!burstTimer.current) {
        burstTimer.current = setInterval(injectBurst, 1000);
      }
      scheduleTokenUrlFallback();
    },
    [injectBurst, scheduleTokenUrlFallback],
  );

  const onTokenPageReady = useCallback(() => {
    if (finished.current) return;
    webRef.current?.injectJavaScript(NRM_SPOTIFY_TOKEN_PAGE_HARVEST_JS);
  }, []);

  const handleUrl = useCallback(
    (url: string, loading: boolean) => {
      if (finished.current || !url || loading) return;
      if (isHost(url, 'accounts.spotify.com')) {
        // 로그인 페이지에 도달하면 harvest 타이머를 모두 중단해
        // 타이머가 강제로 페이지를 이동시키지 않도록 함
        pauseHarvestTimers();
        // silent 모드: 로그인 필요 즉시 보고
        // visible 모드: 사용자가 직접 로그인하도록 그냥 통과
        if (onNeedsLogin) finishWithNeedsLogin();
        return;
      }
      if (
        url.startsWith(NRM_SPOTIFY_TOKEN_ENDPOINT) ||
        /open\.spotify\.com\/get_access_token/.test(url)
      ) {
        onTokenPageReady();
        return;
      }
      if (isHost(url, 'charts.spotify.com') || isHost(url, 'open.spotify.com')) {
        onChartsPageReady(url);
      }
    },
    [pauseHarvestTimers, finishWithNeedsLogin, onNeedsLogin, onChartsPageReady, onTokenPageReady],
  );

  const onNavigation = useCallback(
    (nav: WebViewNavigation) => handleUrl(nav.url, nav.loading),
    [handleUrl],
  );

  const onLoadEnd = useCallback(
    (e: { nativeEvent: { url: string } }) => handleUrl(e.nativeEvent.url, false),
    [handleUrl],
  );

  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      if (finished.current) return;
      const token = parseHarvestMessage(e.nativeEvent.data);
      if (token) finishWithToken(token);
    },
    [finishWithToken],
  );

  /** silent 모드: active 상태 전환 시 타이머 초기화 */
  const resetForNewCapture = useCallback(() => {
    finished.current = false;
    navigatedToTokenUrl.current = false;
    clearTimers();
    if (silentTimeoutMs && onNeedsLogin) {
      silentTimeoutTimer.current = setTimeout(() => {
        silentTimeoutTimer.current = null;
        finishWithNeedsLogin();
      }, silentTimeoutMs);
    }
  }, [clearTimers, finishWithNeedsLogin, onNeedsLogin, silentTimeoutMs]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  return {
    webRef,
    onNavigation,
    onLoadEnd,
    onMessage,
    resetForNewCapture,
    pauseHarvestTimers,
  };
}
