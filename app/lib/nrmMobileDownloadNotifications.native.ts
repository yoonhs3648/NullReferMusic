/**
 * 다운로드 진행 · 완료 시스템(트레이) 알림.
 *
 * ⚠ Expo Go SDK 53+: expo-notifications push 지원이 제거됨.
 *    앱이 storeClient(Expo Go)로 실행 중이면 시스템 알림을 건너뜁니다.
 *    APK 빌드에서는 정상 동작합니다.
 *
 * 진행 알림 : 다운로드 중 (N개) — 하나의 알림을 업데이트
 * 완료 알림 : 파일명 + "다운로드 완료" + Android GroupSummary "다운로드 완료 (N)"
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { confirmUser } from '@/lib/nrmUserNotify';

// expo-notifications lazy require — Expo Go SDK 53에서 push token 경고가 발생하지만
// 로컬 알림(scheduleNotificationAsync)은 Expo Go에서도 정상 동작합니다.
// 경고는 APK 빌드에서는 표시되지 않습니다.
type NotificationsModule = typeof import('expo-notifications');
let _Notif: NotificationsModule | null = null;

function getNotif(): NotificationsModule | null {
  if (!_Notif) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      _Notif = require('expo-notifications') as NotificationsModule;
    } catch {
      _Notif = null;
    }
  }
  return _Notif;
}

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
  const Notif = getNotif();
  if (!Notif) return;

  try {
    // 기존 권한 상태 먼저 확인 — 이미 허용됐으면 바로 진행
    const { status: existingStatus } = await Notif.getPermissionsAsync();
    let granted = existingStatus === 'granted';

    if (!granted) {
      // 한글 사전 안내 다이얼로그 (시스템 다이얼로그 전에 표시)
      const confirmed = await confirmUser(
        '다운로드 진행 및 완료 알림을 표시하려면\n알림 권한이 필요합니다.\n허용하시겠습니까?',
        { confirmLabel: '허용', cancelLabel: '거절' },
      );
      if (!confirmed) return;

      const { status } = await Notif.requestPermissionsAsync();
      granted = status === 'granted';
    }

    if (!granted) return;

    if (Platform.OS === 'android') {
      await Notif.setNotificationChannelAsync(CH_PROGRESS, {
        name: '다운로드 진행',
        importance: Notif.AndroidImportance.LOW,
        enableLights: false,
        enableVibrate: false,
        showBadge: false,
      });
      await Notif.setNotificationChannelAsync(CH_COMPLETE, {
        name: '다운로드 완료',
        importance: Notif.AndroidImportance.DEFAULT,
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

// ── 진행 알림 ─────────────────────────────────────────────────────────────────

async function refreshProgressNotif(): Promise<void> {
  const Notif = getNotif();
  if (!Notif || !setupDone) return;

  const count = activeDownloads.size;
  if (count === 0) {
    await Notif.dismissNotificationAsync(NOTIF_PROGRESS_ID).catch(() => {});
    return;
  }

  const labels = [...activeDownloads.values()];
  const body =
    labels.length <= 3
      ? labels.join('\n')
      : `${labels.slice(0, 3).join('\n')}\n외 ${labels.length - 3}개`;

  await Notif.scheduleNotificationAsync({
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

// ── 완료 알림 ─────────────────────────────────────────────────────────────────

async function refreshCompleteNotif(newLabel: string, videoId: string): Promise<void> {
  const Notif = getNotif();
  if (!Notif || !setupDone) return;

  completedLabels.push(newLabel);
  const count = completedLabels.length;
  const individualId = `nrm-dl-done-${videoId}`;

  await Notif.scheduleNotificationAsync({
    identifier: individualId,
    content: {
      title: `${newLabel} 다운로드 완료`,
      body: '',
      data: {},
      ...(Platform.OS === 'android'
        ? ({ android: { channelId: CH_COMPLETE, group: GROUP_DONE } } as object)
        : {}),
      ...(Platform.OS === 'ios' ? { threadIdentifier: GROUP_DONE } : {}),
    },
    trigger: null,
  });

  if (Platform.OS === 'android') {
    await Notif.scheduleNotificationAsync({
      identifier: NOTIF_DONE_SUMMARY_ID,
      content: {
        title: `다운로드 완료 (${count})`,
        body: completedLabels.slice(-5).join('\n'),
        data: {},
        ...(({
          android: {
            channelId: CH_COMPLETE,
            group: GROUP_DONE,
            groupSummary: true,
          },
        }) as object),
      },
      trigger: null,
    });
  }
}

// ── 공개 API ──────────────────────────────────────────────────────────────────

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
