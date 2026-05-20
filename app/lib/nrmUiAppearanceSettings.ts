import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'nrm_ui_appearance_v1';

/** 앱 UI 테마. 저장값이 없으면 OS `useColorScheme`을 따릅니다. */
export type NrmUiAppearanceMode = 'light' | 'dark';

export async function getNrmUiAppearanceMode(): Promise<NrmUiAppearanceMode | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw === 'light' || raw === 'dark') return raw;
    return null;
  } catch {
    return null;
  }
}

export async function setNrmUiAppearanceMode(
  mode: NrmUiAppearanceMode,
): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, mode);
}
