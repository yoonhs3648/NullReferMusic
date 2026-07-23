// AI Lab 「인터넷 검색」 ON/OFF — 기기 로컬 저장(모델 선택과 동일 패턴).
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'nrm_ai_lab_web_search_enabled_v1';

export async function loadAiLabWebSearchEnabled(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw == null) return false;
    return raw === '1' || raw === 'true';
  } catch {
    return false;
  }
}

export async function saveAiLabWebSearchEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // 저장 실패는 무시 — 이번 세션 state만 유지.
  }
}
