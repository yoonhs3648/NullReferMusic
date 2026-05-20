import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** Expo Go 앱에서 실행 중 (Metro 실시간 번들) */
export function isExpoGo(): boolean {
  return Constants.appOwnership === 'expo';
}

/** 스토어/직접 설치 APK·IPA (PC Metro·개발 서버와 분리된 릴리스 바이너리) */
export function isStandaloneApp(): boolean {
  return Constants.appOwnership === 'standalone';
}

/**
 * 개발 중 PC Spring API(8787) 사용:
 * - 웹 (localhost / LAN)
 * - Expo Go (같은 Wi‑Fi, StartServer.bat)
 */
export function usesPcBackendInDev(): boolean {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return false;
  if (Platform.OS === 'web') return true;
  return isExpoGo();
}
