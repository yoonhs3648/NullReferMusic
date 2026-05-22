export type LastfmChartTabId = 'top50-kr' | 'top50-global';



export type LastfmChartTab = {

  id: LastfmChartTabId;

  label: string;

};



export const NRM_LASTFM_CHART_TABS: LastfmChartTab[] = [

  { id: 'top50-kr', label: 'Top 50 - Korea' },

  { id: 'top50-global', label: 'Top 50 - Global' },

];



export const NRM_LASTFM_CHART_DEFAULT_TAB: LastfmChartTabId = 'top50-kr';

