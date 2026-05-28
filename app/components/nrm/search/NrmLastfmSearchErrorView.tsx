import { NrmChartErrorHero } from '@/components/nrm/charts/NrmChartErrorHero';
import type { ChartErrorCode } from '@/lib/nrmChartErrors';
import type { LastfmSearchErrorCode } from '@/lib/nrmLastfmSearchTypes';
import { isLastfmSearchHeroError } from '@/lib/nrmLastfmSearchUi';

function lastfmSearchHeroChartCode(code: LastfmSearchErrorCode): ChartErrorCode {
  if (code === 'not_configured' || code === 'auth_failed' || code === 'network') {
    return code;
  }
  return 'unknown';
}

type Props = {
  errorCode: LastfmSearchErrorCode | null;
  isDark: boolean;
  paddingHorizontal: number;
};

export function NrmLastfmSearchErrorView({
  errorCode,
  isDark,
  paddingHorizontal,
}: Props) {
  if (!errorCode || !isLastfmSearchHeroError(errorCode)) {
    return null;
  }
  return (
    <NrmChartErrorHero
      isDark={isDark}
      platform="lastfm"
      errorCode={lastfmSearchHeroChartCode(errorCode)}
      paddingHorizontal={paddingHorizontal}
    />
  );
}
