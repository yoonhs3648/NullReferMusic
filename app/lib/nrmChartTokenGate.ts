import { Platform } from 'react-native';

import type { ChartErrorCode } from '@/lib/nrmChartErrors';
import { chartUserMessage } from '@/lib/nrmChartErrors';
import { hasLastfmChartAccess } from '@/lib/nrmLastfmApiSettings';
import { hasSpotifyChartsSessionAccess } from '@/lib/nrmSpotifyChartsSession';
import { hasSpotifyCredentials } from '@/lib/nrmSpotifyApiSettings';
import {
  getManualSpotifyAccessToken,
  getSpotifyAccessTokenCache,
} from '@/lib/nrmSpotifyApiSettings';
import {
  nrmChartsLastfmNotConfiguredMessage,
  nrmChartsSpotifyChartsSessionMessage,
  nrmChartsSpotifyNotConfiguredMessage,
} from '@/lib/nrmChartsStrings';
import { confirmUser, notifyUser } from '@/lib/nrmUserNotify';

async function hasSpotifyOfficialChartAccess(): Promise<boolean> {
  const manual = await getManualSpotifyAccessToken();
  if (manual) return true;
  const cache = await getSpotifyAccessTokenCache();
  if (cache && cache.expiresAt > Date.now()) return true;
  return hasSpotifyCredentials();
}

export async function ensureSpotifyOfficialChartAccess(
  onOpenTokenSettings: () => void,
): Promise<boolean> {
  if (await hasSpotifyOfficialChartAccess()) {
    return true;
  }
  const go = await confirmUser(
    `${nrmChartsSpotifyNotConfiguredMessage}\n\n지금 토큰 설정 화면을 열까요?`,
    { cancelLabel: '취소', confirmLabel: 'API 설정 열기' },
  );
  if (go) {
    onOpenTokenSettings();
  }
  return false;
}

/**
 * 메뉴 → Spotify 차트 진입 게이트.
 * - Android: Bearer 없거나 무효면 즉시 알림 후 WebView 로그인 오버레이를 띄우고, 성공 시 true (차트 진입)
 * - 그 외: 설정 화면 이동 안내 후 false (차트 진입 차단)
 */
export async function ensureSpotifyChartsSessionAccess(
  onOpenChartsSession: () => void,
  onAndroidRenew?: () => Promise<boolean>,
): Promise<boolean> {
  if (await hasSpotifyChartsSessionAccess()) {
    return true;
  }

  if (Platform.OS === 'android' && onAndroidRenew) {
    notifyUser('Spotify 세션 토큰이 없거나 유효하지 않습니다. 로그인 화면을 엽니다.');
    return onAndroidRenew();
  }

  const go = await confirmUser(
    `${nrmChartsSpotifyChartsSessionMessage}\n\n지금 Charts 세션 설정을 열까요?`,
    { cancelLabel: '취소', confirmLabel: 'API 설정 열기' },
  );
  if (go) {
    onOpenChartsSession();
  }
  return false;
}

/** Web 제외 — APK·Expo Go(iOS/Android) Charts Bearer WebView 로그인 UI */
export function usesSpotifyChartsWebViewBearerUi(): boolean {
  return Platform.OS === 'android' || Platform.OS === 'ios';
}

/** Charts API(실시간·기간별·장르별) 인증 실패 코드 */
export function isSpotifyChartsAuthErrorCode(code: ChartErrorCode): boolean {
  return (
    code === 'auth_failed' ||
    code === 'charts_session' ||
    code === 'forbidden' ||
    code === 'premium_required'
  );
}

/**
 * Bearer 만료 시 1차 갱신 — 네이티브(Android/iOS) WebView만. Web은 false.
 */
export async function renewSpotifyChartsBearerSilently(
  onRenew?: () => Promise<boolean>,
): Promise<boolean> {
  if (!usesSpotifyChartsWebViewBearerUi() || !onRenew) {
    return false;
  }
  return onRenew();
}

/**
 * 1차 갱신·재시도 후에도 인증 실패할 때만 호출.
 * - Web: confirm 다이얼로그(1번) → API 설정
 * - APK·Expo Go: WebView 로그인 모달(만료 문구)
 */
export async function promptSpotifyChartsBearerInvalid(handlers?: {
  onOpenChartsSession?: () => void;
  /** 네이티브 전용 — WebView 로그인 모달 */
  onShowBearerExpired?: () => void;
}): Promise<void> {
  const message = chartUserMessage('spotify', 'auth_failed');

  if (usesSpotifyChartsWebViewBearerUi() && handlers?.onShowBearerExpired) {
    handlers.onShowBearerExpired();
    return;
  }

  if (!handlers?.onOpenChartsSession) {
    notifyUser(message);
    return;
  }
  const go = await confirmUser(
    `${message}\n\nAPI 설정에서 Charts Bearer를 다시 등록할까요?`,
    { cancelLabel: '닫기', confirmLabel: 'API 설정 열기' },
  );
  if (go) {
    handlers.onOpenChartsSession();
  }
}

type LastfmGateHandlers = {
  onOpenLastfmTokenSettings: () => void;
  onShowAuthInvalid?: (code?: 'auth_failed' | 'not_configured') => void;
};

function promptLastfmAuthOnNative(
  handlers: LastfmGateHandlers,
  code: 'auth_failed' | 'not_configured',
): boolean {
  if (Platform.OS !== 'web' && handlers.onShowAuthInvalid) {
    handlers.onShowAuthInvalid(code);
    return true;
  }
  return false;
}

/** Last.fm API Key 만료·오류 — Web: confirm 후 API 설정, 앱: 오버레이 */
export async function promptLastfmChartAuthInvalid(
  handlers: LastfmGateHandlers,
  code: 'auth_failed' | 'not_configured' = 'auth_failed',
): Promise<void> {
  if (promptLastfmAuthOnNative(handlers, code)) {
    return;
  }

  const message = chartUserMessage('lastfm', code);

  const go = await confirmUser(
    `${message}\n\n메뉴 → 앱 설정 → API 설정 → Last.fm API 토큰 관리로 이동할까요?`,
    { cancelLabel: '닫기', confirmLabel: 'API 설정 열기' },
  );
  if (go) {
    handlers.onOpenLastfmTokenSettings();
  }
}

/**
 * @deprecated renewSpotifyChartsBearerSilently + promptSpotifyChartsBearerInvalid 사용
 */
export async function promptSpotifyChartsBearerExpired(handlers: {
  onOpenChartsSession: () => void;
  onAndroidRenew?: () => Promise<boolean>;
}): Promise<boolean> {
  return renewSpotifyChartsBearerSilently(handlers.onAndroidRenew);
}

/** @deprecated promptSpotifyChartsBearerInvalid 사용 */
export async function promptSpotifyChartsSessionExpired(
  onOpenChartsSession: () => void,
): Promise<void> {
  await promptSpotifyChartsBearerInvalid({ onOpenChartsSession });
}

/** Spotify 검색 — 공식 Web API (Client ID·Secret / Bearer) */
export async function ensureSpotifySearchApiAccess(
  onOpenTokenSettings: () => void,
): Promise<boolean> {
  return ensureSpotifyOfficialChartAccess(onOpenTokenSettings);
}

export async function ensureSearchApiAccess(
  handlers: LastfmGateHandlers,
): Promise<boolean> {
  return ensureLastfmChartAccess(handlers);
}

export async function ensureLastfmChartAccess(
  handlers: LastfmGateHandlers,
): Promise<boolean> {
  if (await hasLastfmChartAccess()) {
    return true;
  }
  if (promptLastfmAuthOnNative(handlers, 'not_configured')) {
    return false;
  }
  const go = await confirmUser(
    `${nrmChartsLastfmNotConfiguredMessage}\n\n지금 토큰 설정 화면을 열까요?`,
    { cancelLabel: '취소', confirmLabel: 'API 설정 열기' },
  );
  if (go) {
    handlers.onOpenLastfmTokenSettings();
  }
  return false;
}
