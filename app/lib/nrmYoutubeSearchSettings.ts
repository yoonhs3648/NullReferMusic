import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'nrmYoutubeSearchSuffixMode';

/** 검색어에 붙일 YouTube 검색 보조 접미사 종류 */
export type NrmYoutubeSearchSuffixMode =
  | 'default'
  | 'topic'
  | 'official_audio';

export const NRM_YOUTUBE_SEARCH_SUFFIX_DEFAULT: NrmYoutubeSearchSuffixMode =
  'default';

export const NRM_YOUTUBE_SEARCH_SUFFIX_LABELS: Record<
  NrmYoutubeSearchSuffixMode,
  string
> = {
  default: '기본',
  topic: 'Topic',
  official_audio: 'Official Audio',
};

const ORDER: NrmYoutubeSearchSuffixMode[] = [
  'default',
  'topic',
  'official_audio',
];

export function listYoutubeSearchSuffixModes(): NrmYoutubeSearchSuffixMode[] {
  return ORDER;
}

export async function getYoutubeSearchSuffixMode(): Promise<NrmYoutubeSearchSuffixMode> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (
      raw === 'default' ||
      raw === 'topic' ||
      raw === 'official_audio'
    ) {
      return raw;
    }
    return NRM_YOUTUBE_SEARCH_SUFFIX_DEFAULT;
  } catch {
    return NRM_YOUTUBE_SEARCH_SUFFIX_DEFAULT;
  }
}

export async function setYoutubeSearchSuffixMode(
  mode: NrmYoutubeSearchSuffixMode,
): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, mode);
}
