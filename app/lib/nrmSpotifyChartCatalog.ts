export type SpotifyChartTabId =
  | 'top100-kr-daily'
  | 'top100-kr-weekly'
  | 'top100-global-daily'
  | 'top100-global-weekly';

export type SpotifyChartTab = {
  id: SpotifyChartTabId;
  label: string;
  /** charts.spotify.com 직접 API(APK)에서 slug 미제공·미지원 */
  chartsDirectSupported?: boolean;
};

export const NRM_SPOTIFY_CHART_TABS: SpotifyChartTab[] = [
  { id: 'top100-kr-daily',      label: 'Top 100 - Korea Daily',   chartsDirectSupported: true },
  { id: 'top100-kr-weekly',     label: 'Top 100 - Korea Weekly',  chartsDirectSupported: true },
  { id: 'top100-global-daily',  label: 'Top 100 - Global Daily',  chartsDirectSupported: true },
  { id: 'top100-global-weekly', label: 'Top 100 - Global Weekly', chartsDirectSupported: true },
];

export function isSpotifyChartsDirectTabSupported(tab: SpotifyChartTabId): boolean {
  const row = NRM_SPOTIFY_CHART_TABS.find((t) => t.id === tab);
  return row?.chartsDirectSupported !== false;
}

export const NRM_SPOTIFY_CHART_DEFAULT_TAB: SpotifyChartTabId = 'top100-kr-daily';

export type SpotifyChartSource = 'official' | 'charts';
