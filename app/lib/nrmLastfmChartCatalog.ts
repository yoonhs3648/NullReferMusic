export type LastfmChartTabId = 'top100-kr' | 'top100-global';

export type LastfmChartTab = {
  id: LastfmChartTabId;
  label: string;
};

export const NRM_LASTFM_CHART_TABS: LastfmChartTab[] = [
  { id: 'top100-kr',     label: 'Top 100 - Korea' },
  { id: 'top100-global', label: 'Top 100 - Global' },
];

export const NRM_LASTFM_CHART_DEFAULT_TAB: LastfmChartTabId = 'top100-kr';
