import type { ChartErrorCode } from '@/lib/nrmChartErrors';
import type { LastfmSearchErrorCode } from '@/lib/nrmLastfmSearchTypes';

/** 차트·검색 공통 — 인증·설정 오류는 전체 화면(히어로) */
export function isLastfmSearchHeroError(
  code: ChartErrorCode | LastfmSearchErrorCode,
): boolean {
  return (
    code === 'not_configured' ||
    code === 'auth_failed' ||
    code === 'forbidden' ||
    code === 'backend_unreachable' ||
    code === 'server' ||
    code === 'unknown'
  );
}

export function splitLastfmSearchFailure(out: {
  ok: false;
  errorCode: LastfmSearchErrorCode;
  message: string;
}): { heroError: LastfmSearchErrorCode | null; inlineError: string | null } {
  if (isLastfmSearchHeroError(out.errorCode)) {
    return { heroError: out.errorCode, inlineError: null };
  }
  return { heroError: null, inlineError: out.message };
}
