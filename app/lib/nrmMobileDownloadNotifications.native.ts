/**

 * 다운로드 진행 · 완료 시스템(트레이) 알림.

 *

 * - 로컬 알림만 사용 (원격 푸시 없음).

 * - expo-notifications 메인 index는 로드하지 않음 → Expo Go SDK 53 푸시 경고/에러 방지.

 * - Expo Go에서도 로컬 알림은 동작 (공식 문서: 푸시만 Go에서 제한).

 * - 릴리스 APK에서는 동일 API로 정상 동작.

 *

 * 진행 알림 : 오디오(9201)·가사(9202) 각각 독립 ongoing — FG Service와 동일 ID 공유(중복 알림 없음)
 * 완료 알림 : 항목마다 개별 ID (예: nrm-audio-done-{videoId}, nrm-lyrics-done-{videoId})

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

const CH_ATTACHMENT_PROGRESS = 'nrm_attachment_progress';

const CH_ATTACHMENT_COMPLETE = 'nrm_attachment_complete';

const NOTIF_AUDIO_PROGRESS_ID = 'nrm-audio-busy';

const NOTIF_LYRICS_PROGRESS_ID = 'nrm-lyrics-busy';

const NOTIF_ATTACHMENT_PROGRESS_ID = 'nrm-attach-busy';



const activeAudioDownloads = new Map<string, string>();

const activeLyricsJobs = new Map<string, string>();

let setupDone = false;



type NrmProgressNotificationNativeModule = {

  showAudioProgress: (title: string, body: string) => void;

  showLyricsProgress: (title: string, body: string) => void;

  dismissAudioProgress: () => void;

  dismissLyricsProgress: () => void;

  reconcileStaleProgressOnColdStart?: () => void;

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

    if (Platform.OS === 'android') {

      activeAudioDownloads.clear();

      activeLyricsJobs.clear();

      nativeProgressModule()?.reconcileStaleProgressOnColdStart?.();

      await dismissNotificationAsync(NOTIF_AUDIO_PROGRESS_ID).catch(() => {});

      await dismissNotificationAsync(NOTIF_LYRICS_PROGRESS_ID).catch(() => {});

    }

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

      await setNotificationChannelAsync(CH_ATTACHMENT_PROGRESS, {

        name: '첨부 파일 다운로드 진행',

        importance: AndroidImportance.LOW,

        enableLights: false,

        enableVibrate: false,

        showBadge: false,

      });

      await setNotificationChannelAsync(CH_ATTACHMENT_COMPLETE, {

        name: '첨부 파일 다운로드 완료',

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

  const list = labels.map((label) => `${label} 가사 생성중`);

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



async function showAudioCompleteNotif(label: string, videoId: string): Promise<void> {

  if (!setupDone) return;



  await scheduleNotificationAsync({

    identifier: `nrm-audio-done-${videoId}`,

    content: {

      title: `${label} 다운로드 완료`,

      body: '',

      data: {},

      ...(Platform.OS === 'android'

        ? ({ android: { channelId: CH_AUDIO_COMPLETE } } as object)

        : {}),

    },

    trigger: null,

  });

}



async function showLyricsCompleteNotif(label: string, videoId: string): Promise<void> {

  if (!setupDone) return;



  await scheduleNotificationAsync({

    identifier: `nrm-lyrics-done-${videoId}`,

    content: {

      title: `${label} 가사 생성 완료`,

      body: '',

      data: {},

      ...(Platform.OS === 'android'

        ? ({ android: { channelId: CH_LYRICS_COMPLETE } } as object)

        : {}),

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

    activeAudioDownloads.set(videoId, displayLabel);

    void refreshAudioProgressNotif();

    return;

  }

  activeLyricsJobs.set(videoId, displayLabel);

  void refreshLyricsProgressNotif();

}



/** 오디오 큐 등록 직후 — dl FGS 토큰 없이 진행 알림만 (추출 시작 전) */

export function nrmNotifyDownloadQueued(videoId: string, displayLabel: string): void {

  activeAudioDownloads.set(videoId, `${displayLabel} (대기)`);

  void refreshAudioProgressNotif();

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

    if (success) void showAudioCompleteNotif(displayLabel, videoId);

    return;

  }

  activeLyricsJobs.delete(videoId);

  void refreshLyricsProgressNotif();

  if (success) void showLyricsCompleteNotif(displayLabel, videoId);

}



/** ffmpeg·Whisper 포함 전체 후처리가 끝났을 때 호출 (오디오 저장만으로는 release 하지 않음) */

async function showLyricsFailedNotif(
  label: string,
  videoId: string,
  reason?: string,
): Promise<void> {
  if (!setupDone) return;

  const body = reason?.trim() ?? '';
  await scheduleNotificationAsync({
    identifier: `nrm-lyrics-fail-${videoId}`,
    content: {
      title: `${label} 가사 생성에 실패했습니다.`,
      body,
      data: {},
      ...(Platform.OS === 'android'
        ? ({ android: { channelId: CH_LYRICS_COMPLETE } } as object)
        : {}),
    },
    trigger: null,
  });
}

export async function nrmNotifyLyricsFailed(
  displayLabel: string,
  videoId: string,
  reason?: string,
): Promise<void> {
  if (!setupDone) await setupNrmMobileDownloadNotifications();
  const label = displayLabel.trim() || '알 수 없는 트랙';
  await showLyricsFailedNotif(label, videoId, reason);
}

/** ffmpeg·Whisper 포함 전체 후처리가 끝났을 때 호출 (오디오 저장만으로는 release 하지 않음) */
export function nrmNotifyDownloadWorkEnded(videoId: string): void {
  nrmBackgroundWorkRelease(nrmDownloadBackgroundWorkToken(videoId));
}

/** 추출·yt-dlp 타임아웃 등 최종 실패 — 시스템(로컬) 알림 */
export async function nrmNotifyDownloadFailed(
  displayLabel: string,
  videoId?: string,
): Promise<void> {
  if (!setupDone) await setupNrmMobileDownloadNotifications();

  const label = displayLabel.trim() || '알 수 없는 트랙';
  const id = videoId?.trim()
    ? `nrm-audio-fail-${videoId}`
    : `nrm-audio-fail-${Date.now()}`;

  await scheduleNotificationAsync({
    identifier: id,
    content: {
      title: `${label} 다운로드에 실패했습니다.`,
      body: '',
      data: {},
      ...(Platform.OS === 'android'
        ? ({ android: { channelId: CH_AUDIO_COMPLETE } } as object)
        : {}),
    },
    trigger: null,
  });
}



export async function nrmNotifyAttachmentDownloadStarted(fileName: string): Promise<void> {

  if (!setupDone) await setupNrmMobileDownloadNotifications();

  if (!setupDone) return;



  const label = fileName.trim() || '첨부 파일';

  const native = nativeProgressModule();

  if (native?.showAudioProgress) {

    native.showAudioProgress('다운로드 중', label);

    return;

  }



  await scheduleNotificationAsync({

    identifier: NOTIF_ATTACHMENT_PROGRESS_ID,

    content: {

      title: '다운로드 중',

      body: label,

      data: {},

      ...(Platform.OS === 'android'

        ? ({ android: { channelId: CH_ATTACHMENT_PROGRESS } } as object)

        : {}),

    },

    trigger: null,

  });

}



export async function nrmNotifyAttachmentDownloadFinished(

  fileName: string,

  success: boolean,

): Promise<void> {

  const label = fileName.trim() || '첨부 파일';

  const native = nativeProgressModule();

  if (native?.dismissAudioProgress) {

    native.dismissAudioProgress();

  } else {

    await dismissNotificationAsync(NOTIF_ATTACHMENT_PROGRESS_ID).catch(() => {});

  }



  if (!setupDone || !success) return;



  await scheduleNotificationAsync({

    identifier: `nrm-attach-done-${Date.now()}`,

    content: {

      title: '다운로드 완료',

      body: label,

      data: {},

      ...(Platform.OS === 'android'

        ? ({ android: { channelId: CH_ATTACHMENT_COMPLETE } } as object)

        : {}),

    },

    trigger: null,

  });

}

