import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'nrm_bg_play_enabled';

export async function getBgPlayEnabled(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(KEY);
    return v === 'true';
  } catch {
    return false;
  }
}

export async function setBgPlayEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(KEY, enabled ? 'true' : 'false');
}
