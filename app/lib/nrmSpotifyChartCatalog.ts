export type SpotifyChartTabId =
  | 'top50-kr'
  | 'viral50-kr'
  | 'top50-global'
  | 'viral50-global';

export type SpotifyChartTab = {
  id: SpotifyChartTabId;
  label: string;
};

export const NRM_SPOTIFY_CHART_TABS: SpotifyChartTab[] = [
  { id: 'top50-kr', label: 'Top 50 - Korea' },
  { id: 'viral50-kr', label: 'Viral 50 - Korea' },
  { id: 'top50-global', label: 'Top 50 - Global' },
  { id: 'viral50-global', label: 'Viral 50 - Global' },
];

export const NRM_SPOTIFY_CHART_DEFAULT_TAB: SpotifyChartTabId = 'top50-kr';

export type SpotifyChartSource = 'official' | 'charts';
