import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ChartPlatformIconKey } from '@/lib/nrmChartsPlatforms';
import { hasLastfmChartAccess } from '@/lib/nrmLastfmApiSettings';
import { hasSpotifyChartsSessionAccess } from '@/lib/nrmSpotifyChartsSession';

export const NRM_MAIN_PAGE_CHART_SOURCE_OPTIONS = [
  {
    id: 'melon-top100',
    label: 'Melon Top 100',
    iconKey: 'melon' as const,
    tokenPlatform: null,
  },
  {
    id: 'melon-hot100',
    label: 'Melon Hot 100',
    iconKey: 'melon' as const,
    tokenPlatform: null,
  },
  {
    id: 'spotify-top100-kr',
    label: 'Spotify Top 100 Korea',
    iconKey: 'spotify' as const,
    tokenPlatform: 'spotify' as const,
  },
  {
    id: 'spotify-top100-global',
    label: 'Spotify Top 100 Global',
    iconKey: 'spotify' as const,
    tokenPlatform: 'spotify' as const,
  },
  {
    id: 'apple-top100-kr',
    label: 'Apple Music Top 100 Korea',
    iconKey: 'appleMusic' as const,
    tokenPlatform: null,
  },
  {
    id: 'apple-top100-global',
    label: 'Apple Music Top 100 Global',
    iconKey: 'appleMusic' as const,
    tokenPlatform: null,
  },
  {
    id: 'lastfm-top100-kr',
    label: 'Last.fm Top 100 Korea',
    iconKey: 'lastfm' as const,
    tokenPlatform: 'lastfm' as const,
  },
  {
    id: 'lastfm-top100-global',
    label: 'Last.fm Top 100 Global',
    iconKey: 'lastfm' as const,
    tokenPlatform: 'lastfm' as const,
  },
] as const;

export type NrmMainPageChartSource =
  (typeof NRM_MAIN_PAGE_CHART_SOURCE_OPTIONS)[number]['id'];

export type NrmMainPageChartSourceOption = {
  id: NrmMainPageChartSource;
  label: string;
  iconKey: ChartPlatformIconKey;
  tokenPlatform: 'spotify' | 'lastfm' | null;
};

const STORAGE_KEY = 'nrm_main_page_chart_source_v1';

export const DEFAULT_MAIN_PAGE_CHART_SOURCE: NrmMainPageChartSource = 'melon-top100';

export function isNrmMainPageChartSource(v: string): v is NrmMainPageChartSource {
  return NRM_MAIN_PAGE_CHART_SOURCE_OPTIONS.some((o) => o.id === v);
}

export function getMainPageChartSourceOption(
  id: NrmMainPageChartSource,
): NrmMainPageChartSourceOption {
  const row = NRM_MAIN_PAGE_CHART_SOURCE_OPTIONS.find((o) => o.id === id);
  return row ?? NRM_MAIN_PAGE_CHART_SOURCE_OPTIONS[0];
}

export async function isMainPageChartSourceTokenReady(
  source: NrmMainPageChartSource,
): Promise<boolean> {
  const opt = getMainPageChartSourceOption(source);
  if (!opt.tokenPlatform) return true;
  if (opt.tokenPlatform === 'spotify') return hasSpotifyChartsSessionAccess();
  return hasLastfmChartAccess();
}

export async function loadMainPageChartSourceEnabledMap(): Promise<
  Record<NrmMainPageChartSource, boolean>
> {
  const [spotifyReady, lastfmReady] = await Promise.all([
    hasSpotifyChartsSessionAccess(),
    hasLastfmChartAccess(),
  ]);
  const map = {} as Record<NrmMainPageChartSource, boolean>;
  for (const opt of NRM_MAIN_PAGE_CHART_SOURCE_OPTIONS) {
    if (!opt.tokenPlatform) {
      map[opt.id] = true;
    } else if (opt.tokenPlatform === 'spotify') {
      map[opt.id] = spotifyReady;
    } else {
      map[opt.id] = lastfmReady;
    }
  }
  return map;
}

async function resolveStoredChartSource(raw: string | null): Promise<NrmMainPageChartSource> {
  if (!raw || !isNrmMainPageChartSource(raw)) {
    return DEFAULT_MAIN_PAGE_CHART_SOURCE;
  }
  if (await isMainPageChartSourceTokenReady(raw)) {
    return raw;
  }
  return DEFAULT_MAIN_PAGE_CHART_SOURCE;
}

export async function loadMainPageChartSource(): Promise<NrmMainPageChartSource> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return resolveStoredChartSource(raw);
  } catch {
    return DEFAULT_MAIN_PAGE_CHART_SOURCE;
  }
}

export async function saveMainPageChartSource(
  source: NrmMainPageChartSource,
): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, source);
}

type MainPageChartSourceListener = (source: NrmMainPageChartSource) => void;

let mainPageChartSourceListener: MainPageChartSourceListener | null = null;

export function registerMainPageChartSourceListener(
  fn: MainPageChartSourceListener | null,
): void {
  mainPageChartSourceListener = fn;
}

export function notifyMainPageChartSourceChanged(source: NrmMainPageChartSource): void {
  mainPageChartSourceListener?.(source);
}

export function homeChartDownloadSourceFromChartSource(
  chartSource: NrmMainPageChartSource,
): 'melon' | 'chart' | 'lastfm' {
  if (chartSource.startsWith('melon-')) return 'melon';
  if (chartSource.startsWith('lastfm-')) return 'lastfm';
  return 'chart';
}
