/**
 * AI Lab 가사 후속: 모델 게이트, 다운로드 레지스트리, 가사 생성/Google 번역.
 */
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/src/legacy/FileSystem';
import { EncodingType } from 'expo-file-system/src/legacy/FileSystem.types';

import { NRM_ALIGN_WAV2VEC2_BASE_ID } from '@/lib/nrmAlignModelCatalog';
import { isAlignModelInstalled } from '@/lib/nrmAlignModelNative';
import { inferMelonAlignLyricsLanguage } from '@/lib/nrmAlignLyricsLang';
import type { NrmAiLabChoice, NrmAiLabTrackHit } from '@/lib/nrmAiLabDownloadTools';
import {
  nrmBackgroundWorkAcquire,
  nrmBackgroundWorkRelease,
  nrmLyricsBackgroundWorkToken,
} from '@/lib/nrmBackgroundWork';
import { logNrmDev, logNrmRunError } from '@/lib/nrmDevLog';
import { enqueueLyricsDownloadWork } from '@/lib/nrmDownloadWorkQueue';
import { isEnKoTransliteratorInstalled } from '@/lib/nrmEnKoTransliteratorNative';
import { listDownloadAudioTracks } from '@/lib/nrmListDownloadTracks';
import type { NrmDownloadTrackItem } from '@/lib/nrmDownloadTrackTypes';
import {
  normalizeMelonTrackWebsite,
  resolveMelonPlainLyricsForEdit,
} from '@/lib/nrmMelonLyrics';
import type { MelonLyricsLrcPreload } from '@/lib/nrmMelonLyricsLrcStage';
import {
  nrmNotifyDownloadFinished,
  nrmNotifyDownloadStarted,
  nrmNotifyLyricsFailed,
  setupNrmMobileDownloadNotifications,
} from '@/lib/nrmMobileDownloadNotifications';
import { readAudioFileMetadata } from '@/lib/nrmReadAudioMetadata';
import { siblingLrcUri } from '@/lib/nrmSiblingLrc';
import { loadLyricsOutputMode } from '@/lib/nrmDownloadSettings';
import { isEmbeddedSyncLyricsText } from '@/lib/nrmLrcUiMode';

const LOG = 'ailab.lyricsFollowup';

export type AiLabLyricsCapability = {
  ok: boolean;
  wav2vec2BaseInstalled: boolean;
  enKoTransliteratorInstalled: boolean;
  canAskLyrics: boolean;
  canGenerateLyrics: boolean;
  missing: string[];
  message: string;
  askPrompt: string | null;
  choices: NrmAiLabChoice[];
};

export type AiLabDownloadRecord = {
  videoId: string;
  fileName: string;
  displayLabel: string;
  hit: NrmAiLabTrackHit;
  website?: string;
  audioUri?: string;
  location?: NrmDownloadTrackItem['location'];
  plainLyrics?: string;
};

export type AiLabTranslationAskPayload = {
  videoId: string;
  displayLabel: string;
  choices: NrmAiLabChoice[];
  message: string;
};

type FollowupHooks = {
  onAskTranslation?: (payload: AiLabTranslationAskPayload) => void;
};

const recordsByVideoId = new Map<string, AiLabDownloadRecord>();
let lastDownloadVideoId: string | null = null;
let followupHooks: FollowupHooks = {};

export const AI_LAB_MELON_LYRICS_PRELOAD: MelonLyricsLrcPreload = {
  alignModelPreference: NRM_ALIGN_WAV2VEC2_BASE_ID,
  forceLangDetectionMode: 'transliterator',
};

export const LYRICS_YES_NO_CHOICES: NrmAiLabChoice[] = [
  { id: 'lyrics_yes', label: '예, 가사 생성' },
  { id: 'lyrics_no', label: '아니요' },
];

export const TRANSLATE_YES_NO_CHOICES: NrmAiLabChoice[] = [
  { id: 'translate_yes', label: '예, 번역해주세요' },
  { id: 'translate_no', label: '아니요' },
];

export function setAiLabLyricsFollowupHooks(hooks: FollowupHooks): void {
  followupHooks = hooks;
}

export function registerAiLabDownload(record: AiLabDownloadRecord): void {
  recordsByVideoId.set(record.videoId, record);
  lastDownloadVideoId = record.videoId;
  logNrmDev(LOG, {
    event: 'register_download',
    videoId: record.videoId,
    fileName: record.fileName.slice(0, 80),
  });
}

export function updateAiLabDownloadAudio(
  videoId: string,
  info: {
    audioUri: string;
    fileName?: string;
    location?: NrmDownloadTrackItem['location'];
  },
): void {
  const prev = recordsByVideoId.get(videoId);
  if (!prev) return;
  recordsByVideoId.set(videoId, {
    ...prev,
    audioUri: info.audioUri,
    fileName: info.fileName ?? prev.fileName,
    location: info.location ?? prev.location,
  });
}

export function getAiLabDownloadRecord(videoId?: string | null): AiLabDownloadRecord | null {
  const id = (videoId ?? lastDownloadVideoId ?? '').trim();
  if (!id) return null;
  return recordsByVideoId.get(id) ?? null;
}

export async function getAiLabLyricsCapability(): Promise<AiLabLyricsCapability> {
  if (Platform.OS === 'web') {
    return {
      ok: false,
      wav2vec2BaseInstalled: false,
      enKoTransliteratorInstalled: false,
      canAskLyrics: false,
      canGenerateLyrics: false,
      missing: ['native_only'],
      message: '웹에서는 가사 생성을 지원하지 않습니다.',
      askPrompt: null,
      choices: [],
    };
  }
  const [wav, tr] = await Promise.all([
    isAlignModelInstalled(NRM_ALIGN_WAV2VEC2_BASE_ID),
    isEnKoTransliteratorInstalled(),
  ]);
  const missing: string[] = [];
  if (!wav) missing.push('wav2vec2-base');
  if (!tr) missing.push('en-kotransliterator');
  const can = wav && tr;
  const message = can
    ? '가사 생성 준비됨 (wav2vec2-base + 다국어 발음 전처리).'
    : !wav && !tr
      ? '가사 생성을 하려면 설정에서 wav2vec2-base와 en-kotransliterator(다국어 발음 전처리)를 설치해야 합니다.'
      : !wav
        ? '가사 생성을 하려면 설정에서 wav2vec2-base 모델을 설치해야 합니다.'
        : '가사 생성을 하려면 설정에서 en-kotransliterator(다국어 발음 전처리)를 설치해야 합니다.';
  return {
    ok: can,
    wav2vec2BaseInstalled: wav,
    enKoTransliteratorInstalled: tr,
    canAskLyrics: can,
    canGenerateLyrics: can,
    missing,
    message,
    askPrompt: can ? '가사도 생성을 할까요?' : null,
    choices: can ? LYRICS_YES_NO_CHOICES : [],
  };
}

function toNativeLocalFileUri(uriOrPath: string): string {
  const trimmed = uriOrPath.trim();
  if (trimmed.startsWith('file://')) return trimmed;
  if (trimmed.startsWith('/')) return `file://${trimmed}`;
  return `file://${trimmed}`;
}

async function materializeTrackAudioToCache(
  audioUri: string,
  fileName: string,
): Promise<string> {
  const trimmed = audioUri.trim();
  if (trimmed.startsWith('file://') || trimmed.startsWith('/')) {
    return toNativeLocalFileUri(trimmed);
  }
  const cacheRoot = FileSystem.cacheDirectory;
  if (!cacheRoot) throw new Error('캐시를 사용할 수 없습니다.');
  const ext = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.')) : '.mp3';
  const dest = `${cacheRoot}nrm-ailab-lyrics-${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
  try {
    await FileSystem.copyAsync({ from: trimmed, to: dest });
  } catch {
    const b64 = await FileSystem.readAsStringAsync(trimmed, { encoding: 'base64' });
    await FileSystem.writeAsStringAsync(dest, b64, { encoding: 'base64' });
  }
  return dest;
}

async function resolveTrackForRecord(
  record: AiLabDownloadRecord,
): Promise<NrmDownloadTrackItem | null> {
  if (record.location && record.audioUri) {
    return {
      fileName: record.fileName,
      audioUri: record.audioUri,
      extension: record.fileName.includes('.')
        ? record.fileName.slice(record.fileName.lastIndexOf('.')).toLowerCase()
        : '.m4a',
      location: record.location,
      displayLabel: record.displayLabel,
      lrcUri: siblingLrcUri(record.audioUri),
    };
  }
  const tracks = await listDownloadAudioTracks();
  const byName = tracks.find(
    (t) => t.fileName.toLowerCase() === record.fileName.toLowerCase(),
  );
  if (byName) return byName;
  if (record.audioUri) {
    const byUri = tracks.find((t) => t.audioUri === record.audioUri);
    if (byUri) return byUri;
  }
  const artist = record.hit.artist.trim().toLowerCase();
  const title = record.hit.title.trim().toLowerCase();
  return (
    tracks.find((t) => {
      const label = t.displayLabel.toLowerCase();
      return label.includes(artist) && label.includes(title);
    }) ?? null
  );
}

async function readExistingLrc(track: NrmDownloadTrackItem): Promise<string | null> {
  if (track.lrcUri) {
    try {
      const text = await FileSystem.readAsStringAsync(track.lrcUri, {
        encoding: EncodingType.UTF8,
      });
      if (text.trim()) return text.trim();
    } catch {
      /* ignore */
    }
  }
  try {
    const meta = await readAudioFileMetadata(track.audioUri, track.fileName);
    const embedded = (meta.lyrics ?? '').trim();
    if (isEmbeddedSyncLyricsText(embedded)) return embedded;
  } catch {
    /* ignore */
  }
  return null;
}

function isEnglishOnlyPlain(plain: string): boolean {
  return inferMelonAlignLyricsLanguage(plain) === 'en';
}

function emitTranslationAsk(record: AiLabDownloadRecord): void {
  followupHooks.onAskTranslation?.({
    videoId: record.videoId,
    displayLabel: record.displayLabel,
    choices: TRANSLATE_YES_NO_CHOICES,
    message:
      '가사가 영어로만 되어 있습니다. 한국어로 번역할까요? (Google Translator)',
  });
}

/** 다운로드에 가사가 같이 큐된 경우 완료 후 영문이면 번역 질문 */
export async function maybeAskTranslationAfterAiLabLyrics(
  videoId: string,
): Promise<void> {
  const record = getAiLabDownloadRecord(videoId);
  if (!record) return;
  let plain = record.plainLyrics?.trim() ?? '';
  if (!plain) {
    const website =
      record.website?.trim() ||
      normalizeMelonTrackWebsite(record.hit.externalUrl) ||
      record.hit.externalUrl;
    plain = (await resolveMelonPlainLyricsForEdit(website)).trim();
    if (plain) {
      recordsByVideoId.set(videoId, { ...record, plainLyrics: plain, website });
    }
  }
  if (plain && isEnglishOnlyPlain(plain)) {
    emitTranslationAsk(getAiLabDownloadRecord(videoId) ?? record);
  }
}

export async function startAiLabLyrics(params: {
  videoId?: string;
  hit?: NrmAiLabTrackHit;
}): Promise<Record<string, unknown>> {
  if (Platform.OS === 'web') {
    return { ok: false, error: 'web_not_supported' };
  }
  const cap = await getAiLabLyricsCapability();
  if (!cap.canGenerateLyrics) {
    return {
      ok: false,
      error: 'lyrics_models_missing',
      message: cap.message,
      missing: cap.missing,
    };
  }

  let record =
    getAiLabDownloadRecord(params.videoId) ??
    (lastDownloadVideoId ? getAiLabDownloadRecord(lastDownloadVideoId) : null);
  if (!record && params.hit) {
    for (const r of recordsByVideoId.values()) {
      if (
        r.hit.ref === params.hit.ref ||
        (r.hit.artist === params.hit.artist && r.hit.title === params.hit.title)
      ) {
        record = r;
        break;
      }
    }
  }
  if (!record) {
    return {
      ok: false,
      error: 'download_not_found',
      message: '최근 다운로드 곡을 찾을 수 없습니다. 다운로드 후 다시 요청해 주세요.',
    };
  }

  const track = await resolveTrackForRecord(record);
  if (!track || track.location.kind === 'web') {
    return {
      ok: false,
      error: 'audio_not_ready',
      message: '오디오 다운로드가 아직 끝나지 않았습니다. 완료 후 다시 요청해 주세요.',
      videoId: record.videoId,
    };
  }

  const website =
    record.website?.trim() ||
    normalizeMelonTrackWebsite(record.hit.externalUrl) ||
    record.hit.externalUrl;
  const plain = (await resolveMelonPlainLyricsForEdit(website)).trim();
  if (!plain) {
    return {
      ok: false,
      error: 'melon_lyrics_unavailable',
      message: '멜론 가사를 가져올 수 없습니다.',
    };
  }

  const englishOnly = isEnglishOnlyPlain(plain);
  recordsByVideoId.set(record.videoId, { ...record, plainLyrics: plain, website });

  const videoId = record.videoId;
  const displayLabel = record.displayLabel;
  const jobId = `ailab-lyrics:${videoId}`;

  await setupNrmMobileDownloadNotifications();
  nrmNotifyDownloadStarted(videoId, displayLabel, 'lyrics');
  nrmBackgroundWorkAcquire(nrmLyricsBackgroundWorkToken(videoId));

  void enqueueLyricsDownloadWork(jobId, displayLabel, async () => {
    try {
      const workUri = await materializeTrackAudioToCache(track.audioUri, track.fileName);
      const ext = track.extension.replace(/^\./, '') || 'm4a';
      const { runWhisperTranscribeSerial } = await import('@/lib/nrmWhisperSerialGate');
      const { transcribeMelonLyricsLrc } = await import('@/lib/nrmMelonLyricsLrcStage');
      const melon = await runWhisperTranscribeSerial(displayLabel, () =>
        transcribeMelonLyricsLrc(
          workUri,
          'melon',
          ext,
          plain,
          'ko',
          AI_LAB_MELON_LYRICS_PRELOAD,
        ),
      );
      await FileSystem.deleteAsync(workUri, { idempotent: true }).catch(() => {});

      if (melon.lyricsMelonMemoryInsufficient) {
        void nrmNotifyLyricsFailed(displayLabel, videoId, '메모리가 부족합니다.');
        nrmNotifyDownloadFinished(videoId, displayLabel, false, 'lyrics');
        return;
      }
      if (!melon.lrcFull?.trim()) {
        void nrmNotifyLyricsFailed(displayLabel, videoId, '가사 정렬에 실패했습니다.');
        nrmNotifyDownloadFinished(videoId, displayLabel, false, 'lyrics');
        return;
      }

      const lyricsOutputMode = await loadLyricsOutputMode();
      if (lyricsOutputMode === 'sidecar' && track.location.kind !== 'web') {
        const { persistLrcForSavedAudio } = await import('@/lib/nrmPersistDownload.native');
        await persistLrcForSavedAudio(track.location, melon.lrcFull);
      }
      nrmNotifyDownloadFinished(videoId, displayLabel, true, 'lyrics');
      if (englishOnly) {
        emitTranslationAsk({ ...record, plainLyrics: plain });
      }
    } catch (e) {
      logNrmRunError(LOG, e, { event: 'ailab_lyrics_failed', videoId });
      void nrmNotifyLyricsFailed(displayLabel, videoId);
      nrmNotifyDownloadFinished(videoId, displayLabel, false, 'lyrics');
    } finally {
      nrmBackgroundWorkRelease(nrmLyricsBackgroundWorkToken(videoId));
    }
  }).catch((e) => {
    nrmBackgroundWorkRelease(nrmLyricsBackgroundWorkToken(videoId));
    logNrmRunError(LOG, e, { event: 'ailab_lyrics_enqueue_failed', videoId });
  });

  return {
    ok: true,
    queued: true,
    videoId,
    label: displayLabel,
    englishOnlyLikely: englishOnly,
    nextHint: englishOnly
      ? '가사 생성 큐에 넣음. 완료 후 영문이면 번역 여부를 사용자에게 묻는다.'
      : '가사 생성 큐에 넣음. 번역은 요청하지 않는다(일반 Melon 정렬만).',
  };
}

export async function translateAiLabLyrics(params: {
  videoId?: string;
}): Promise<Record<string, unknown>> {
  if (Platform.OS === 'web') {
    return { ok: false, error: 'web_not_supported' };
  }
  const record = getAiLabDownloadRecord(params.videoId);
  if (!record) {
    return {
      ok: false,
      error: 'download_not_found',
      message: '번역할 다운로드 곡을 찾을 수 없습니다.',
    };
  }
  const track = await resolveTrackForRecord(record);
  if (!track || track.location.kind === 'web') {
    return {
      ok: false,
      error: 'audio_not_ready',
      message: '오디오/가사 파일을 찾을 수 없습니다.',
    };
  }

  const existing = await readExistingLrc(track);
  if (!existing) {
    return {
      ok: false,
      error: 'lrc_not_found',
      message: '번역할 가사 파일이 없습니다. 먼저 가사를 생성해 주세요.',
    };
  }

  const videoId = record.videoId;
  const displayLabel = record.displayLabel;
  const jobId = `ailab-translate:${videoId}`;

  await setupNrmMobileDownloadNotifications();
  nrmNotifyDownloadStarted(videoId, displayLabel, 'lyrics');
  nrmBackgroundWorkAcquire(nrmLyricsBackgroundWorkToken(videoId));

  void enqueueLyricsDownloadWork(jobId, displayLabel, async () => {
    try {
      const { translateLrcToKoreanWithGoogleTranslate } = await import(
        '@/lib/nrmGoogleTranslateClient'
      );
      const translated = await translateLrcToKoreanWithGoogleTranslate(existing);
      if (!translated.ok) {
        void nrmNotifyLyricsFailed(
          displayLabel,
          videoId,
          translated.message ?? '번역에 실패했습니다.',
        );
        nrmNotifyDownloadFinished(videoId, displayLabel, false, 'lyrics');
        return;
      }
      const lyricsOutputMode = await loadLyricsOutputMode();
      if (lyricsOutputMode === 'sidecar' && track.location.kind !== 'web') {
        const { persistLrcForSavedAudio } = await import('@/lib/nrmPersistDownload.native');
        await persistLrcForSavedAudio(track.location, translated.lrc);
      }
      nrmNotifyDownloadFinished(videoId, displayLabel, true, 'lyrics');
    } catch (e) {
      logNrmRunError(LOG, e, { event: 'ailab_translate_failed', videoId });
      void nrmNotifyLyricsFailed(displayLabel, videoId, '번역에 실패했습니다.');
      nrmNotifyDownloadFinished(videoId, displayLabel, false, 'lyrics');
    } finally {
      nrmBackgroundWorkRelease(nrmLyricsBackgroundWorkToken(videoId));
    }
  }).catch((e) => {
    nrmBackgroundWorkRelease(nrmLyricsBackgroundWorkToken(videoId));
    logNrmRunError(LOG, e, { event: 'ailab_translate_enqueue_failed', videoId });
  });

  return {
    ok: true,
    queued: true,
    videoId,
    provider: 'googletranslate',
    nextHint: 'Google Translator로 번역 큐에 넣었다.',
  };
}
