import type { ChartTrackItem } from '@/lib/nrmChartsTypes';

export type PeriodChartPagePayload = {
  platform: string;
  playlistId: string;
  playlistName: string;
  market: string;
  fetchedAt: string;
  items: ChartTrackItem[];
  offset: number;
  limit: number;
  hasMore: boolean;
};
