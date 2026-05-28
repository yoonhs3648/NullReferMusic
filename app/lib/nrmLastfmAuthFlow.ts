import type { ChartErrorCode } from '@/lib/nrmChartErrors';
import { promptLastfmChartAuthInvalid } from '@/lib/nrmChartTokenGate';
import { refreshLastfmChartToken } from '@/lib/nrmLastfmTokenSync';
import type { LastfmSearchErrorCode } from '@/lib/nrmLastfmSearchTypes';

export type LastfmAuthErrorCode = ChartErrorCode | LastfmSearchErrorCode;

export type LastfmAuthHandlers = {
  onOpenLastfmTokenSettings: () => void;
  /** Web 제외 — API Key 오류 오버레이 */
  onShowAuthInvalid?: (code?: LastfmAuthErrorCode) => void;
};

export function isLastfmChartAuthErrorCode(code: ChartErrorCode): boolean {
  return (
    code === 'auth_failed' ||
    code === 'not_configured' ||
    code === 'forbidden'
  );
}

export function isLastfmSearchAuthErrorCode(code: LastfmSearchErrorCode): boolean {
  return code === 'auth_failed' || code === 'not_configured';
}

/**
 * Last.fm API 호출 + 토큰 갱신 1회 재시도 후에도 인증 실패 시:
 * - Web: confirm → API 설정
 * - 앱: 오버레이 → API 설정
 */
export async function runLastfmAuthFlow<T extends { ok: boolean }>(
  fetchOnce: () => Promise<T>,
  isAuthError: (result: T) => boolean,
  handlers: LastfmAuthHandlers,
): Promise<T> {
  let result = await fetchOnce();

  if (!isAuthError(result)) {
    return result;
  }

  const refreshed = await refreshLastfmChartToken();
  if (refreshed.ok) {
    result = await fetchOnce();
    if (!isAuthError(result)) {
      return result;
    }
  }

  const promptCode =
    'errorCode' in result && result.errorCode === 'not_configured'
      ? 'not_configured'
      : 'auth_failed';
  await promptLastfmChartAuthInvalid(handlers, promptCode);
  return result;
}
