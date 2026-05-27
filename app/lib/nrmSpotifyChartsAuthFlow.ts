import type { ChartErrorCode } from '@/lib/nrmChartErrors';
import {
  isSpotifyChartsAuthErrorCode,
  promptSpotifyChartsBearerInvalid,
  renewSpotifyChartsBearerSilently,
} from '@/lib/nrmChartTokenGate';

export type SpotifyChartsAuthHandlers = {
  onOpenChartsSession?: () => void;
  /** 1차 갱신 — Android/iOS(WebView). Web은 사용 안 함 */
  onRenewChartsBearer?: () => Promise<boolean>;
  /** 갱신·재시도 후 실패 — 네이티브 WebView 모달 / Web confirm 다이얼로그 */
  onShowBearerExpired?: () => void;
};

/**
 * Charts API 호출 + Bearer 만료 시:
 * 1) 조용히/모달로 갱신 → 재시도
 * 2) 그래도 인증 실패면 만료 오버레이 (갱신 중 만료 토스트 없음)
 */
export async function runSpotifyChartsAuthFlow<T extends { ok: boolean }>(
  fetchOnce: () => Promise<T>,
  isAuthError: (result: T) => boolean,
  handlers: SpotifyChartsAuthHandlers,
): Promise<T> {
  let result = await fetchOnce();

  if (!isAuthError(result)) {
    return result;
  }

  const renewed = await renewSpotifyChartsBearerSilently(handlers.onRenewChartsBearer);
  if (renewed) {
    result = await fetchOnce();
    if (!isAuthError(result)) {
      return result;
    }
  }

  await promptSpotifyChartsBearerInvalid(handlers);
  return result;
}

export function isSpotifyChartsFetchAuthError(
  outcome: { ok: false; errorCode: ChartErrorCode },
): boolean {
  return isSpotifyChartsAuthErrorCode(outcome.errorCode);
}
