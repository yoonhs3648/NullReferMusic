import type { GranularPermission } from 'expo-media-library';
import * as MediaLibrary from 'expo-media-library';
import { Platform } from 'react-native';

import { isExpoGo } from '@/lib/nrmDevRuntime';
import {
  getPermissionsAsync as getNotificationPermissionsAsync,
  requestPermissionsAsync as requestNotificationPermissionsAsync,
} from '@/lib/nrmNotificationsApi.native';
export type NrmRequiredPermissionState = {
  notifications: boolean;
  media: boolean;
  saf: boolean;
};

/** 스탠드얼론 APK: Android 13+ 세분 오디오 권한. Expo Go는 자체 매니페스트라 audio 미선언. */
export function getAndroidMediaGranularPermissions():
  | GranularPermission[]
  | undefined {
  if (Platform.OS !== 'android' || isExpoGo()) return undefined;
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
  if (isExpoGo()) return true;
  try {
    const { status } = await MediaLibrary.getPermissionsAsync(
      false,
      getAndroidMediaGranularPermissions(),
    );
    return status === 'granted';
  } catch {
    return false;
  }
}

/**
 * 알림 → 미디어(오디오) 순으로 요청. SAF 저장 폴더는 앱 내에서 별도 설정.
 * 중간에 거부하면 즉시 false 반환(호출 측에서 앱 종료).
 */
export async function requestAllRequiredPermissions(): Promise<NrmRequiredPermissionState> {
  if (Platform.OS !== 'android') {
    return { notifications: true, media: true, saf: true };
  }

  /** 버튼 탭마다 시스템 권한 다이얼로그를 다시 띄우기 위해 check 생략 후 request */
  const notifRes = await requestNotificationPermissionsAsync();
  const notifications = notifRes.status === 'granted';
  if (!notifications) {
    const media = await checkMediaPermission();
    return { notifications: false, media, saf: true };
  }

  let media = true;
  if (!isExpoGo()) {
    try {
      const mediaRes = await MediaLibrary.requestPermissionsAsync(
        false,
        getAndroidMediaGranularPermissions(),
      );
      media = mediaRes.status === 'granted';
    } catch {
      media = false;
    }
  }
  if (!media) {
    return { notifications: true, media: false, saf: true };
  }

  return { notifications, media, saf: true };
}
