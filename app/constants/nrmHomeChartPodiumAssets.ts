import type { HomeChartPodiumTier } from '@/components/nrm/NrmHomeChartRankCrown';

/** TOP 1·2·3 왕관·월계수 PNG (금·은·동) */
export const HOME_CHART_CROWN_SOURCES: Record<HomeChartPodiumTier, number> = {
  1: require('@/assets/images/home-chart/crown-gold.png'),
  2: require('@/assets/images/home-chart/crown-silver.png'),
  3: require('@/assets/images/home-chart/crown-bronze.png'),
};

export const HOME_CHART_LAUREL_SOURCES: Record<HomeChartPodiumTier, number> = {
  1: require('@/assets/images/home-chart/laurel-gold.png'),
  2: require('@/assets/images/home-chart/laurel-silver.png'),
  3: require('@/assets/images/home-chart/laurel-bronze.png'),
};

export const HOME_CHART_PODIUM_GLOW_SOURCES: Record<HomeChartPodiumTier, number> = {
  1: require('@/assets/images/home-chart/podium-glow-gold.png'),
  2: require('@/assets/images/home-chart/podium-glow-silver.png'),
  3: require('@/assets/images/home-chart/podium-glow-bronze.png'),
};

/** 라이트모드 전용 — 밝은 배경에서도 색이 또렷하게 구분되는 진한 빔 */
export const HOME_CHART_PODIUM_GLOW_SOURCES_LIGHT: Record<HomeChartPodiumTier, number> = {
  1: require('@/assets/images/home-chart/podium-glow-gold-light.png'),
  2: require('@/assets/images/home-chart/podium-glow-silver-light.png'),
  3: require('@/assets/images/home-chart/podium-glow-bronze-light.png'),
};

export const HOME_CHART_RANK_GLINT_SOURCES: Record<HomeChartPodiumTier, number> = {
  1: require('@/assets/images/home-chart/rank-glint-gold.png'),
  2: require('@/assets/images/home-chart/rank-glint-silver.png'),
  3: require('@/assets/images/home-chart/rank-glint-bronze.png'),
};

/** 왕관 PNG 비율 height/width (1024×635) */
export const HOME_CHART_CROWN_ASPECT = 635 / 1024;

/** 스테이지 라이트맵 비율 height/width (1280×900) */
export const HOME_CHART_PODIUM_GLOW_ASPECT = 900 / 1280;

/** 월계수 원본 비율 width/height (1024×682) */
export const HOME_CHART_LAUREL_ASPECT = 1024 / 682;
