import type { GranularPermission } from 'expo-media-library';
import { Platform } from 'react-native';

/** APK/IPA·Expo Go 동일: Android 13+ 에서 스탠드얼론과 같은 세분 오디오 권한 요청 */
export function getAndroidMediaGranularPermissions():
  | GranularPermission[]
  | undefined {
  if (Platform.OS !== 'android') return undefined;
  return ['audio'];
}

/**
 * 구동 차단용 권한 검사를 하지 않습니다.
 * 알림은 발송 시도만 하며 거부 시 무시하고, 미디어(오디오)는 Android에서 저장 직전에 요청합니다.
 */
export async function ensureAppRequiredPermissions(): Promise<boolean> {
  return true;
}
