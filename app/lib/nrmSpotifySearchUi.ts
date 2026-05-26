import type { ChartErrorCode } from '@/lib/nrmChartErrors';

/** 실시간 차트와 동일한 전체 화면 에러(설정·Premium·인증) */
export function splitSpotifySearchFailure(out: {
  ok: false;
  errorCode: ChartErrorCode;
  message: string;
}): { heroError: ChartErrorCode | null; inlineError: string | null } {
  if (isSpotifySearchHeroError(out.errorCode)) {
    return { heroError: out.errorCode, inlineError: null };
  }
  return { heroError: null, inlineError: out.message };
}

export function isSpotifySearchHeroError(code: ChartErrorCode): boolean {
  return (
    code === 'not_configured' ||
    code === 'auth_failed' ||
    code === 'premium_required' ||
    code === 'forbidden' ||
    code === 'backend_unreachable' ||
    code === 'server' ||
    code === 'unknown'
  );
}
