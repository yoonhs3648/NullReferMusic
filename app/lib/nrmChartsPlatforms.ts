export type ChartMenuPanel =
  | 'charts'
  | 'chartAppleMusic'
  | 'chartSpotifyCharts'
  | 'chartSpotifyOfficial'
  | 'chartLastfm'
  | 'chartBillboard'
  | 'chartYoutubeMusic'
  | 'chartMelon'
  | 'chartGenie';

export type ChartPlatformIconKey =
  | 'appleMusic'
  | 'spotify'
  | 'lastfm'
  | 'billboard'
  | 'youtubeMusic'
  | 'melon'
  | 'genie';

export type ChartPlatformRow = {
  panel: ChartMenuPanel;
  /** 실시간 차트 메뉴 표시 순서 (오름차순) */
  sortOrder: number;
  label: string;
  /** true면 메뉴에서 선택 가능 */
  enabled: boolean;
  iconKey: ChartPlatformIconKey;
};

/** 메뉴·문서와 동일한 플랫폼 정의 (배열 literal 순서와 무관하게 sortOrder로 정렬) */
const NRM_CHART_PLATFORM_ROWS_RAW: ChartPlatformRow[] = [
  {
    panel: 'chartSpotifyCharts',
    sortOrder: 10,
    label: 'Spotify',
    enabled: true,
    iconKey: 'spotify',
  },
  {
    panel: 'chartSpotifyOfficial',
    sortOrder: 20,
    label: 'Spotify (Premium)',
    enabled: true,
    iconKey: 'spotify',
  },
  {
    panel: 'chartAppleMusic',
    sortOrder: 30,
    label: 'Apple Music',
    enabled: true,
    iconKey: 'appleMusic',
  },
  {
    panel: 'chartLastfm',
    sortOrder: 40,
    label: 'Last.fm',
    enabled: true,
    iconKey: 'lastfm',
  },
  {
    panel: 'chartMelon',
    sortOrder: 50,
    label: 'Melon',
    enabled: false,
    iconKey: 'melon',
  },
  {
    panel: 'chartYoutubeMusic',
    sortOrder: 60,
    label: 'YouTube Music',
    enabled: false,
    iconKey: 'youtubeMusic',
  },
  {
    panel: 'chartGenie',
    sortOrder: 70,
    label: 'Genie',
    enabled: false,
    iconKey: 'genie',
  },
  {
    panel: 'chartBillboard',
    sortOrder: 80,
    label: 'Billboard',
    enabled: false,
    iconKey: 'billboard',
  },
];

export function getNrmChartPlatformRows(): ChartPlatformRow[] {
  return [...NRM_CHART_PLATFORM_ROWS_RAW].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
}

/** @deprecated getNrmChartPlatformRows() 사용 */
export const NRM_CHART_PLATFORM_ROWS = getNrmChartPlatformRows();

export function isChartMenuPanel(panel: string): panel is ChartMenuPanel {
  return (
    panel === 'charts' ||
    panel === 'chartAppleMusic' ||
    panel === 'chartSpotifyCharts' ||
    panel === 'chartSpotifyOfficial' ||
    panel === 'chartLastfm' ||
    panel === 'chartBillboard' ||
    panel === 'chartYoutubeMusic' ||
    panel === 'chartMelon' ||
    panel === 'chartGenie'
  );
}
