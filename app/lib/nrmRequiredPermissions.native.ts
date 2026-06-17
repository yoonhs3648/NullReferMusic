import type { GranularPermission } from 'expo-media-library';
import * as MediaLibrary from 'expo-media-library';
import { Platform } from 'react-native';

import {
  getPermissionsAsync as getNotificationPermissionsAsync,
  requestPermissionsAsync as requestNotificationPermissionsAsync,
} from '@/lib/nrmNotificationsApi.native';
export type NrmRequiredPermissionState = {
  notifications: boolean;
  media: boolean;
  saf: boolean;
};

/** APK/IPA·Expo Go 동일: Android 13+ 에서 스탠드얼론과 같은 세분 오디오 권한 요청 */
export function getAndroidMediaGranularPermissions():
  | GranularPermission[]
  | undefined {
  if (Platform.OS !== 'android') return undefined;
  return ['audio'];
}

export async function checkRequiredPermissions(): Promise<NrmRequiredPermissionState> {
  if (Platform.OS !== 'android') {
    return { notifications: true, media: true, saf: true };
  }
  const [notif, media] = await Promise.all([
    checkNotificationPermission(),
    checkMediaPermission(),
  ]);
  return {
    notifications: notif,
    media,
    saf: true,
  };
}

export async function ensureAppRequiredPermissions(): Promise<boolean> {
  const state = await checkRequiredPermissions();
  return state.notifications && state.media;
}

async function checkNotificationPermission(): Promise<boolean> {
  const { status } = await getNotificationPermissionsAsync();
  return status === 'granted';
}

async function checkMediaPermission(): Promise<boolean> {
  const { status } = await MediaLibrary.getPermissionsAsync(
    false,
    getAndroidMediaGranularPermissions(),
  );
  return status === 'granted';
}

/**
 * 알림 → 미디어(오디오) 순으로 요청. SAF 저장 폴더는 앱 내에서 별도 설정.
 * 중간에 거부하면 즉시 false 반환(호출 측에서 앱 종료).
 */
export async function requestAllRequiredPermissions(): Promise<NrmRequiredPermissionState> {
  if (Platform.OS !== 'android') {
    return { notifications: true, media: true, saf: true };
  }

  let notifications = await checkNotificationPermission();
  if (!notifications) {
    const res = await requestNotificationPermissionsAsync();
    notifications = res.status === 'granted';
  }
  if (!notifications) {
    return { notifications: false, media: false, saf: true };
  }

  let media = await checkMediaPermission();
  if (!media) {
    const res = await MediaLibrary.requestPermissionsAsync(
      false,
      getAndroidMediaGranularPermissions(),
    );
    media = res.status === 'granted';
  }
  if (!media) {
    return { notifications: true, media: false, saf: true };
  }

  return { notifications, media, saf: true };
}
