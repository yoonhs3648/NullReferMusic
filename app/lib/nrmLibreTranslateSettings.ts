import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL_KEY = 'nrm_libretranslate_base_url_v1';
const API_KEY_KEY = 'nrm_libretranslate_api_key_v1';

/** 자체 호스팅(오프라인) 기본 주소 — 언어 팩 설치 후 로컬 서버 */
export const LIBRETRANSLATE_LOCAL_DEFAULT_BASE_URL = 'http://127.0.0.1:5000';

/** 공개 LibreTranslate 서버 */
export const LIBRETRANSLATE_PUBLIC_BASE_URL = 'https://libretranslate.com';

export async function getLibreTranslateBaseUrl(): Promise<string> {
  try {
    const raw = (await AsyncStorage.getItem(BASE_URL_KEY))?.trim();
    return raw || LIBRETRANSLATE_LOCAL_DEFAULT_BASE_URL;
  } catch {
    return LIBRETRANSLATE_LOCAL_DEFAULT_BASE_URL;
  }
}

export async function saveLibreTranslateBaseUrl(url: string): Promise<void> {
  const trimmed = url.trim();
  if (!trimmed) {
    await AsyncStorage.removeItem(BASE_URL_KEY);
    return;
  }
  await AsyncStorage.setItem(BASE_URL_KEY, trimmed);
}

export async function getLibreTranslateApiKey(): Promise<string> {
  try {
    return (await AsyncStorage.getItem(API_KEY_KEY))?.trim() ?? '';
  } catch {
    return '';
  }
}

export async function saveLibreTranslateApiKey(key: string): Promise<void> {
  const trimmed = key.trim();
  if (!trimmed) {
    await AsyncStorage.removeItem(API_KEY_KEY);
    return;
  }
  await AsyncStorage.setItem(API_KEY_KEY, trimmed);
}
