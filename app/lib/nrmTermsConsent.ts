import AsyncStorage from '@react-native-async-storage/async-storage';

const TERMS_CONSENT_KEY = 'nrm_terms_consented_v1';

/**
 * 권한 허가 완료 이후에만 저장되는 이용약관 동의 상태.
 * 권한 허가 전 앱이 종료된 경우 동의가 저장되지 않으므로, 재실행 시 처음부터 시작.
 */
export async function isNrmTermsConsented(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(TERMS_CONSENT_KEY);
    return val === 'true';
  } catch {
    return false;
  }
}

export async function saveNrmTermsConsented(): Promise<void> {
  try {
    await AsyncStorage.setItem(TERMS_CONSENT_KEY, 'true');
  } catch {}
}
