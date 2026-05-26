import { NrmChartErrorHero } from '@/components/nrm/charts/NrmChartErrorHero';
import type { ChartErrorCode } from '@/lib/nrmChartErrors';
import { isSpotifySearchHeroError } from '@/lib/nrmSpotifySearchUi';

type Props = {
  errorCode: ChartErrorCode | null;
  isDark: boolean;
  paddingHorizontal: number;
};

export function NrmSpotifySearchErrorView({
  errorCode,
  isDark,
  paddingHorizontal,
}: Props) {
  if (!errorCode || !isSpotifySearchHeroError(errorCode)) {
    return null;
  }
  return (
    <NrmChartErrorHero
      isDark={isDark}
      platform="spotify"
      errorCode={errorCode}
      paddingHorizontal={paddingHorizontal}
    />
  );
}
