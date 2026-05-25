/**
 * 다운로드 진행 · 완료 시스템(트레이) 알림.
 *
 * - 로컬 알림만 사용 (원격 푸시 없음).
 * - expo-notifications 메인 index는 로드하지 않음 → Expo Go SDK 53 푸시 경고/에러 방지.
 * - Expo Go에서도 로컬 알림은 동작 (공식 문서: 푸시만 Go에서 제한).
 * - 릴리스 APK에서는 동일 API로 정상 동작.
 *
 * 진행 알림 : 다운로드 중 (N개) — 하나의 알림을 업데이트
 * 완료 알림 : 파일명 + "다운로드 완료" + Android GroupSummary "다운로드 완료 (N)"
 */
import { Platform } from 'react-native';
import {
  AndroidImportance,
  dismissNotificationAsync,
  ensureNrmNotificationHandler,
  getPermissionsAsync,
  requestPermissionsAsync,
  scheduleNotificationAsync,
  setNotificationChannelAsync,
} from '@/lib/nrmNotificationsApi.native';

const CH_PROGRESS = 'nrm_dl_progress';
const CH_COMPLETE = 'nrm_dl_complete';
const NOTIF_PROGRESS_ID = 'nrm-dl-busy';
const NOTIF_DONE_SUMMARY_ID = 'nrm-dl-done-summary';
const GROUP_DONE = 'nrm_dl_complete';

const activeDownloads = new Map<string, string>();
const completedLabels: string[] = [];
let setupDone = false;

export async function setupNrmMobileDownloadNotifications(): Promise<void> {
  if (setupDone) return;

  try {
    ensureNrmNotificationHandler();

    const { status: existingStatus } = await getPermissionsAsync();
    let granted = existingStatus === 'granted';

    if (!granted) {
      const { status } = await requestPermissionsAsync();
      granted = status === 'granted';
    }

    if (!granted) return;

    if (Platform.OS === 'android') {
      await setNotificationChannelAsync(CH_PROGRESS, {
        name: '다운로드 진행',
        importance: AndroidImportance.LOW,
        enableLights: false,
        enableVibrate: false,
        showBadge: false,
      });
      await setNotificationChannelAsync(CH_COMPLETE, {
        name: '다운로드 완료',
        importance: AndroidImportance.DEFAULT,
        enableLights: false,
        enableVibrate: false,
        showBadge: true,
      });
    }

    setupDone = true;
  } catch {
    /* 알림 권한 거부 등 — 무시 */
  }
}

async function refreshProgressNotif(): Promise<void> {
  if (!setupDone) return;

  const count = activeDownloads.size;
  if (count === 0) {
    await dismissNotificationAsync(NOTIF_PROGRESS_ID).catch(() => {});
    return;
  }

  const labels = [...activeDownloads.values()];
  const body =
    labels.length <= 3
      ? labels.join('\n')
      : `${labels.slice(0, 3).join('\n')}\n외 ${labels.length - 3}개`;

  await scheduleNotificationAsync({
    identifier: NOTIF_PROGRESS_ID,
    content: {
      title: `다운로드 중 (${count}개)`,
      body,
      data: {},
      ...(Platform.OS === 'android'
        ? ({
            android: {
              channelId: CH_PROGRESS,
              ongoing: true,
              sticky: true,
              progress: { max: 100, current: 0, indeterminate: true },
            },
          } as object)
        : {}),
    },
    trigger: null,
  });
}

async function refreshCompleteNotif(newLabel: string, _videoId: string): Promise<void> {
  if (!setupDone) return;

  completedLabels.push(newLabel);
  const count = completedLabels.length;

  // ▸ 개별 알림 없음 — 항상 하나의 요약 알림만 업데이트
  // ▸ 1건: "파일명 다운로드 완료", 다건: "다운로드 완료 (N)" + 목록
  const title =
    count === 1
      ? `${newLabel} 다운로드 완료`
      : `다운로드 완료 (${count})`;
  const body =
    count === 1
      ? ''
      : completedLabels.join('\n');

  await scheduleNotificationAsync({
    identifier: NOTIF_DONE_SUMMARY_ID,
    content: {
      title,
      body,
      data: {},
      ...(Platform.OS === 'android'
        ? ({ android: { channelId: CH_COMPLETE } } as object)
        : {}),
      ...(Platform.OS === 'ios' ? { threadIdentifier: GROUP_DONE } : {}),
    },
    trigger: null,
  });
}

export function nrmNotifyDownloadStarted(
  videoId: string,
  displayLabel: string,
): void {
  activeDownloads.set(videoId, displayLabel);
  void refreshProgressNotif();
}

export function nrmNotifyDownloadFinished(
  videoId: string,
  displayLabel: string,
  success: boolean,
): void {
  activeDownloads.delete(videoId);
  void refreshProgressNotif();
  if (success) void refreshCompleteNotif(displayLabel, videoId);
}