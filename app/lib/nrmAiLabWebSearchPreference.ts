/**
 * @deprecated AI Lab 인터넷 검색은 서버 Intent Classifier가 자동 결정한다.
 * UI 토글은 제거됨. 남은 AsyncStorage 키는 무시해도 된다.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'nrm_ai_lab_web_search_enabled_v1';

/** @deprecated 항상 false — 토글 제거 후 호환용 */
export async function loadAiLabWebSearchEnabled(): Promise<boolean> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  return false;
}

/** @deprecated no-op */
export async function saveAiLabWebSearchEnabled(_enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
