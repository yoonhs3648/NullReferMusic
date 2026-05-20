export type ChartMenuPanel =
  | 'charts'
  | 'chartSpotify'
  | 'chartBillboard'
  | 'chartYoutubeMusic'
  | 'chartMelon'
  | 'chartGenie';

export type ChartPlatformIconKey =
  | 'spotify'
  | 'billboard'
  | 'youtubeMusic'
  | 'melon'
  | 'genie';

export type ChartPlatformRow = {
  panel: ChartMenuPanel;
  label: string;
  subtitle: string;
  implemented: boolean;
  iconKey: ChartPlatformIconKey;
};

export const NRM_CHART_PLATFORM_ROWS: ChartPlatformRow[] = [
  {
    panel: 'chartSpotify',
    label: 'Spotify',
    subtitle: 'TOP 100',
    implemented: true,
    iconKey: 'spotify',
  },
  {
    panel: 'chartBillboard',
    label: 'Billboard',
    subtitle: 'Hot 100',
    implemented: false,
    iconKey: 'billboard',
  },
  {
    panel: 'chartYoutubeMusic',
    label: 'YouTube Music',
    subtitle: '차트',
    implemented: false,
    iconKey: 'youtubeMusic',
  },
  {
    panel: 'chartMelon',
    label: 'Melon',
    subtitle: 'TOP 100',
    implemented: false,
    iconKey: 'melon',
  },
  {
    panel: 'chartGenie',
    label: 'Genie',
    subtitle: 'TOP 100',
    implemented: false,
    iconKey: 'genie',
  },
];

export function isChartMenuPanel(panel: string): panel is ChartMenuPanel {
  return (
    panel === 'charts' ||
    panel === 'chartSpotify' ||
    panel === 'chartBillboard' ||
    panel === 'chartYoutubeMusic' ||
    panel === 'chartMelon' ||
    panel === 'chartGenie'
  );
}
