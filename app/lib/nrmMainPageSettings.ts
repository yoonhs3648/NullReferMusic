import AsyncStorage from '@react-native-async-storage/async-storage';

export const NRM_MAIN_PAGE_MODE_OPTIONS = [
  {
    id: 'charts',
    label: 'Charts',
    description: '메인에 실시간 차트 Top 20을 표시합니다.',
    icon: 'bar-chart-outline' as const,
  },
  {
    id: 'quotation',
    label: 'Quotation',
    description: '메인에 음악 명언을 표시합니다.',
    icon: 'chatbubble-ellipses-outline' as const,
  },
  {
    id: 'none',
    label: 'None',
    description: '로고와 검색창만 중앙에 표시합니다.',
    icon: 'remove-circle-outline' as const,
  },
] as const;

export type NrmMainPageMode = (typeof NRM_MAIN_PAGE_MODE_OPTIONS)[number]['id'];

const STORAGE_KEY = 'nrm_main_page_mode_v1';

export const DEFAULT_MAIN_PAGE_MODE: NrmMainPageMode = 'charts';

export function isNrmMainPageMode(v: string): v is NrmMainPageMode {
  return NRM_MAIN_PAGE_MODE_OPTIONS.some((o) => o.id === v);
}

export async function loadMainPageMode(): Promise<NrmMainPageMode> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw && isNrmMainPageMode(raw)) return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_MAIN_PAGE_MODE;
}

export async function saveMainPageMode(mode: NrmMainPageMode): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, mode);
}

type MainPageModeListener = (mode: NrmMainPageMode) => void;

let mainPageModeListener: MainPageModeListener | null = null;

export function registerMainPageModeListener(fn: MainPageModeListener | null): void {
  mainPageModeListener = fn;
}

export function notifyMainPageModeChanged(mode: NrmMainPageMode): void {
  mainPageModeListener?.(mode);
}
