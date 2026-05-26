/** 메뉴 드로어 — 차트 루트·기간별·장르별 패널 */

export type ChartRootMenuPanel = 'chartsHub' | 'charts' | 'periodCharts' | 'genreCharts';

export type PeriodChartMenuPanel = 'periodCharts' | 'periodChartLastfm' | 'periodChartSpotify';

export type GenreChartMenuPanel = 'genreCharts';

export function isChartRootHubPanel(panel: string): panel is ChartRootMenuPanel {
  return (
    panel === 'chartsHub' ||
    panel === 'charts' ||
    panel === 'periodCharts' ||
    panel === 'genreCharts'
  );
}

export function isPeriodChartMenuPanel(panel: string): panel is PeriodChartMenuPanel {
  return (
    panel === 'periodCharts' ||
    panel === 'periodChartLastfm' ||
    panel === 'periodChartSpotify'
  );
}

export function isGenreChartMenuPanel(panel: string): panel is GenreChartMenuPanel {
  return panel === 'genreCharts';
}
