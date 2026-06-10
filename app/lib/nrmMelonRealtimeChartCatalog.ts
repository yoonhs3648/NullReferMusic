export const NRM_MELON_REALTIME_CHART_TABS = [
  { id: 'top100', label: 'TOP100' },
  { id: 'hot100', label: 'HOT100' },
] as const;

export type MelonRealtimeChartTabId =
  (typeof NRM_MELON_REALTIME_CHART_TABS)[number]['id'];

export const NRM_MELON_REALTIME_CHART_DEFAULT_TAB: MelonRealtimeChartTabId = 'top100';

export const MELON_REALTIME_CHART_URLS: Record<MelonRealtimeChartTabId, string> = {
  top100: 'https://www.melon.com/chart/index.htm',
  hot100: 'https://www.melon.com/chart/hot100/index.htm',
};

export function melonRealtimeChartPlaylistName(tab: MelonRealtimeChartTabId): string {
  return tab === 'hot100' ? 'HOT100' : 'TOP100';
}
