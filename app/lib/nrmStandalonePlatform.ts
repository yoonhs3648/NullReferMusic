import { Platform } from 'react-native';

import { isStandaloneApp } from '@/lib/nrmDevRuntime';

/** 릴리스 IPA (Expo Go·웹 제외) */
export function isStandaloneIos(): boolean {
  return Platform.OS === 'ios' && isStandaloneApp();
}

/** 릴리스 APK (Expo Go·웹 제외) */
export function isStandaloneAndroid(): boolean {
  return Platform.OS === 'android' && isStandaloneApp();
}

/** Android 릴리스 APK — yt-dlp로 확장자·음질 변환 */
export function isYtDlpEncodeSettingsEffective(): boolean {
  return isStandaloneAndroid();
}
