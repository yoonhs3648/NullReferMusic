import { Platform } from 'react-native';

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
import { nrmSearchNotConfiguredMessage } from '@/lib/nrmSearchStrings';
import { confirmUser } from '@/lib/nrmUserNotify';

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
    { cancelLabel: '취소', confirmLabel: '설정 열기' },
  );
  if (go) {
    onOpenTokenSettings();
  }
  return false;
}

/**
 * 메뉴 → Spotify 차트 진입 게이트.
 * - Android: Bearer 없거나 무효면 WebView 로그인 오버레이를 띄우고, 성공 시 true (차트 진입)
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
    return onAndroidRenew();
  }

  const go = await confirmUser(
    `${nrmChartsSpotifyChartsSessionMessage}\n\n지금 Charts 세션 설정을 열까요?`,
    { cancelLabel: '취소', confirmLabel: '설정 열기' },
  );
  if (go) {
    onOpenChartsSession();
  }
  return false;
}

/** 실시간 차트 Bearer 만료·인증 실패 — Android는 WebView 갱신(dialog 없음), 그 외는 설정 이동 */
export async function promptSpotifyChartsBearerExpired(handlers: {
  onOpenChartsSession: () => void;
  onAndroidRenew?: () => Promise<boolean>;
}): Promise<boolean> {
  if (Platform.OS === 'android' && handlers.onAndroidRenew) {
    return handlers.onAndroidRenew();
  }

  const go = await confirmUser('토큰이 만료되었습니다. 갱신하시겠습니까?', {
    cancelLabel: '취소',
    confirmLabel: '갱신',
  });
  if (!go) return false;

  handlers.onOpenChartsSession();
  return false;
}

/** @deprecated promptSpotifyChartsBearerExpired 사용 */
export async function promptSpotifyChartsSessionExpired(
  onOpenChartsSession: () => void,
): Promise<void> {
  await promptSpotifyChartsBearerExpired({ onOpenChartsSession });
}

export async function ensureSearchApiAccess(
  onOpenTokenSettings: () => void,
): Promise<boolean> {
  if (await hasLastfmChartAccess()) {
    return true;
  }
  const go = await confirmUser(
    `${nrmSearchNotConfiguredMessage}\n\n지금 토큰 설정 화면을 열까요?`,
    { cancelLabel: '취소', confirmLabel: '설정 열기' },
  );
  if (go) {
    onOpenTokenSettings();
  }
  return false;
}

export async function ensureLastfmChartAccess(
  onOpenTokenSettings: () => void,
): Promise<boolean> {
  if (await hasLastfmChartAccess()) {
    return true;
  }
  const go = await confirmUser(
    `${nrmChartsLastfmNotConfiguredMessage}\n\n지금 토큰 설정 화면을 열까요?`,
    { cancelLabel: '취소', confirmLabel: '설정 열기' },
  );
  if (go) {
    onOpenTokenSettings();
  }
  return false;
}
