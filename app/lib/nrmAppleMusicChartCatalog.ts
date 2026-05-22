export type AppleMusicChartTabId = 'top100-kr' | 'top100-global';

export type AppleMusicChartTab = {
  id: AppleMusicChartTabId;
  label: string;
};

export const NRM_APPLE_MUSIC_CHART_TABS: AppleMusicChartTab[] = [
  { id: 'top100-kr', label: 'Top 100 - Korea' },
  { id: 'top100-global', label: 'Top 100 - Global' },
];

export const NRM_APPLE_MUSIC_CHART_DEFAULT_TAB: AppleMusicChartTabId = 'top100-kr';
