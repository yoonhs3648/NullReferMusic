import type { ChartPlatformIconKey } from '@/lib/nrmChartsPlatforms';

/**
 * 플랫폼 공식 사이트·CDN에서 제공하는 로고/아이콘 URL.
 * - 멜론: https://www.melon.com/ (cdnimg.melon.co.kr)
 * - 지니: https://www.genie.co.kr/ (image.genie.co.kr, parent.css)
 */
export const NRM_CHART_OFFICIAL_ICON_URI: Record<
  ChartPlatformIconKey,
  string | null
> = {
  spotify: null,
  billboard: null,
  youtubeMusic: null,
  melon:
    'https://cdnimg.melon.co.kr/resource/image/web/common/logo_melon142x99.png',
  genie: 'https://image.genie.co.kr/imageg/web/common/logo_genie_5.0.png',
};
