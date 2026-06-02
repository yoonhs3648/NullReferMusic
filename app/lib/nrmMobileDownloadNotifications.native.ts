/**
 * 다운로드 진행 · 완료 시스템(트레이) 알림.
 *
 * - 로컬 알림만 사용 (원격 푸시 없음).
 * - expo-notifications 메인 index는 로드하지 않음 → Expo Go SDK 53 푸시 경고/에러 방지.
 * - Expo Go에서도 로컬 알림은 동작 (공식 문서: 푸시만 Go에서 제한).
 * - 릴리스 APK에서는 동일 API로 정상 동작.
 *
 * 진행 알림 : 다운로드 중 (N개) — 하나의 알림을 업데이트
 * 완료 알림 : 파일명 + "다운로드 완료" / 동시에 여러 개면 "다운로드 완료 (N)"
 *   (이전에 끝난 뒤 새로 받기 시작하면 완료 목록은 초기화 — 지운 알림이 다시 묶이지 않음)
 */
import { Platform } from 'react-native';
import { NativeModules } from 'react-native';

import {
  nrmBackgroundWorkAcquire,
  nrmBackgroundWorkRelease,
  nrmDownloadBackgroundWorkToken,
} from '@/lib/nrmBackgroundWork';
import {
  AndroidImportance,
  dismissNotificationAsync,
  ensureNrmNotificationHandler,
  getPermissionsAsync,
  requestPermissionsAsync,
  scheduleNotificationAsync,
  setNotificationChannelAsync,
} from '@/lib/nrmNotificationsApi.native';

const CH_AUDIO_PROGRESS = 'nrm_audio_progress';
const CH_AUDIO_COMPLETE = 'nrm_audio_complete';
const CH_LYRICS_PROGRESS = 'nrm_lyrics_progress';
const CH_LYRICS_COMPLETE = 'nrm_lyrics_complete';
const NOTIF_AUDIO_PROGRESS_ID = 'nrm-audio-busy';
const NOTIF_AUDIO_DONE_SUMMARY_ID = 'nrm-audio-done-summary';
const NOTIF_LYRICS_PROGRESS_ID = 'nrm-lyrics-busy';
const NOTIF_LYRICS_DONE_SUMMARY_ID = 'nrm-lyrics-done-summary';
const GROUP_AUDIO_DONE = 'nrm_audio_complete';
const GROUP_LYRICS_DONE = 'nrm_lyrics_complete';

const activeAudioDownloads = new Map<string, string>();
const activeLyricsJobs = new Map<string, string>();
/** 현재 오디오 완료 묶음 (videoId → 표시 이름) */
const completedAudioByVideoId = new Map<string, string>();
/** 현재 가사 완료 묶음 (videoId → 표시 이름) */
const completedLyricsByVideoId = new Map<string, string>();
let setupDone = false;

type NrmProgressNotificationNativeModule = {
  showAudioProgress: (title: string, body: string) => void;
  showLyricsProgress: (title: string, body: string) => void;
  dismissAudioProgress: () => void;
  dismissLyricsProgress: () => void;
};

function nativeProgressModule(): NrmProgressNotificationNativeModule | undefined {
  if (Platform.OS !== 'android') return undefined;
  return NativeModules.NrmProgressNotification as
    | NrmProgressNotificationNativeModule
    | undefined;
}

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
      await setNotificationChannelAsync(CH_AUDIO_PROGRESS, {
        name: '오디오 다운로드 진행',
        importance: AndroidImportance.LOW,
        enableLights: false,
        enableVibrate: false,
        showBadge: false,
      });
      await setNotificationChannelAsync(CH_AUDIO_COMPLETE, {
        name: '오디오 다운로드 완료',
        importance: AndroidImportance.DEFAULT,
        enableLights: false,
        enableVibrate: false,
        showBadge: true,
      });
      await setNotificationChannelAsync(CH_LYRICS_PROGRESS, {
        name: '가사 생성 진행',
        importance: AndroidImportance.LOW,
        enableLights: false,
        enableVibrate: false,
        showBadge: false,
      });
      await setNotificationChannelAsync(CH_LYRICS_COMPLETE, {
        name: '가사 생성 완료',
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

async function refreshAudioProgressNotif(): Promise<void> {
  if (!setupDone) return;

  const count = activeAudioDownloads.size;
  if (count === 0) {
    const native = nativeProgressModule();
    if (native?.dismissAudioProgress) {
      native.dismissAudioProgress();
      return;
    }
    await dismissNotificationAsync(NOTIF_AUDIO_PROGRESS_ID).catch(() => {});
    return;
  }

  const labels = [...activeAudioDownloads.values()];
  const body =
    labels.length <= 3
      ? labels.join('\n')
      : `${labels.slice(0, 3).join('\n')}\n외 ${labels.length - 3}개`;

  const title = `오디오 다운로드 중 (${count}개)`;
  const native = nativeProgressModule();
  if (native?.showAudioProgress) {
    native.showAudioProgress(title, body);
    return;
  }

  await scheduleNotificationAsync({
    identifier: NOTIF_AUDIO_PROGRESS_ID,
    content: {
      title,
      body,
      data: {},
    },
    trigger: null,
  });
}

async function refreshLyricsProgressNotif(): Promise<void> {
  if (!setupDone) return;

  const count = activeLyricsJobs.size;
  if (count === 0) {
    const native = nativeProgressModule();
    if (native?.dismissLyricsProgress) {
      native.dismissLyricsProgress();
      return;
    }
    await dismissNotificationAsync(NOTIF_LYRICS_PROGRESS_ID).catch(() => {});
    return;
  }

  const labels = [...activeLyricsJobs.values()];
  const list = labels.map((label) => `가사 - ${label} 가사 생성중`);
  const body =
    list.length <= 3
      ? list.join('\n')
      : `${list.slice(0, 3).join('\n')}\n외 ${list.length - 3}개`;

  const title = `가사 생성 중 (${count}개)`;
  const native = nativeProgressModule();
  if (native?.showLyricsProgress) {
    native.showLyricsProgress(title, body);
    return;
  }

  await scheduleNotificationAsync({
    identifier: NOTIF_LYRICS_PROGRESS_ID,
    content: {
      title,
      body,
      data: {},
    },
    trigger: null,
  });
}

async function refreshAudioCompleteNotif(newLabel: string, videoId: string): Promise<void> {
  if (!setupDone) return;

  completedAudioByVideoId.set(videoId, newLabel);
  const labels = [...completedAudioByVideoId.values()];
  const count = labels.length;

  const title =
    count === 1
      ? `${labels[0]} 다운로드 완료`
      : `오디오 다운로드 완료 (${count})`;
  const body = count === 1 ? '' : labels.join('\n');

  await scheduleNotificationAsync({
    identifier: NOTIF_AUDIO_DONE_SUMMARY_ID,
    content: {
      title,
      body,
      data: {},
      ...(Platform.OS === 'android'
        ? ({ android: { channelId: CH_AUDIO_COMPLETE } } as object)
        : {}),
      ...(Platform.OS === 'ios' ? { threadIdentifier: GROUP_AUDIO_DONE } : {}),
    },
    trigger: null,
  });
}

async function refreshLyricsCompleteNotif(newLabel: string, videoId: string): Promise<void> {
  if (!setupDone) return;

  completedLyricsByVideoId.set(videoId, newLabel);
  const labels = [...completedLyricsByVideoId.values()];
  const count = labels.length;

  const title =
    count === 1
      ? `가사 - ${labels[0]} 가사 생성 완료`
      : `가사 생성 완료 (${count})`;
  const body = count === 1 ? '' : labels.join('\n');

  await scheduleNotificationAsync({
    identifier: NOTIF_LYRICS_DONE_SUMMARY_ID,
    content: {
      title,
      body,
      data: {},
      ...(Platform.OS === 'android'
        ? ({ android: { channelId: CH_LYRICS_COMPLETE } } as object)
        : {}),
      ...(Platform.OS === 'ios' ? { threadIdentifier: GROUP_LYRICS_DONE } : {}),
    },
    trigger: null,
  });
}

export function nrmNotifyDownloadStarted(
  videoId: string,
  displayLabel: string,
  kind: 'audio' | 'lyrics' = 'audio',
): void {
  if (kind === 'audio') {
    nrmBackgroundWorkAcquire(nrmDownloadBackgroundWorkToken(videoId));
    const wasIdle = activeAudioDownloads.size === 0;
    activeAudioDownloads.set(videoId, displayLabel);
    if (wasIdle) {
      completedAudioByVideoId.clear();
    }
    void refreshAudioProgressNotif();
    return;
  }
  const wasIdle = activeLyricsJobs.size === 0;
  activeLyricsJobs.set(videoId, displayLabel);
  if (wasIdle) {
    completedLyricsByVideoId.clear();
  }
  void refreshLyricsProgressNotif();
}

export function nrmNotifyDownloadFinished(
  videoId: string,
  displayLabel: string,
  success: boolean,
  kind: 'audio' | 'lyrics' = 'audio',
): void {
  if (kind === 'audio') {
    activeAudioDownloads.delete(videoId);
    void refreshAudioProgressNotif();
    if (success) void refreshAudioCompleteNotif(displayLabel, videoId);
    return;
  }
  activeLyricsJobs.delete(videoId);
  void refreshLyricsProgressNotif();
  if (success) void refreshLyricsCompleteNotif(displayLabel, videoId);
}

/** ffmpeg·Whisper 포함 전체 후처리가 끝났을 때 호출 (오디오 저장만으로는 release 하지 않음) */
export function nrmNotifyDownloadWorkEnded(videoId: string): void {
  nrmBackgroundWorkRelease(nrmDownloadBackgroundWorkToken(videoId));
}