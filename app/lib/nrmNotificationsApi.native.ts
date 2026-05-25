/**
 * expo-notifications 메인 진입점(index)은 푸시 토큰 자동 등록 부작용이 있어
 * Expo Go SDK 53+ Android에서 console.error가 난다.
 * 로컬(다운로드) 알림에 필요한 API만 build/ 하위 모듈에서 가져온다.
 * @see docs/RELEASE-APK-IPA-RULE.md
 */
import { AndroidImportance } from 'expo-notifications/build/NotificationChannelManager.types';
import {
  getPermissionsAsync,
  requestPermissionsAsync,
} from 'expo-notifications/build/NotificationPermissions';
import { setNotificationHandler } from 'expo-notifications/build/NotificationsHandler';
import dismissNotificationAsync from 'expo-notifications/build/dismissNotificationAsync';
import scheduleNotificationAsync from 'expo-notifications/build/scheduleNotificationAsync';
import setNotificationChannelAsync from 'expo-notifications/build/setNotificationChannelAsync';

let handlerInstalled = false;

/** 포그라운드에서도 시스템 트레이 알림이 보이도록 (Expo Go·APK 공통) */
export function ensureNrmNotificationHandler(): void {
  if (handlerInstalled) return;
  handlerInstalled = true;
  setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

export {
  AndroidImportance,
  dismissNotificationAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
  scheduleNotificationAsync,
  setNotificationChannelAsync,
};
