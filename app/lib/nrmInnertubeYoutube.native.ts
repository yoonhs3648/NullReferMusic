import '@/lib/nrmYoutubeInnertubeEvalSetup';
import Innertube, { ClientType, FormatUtils, YTNodes } from 'youtubei.js';
import { Platform } from 'react-native';

import { isStandaloneIos } from '@/lib/nrmStandalonePlatform';
import type { NrmAudioFileMetadata } from '@/lib/nrmDownloadAudioMetadata';
import type { NrmAudioExtension, NrmDownloadEncodeSettings } from '@/lib/nrmDownloadSettings';
import { displayLabelFromAudioFileName, sanitizeFileBase } from '@/lib/nrmYoutubeDownloadMeta';
import { downloadGooglevideoAudioToFileUri } from '@/lib/nrmYoutubeGooglevideoDownload.native';
import {
  isOnDeviceDownloadAvailable,
  cancelActiveYtdlpDownload,
  downloadOnDevice,
  transcodeAudioOnDevice,
} from '@/lib/onDeviceDownload';
import type {
  YoutubeSearchItem,
  YoutubeSearchOutcome,
} from '@/lib/youtubeSearchTypes';
import { logNrmDev, logNrmRunError } from '@/lib/nrmDevLog';
import { logDownloadStage } from '@/lib/nrmDownloadStageLog';
import {
  NRM_INNERTUBE_EXTRACT_TIMEOUT_MS,
  NRM_YTDLP_EXTRACT_TIMEOUT_MS,
} from '@/lib/nrmDownloadTimeouts';
import {
  nrmYoutubeSearchEmptyQueryMessage,
  nrmYoutubeSearchOnDeviceErrorMessage,
} from '@/lib/nrmYoutubeStrings';
import * as FileSystem from 'expo-file-system/src/legacy/FileSystem';

import { nrmYoutubeFetch } from '@/lib/nrmYoutubeFetch.native';

let innertubeSingleton: Promise<Innertube> | null = null;

type WalkNode = {
  is: (...t: unknown[]) => boolean;
  as: (...t: unknown[]) => unknown;
};

/** Player.decipher 에 넘길 URL·cipher 정보가 있는 포맷만 남깁니다. */
type PlaybackFields = {
  url?: string;
  signature_cipher?: string;
  cipher?: string;
};

function hasPlaybackFields(f: PlaybackFields): boolean {
  return !!(f.url || f.signature_cipher || f.cipher);
}

function filterDecipherableStreamingData<
  T extends {
    formats?: PlaybackFields[];
    adaptive_formats?: PlaybackFields[];
  },
>(sd: T): T | null {
  const formats = (sd.formats ?? []).filter(hasPlaybackFields);
  const adaptive_formats = (sd.adaptive_formats ?? []).filter(hasPlaybackFields);
  if (formats.length === 0 && adaptive_formats.length === 0) return null;
  return { ...sd, formats, adaptive_formats };
}

function shouldRetryInnertubeDownload(msg: string): boolean {
  return /No valid URL to decipher|Failed to decipher|No matching formats|Streaming data not available|STREAMING_DATA_MISSING|NO_DECIPHERABLE_FORMAT|status code 400|non 2xx|FETCH_FAILED|status code 403|read property 'as'|properties of null \(reading 'as'\)/i.test(
    msg,
  );
}

/** Chaquopy·네이티브 모듈 자체가 없을 때만 innertube 폴백을 건너뜁니다. */
function innertubeClientAttempts(): Array<() => Promise<Innertube>> {
  return [
    getInnertube,
    () =>
      Innertube.create({
        lang: 'ko',
        location: 'KR',
        client_type: ClientType.ANDROID,
        fetch: nrmYoutubeFetch,
      }),
    () =>
      Innertube.create({
        lang: 'ko',
        location: 'KR',
        client_type: ClientType.IOS,
        fetch: nrmYoutubeFetch,
      }),
    () =>
      Innertube.create({
        lang: 'ko',
        location: 'KR',
        client_type: ClientType.WEB,
        fetch: nrmYoutubeFetch,
      }),
  ];
}

export function getInnertube(): Promise<Innertube> {
  if (!innertubeSingleton) {
    innertubeSingleton = Innertube.create({
      lang: 'ko',
      location: 'KR',
      fetch: nrmYoutubeFetch,
    });
  }
  return innertubeSingleton;
}

function* walkNodes(nodes: Iterable<WalkNode>): Generator<WalkNode> {
  for (const n of nodes) {
    yield n;
    if (n.is(YTNodes.ItemSection)) {
      const sec = n.as(YTNodes.ItemSection) as { contents: Iterable<WalkNode> };
      yield* walkNodes(sec.contents);
    }
  }
}

function thumbnailUrl(thumbnails: { url?: string }[]): string {
  const hi = [...thumbnails].sort((a, b) => {
    const wa = (a as { width?: number }).width ?? 0;
    const wb = (b as { width?: number }).width ?? 0;
    return wb - wa;
  })[0];
  return hi?.url ?? '';
}

function extractVideosFromSearch(search: { results: Iterable<unknown> }): YoutubeSearchItem[] {
  const items: YoutubeSearchItem[] = [];
  for (const node of walkNodes(search.results as Iterable<WalkNode>)) {
    if (!node.is(YTNodes.Video)) continue;
    const v = node.as(YTNodes.Video) as InstanceType<typeof YTNodes.Video>;
    const title = v.title?.text?.trim() ?? '';
    if (!v.video_id || !title) continue;
    items.push({
      videoId: v.video_id,
      title,
      channelTitle: v.author?.name?.trim() ?? '',
      thumbnailUrl: thumbnailUrl(v.thumbnails ?? []),
    });
  }
  return items;
}

type InnertubeSearchFeed = Awaited<ReturnType<Innertube['search']>>;

let innertubeSearchSeq = 0;
const innertubeSearchSessions = new Map<string, InnertubeSearchFeed>();

export async function searchYoutubePageOnDevice(
  query: string,
  cursor: string | null = null,
): Promise<YoutubeSearchOutcome> {
  const q = query.trim();
  if (!q.length) {
    return {
      ok: false,
      userMessage: nrmYoutubeSearchEmptyQueryMessage,
      dev: { where: 'innertube.emptyQuery' },
    };
  }
  try {
    if (cursor) {
      const session = innertubeSearchSessions.get(cursor);
      if (!session) {
        return {
          ok: false,
          userMessage: nrmYoutubeSearchOnDeviceErrorMessage,
          dev: { where: 'innertube.session_missing', cursor },
        };
      }
      const next = await session.getContinuation();
      innertubeSearchSessions.set(cursor, next);
      const items = extractVideosFromSearch(next);
      const hasMore = next.has_continuation;
      if (!hasMore) {
        innertubeSearchSessions.delete(cursor);
      }
      return { ok: true, items, nextCursor: hasMore ? cursor : null };
    }

    innertubeSearchSessions.clear();
    const yt = await getInnertube();
    const search = await yt.search(q, { type: 'video' });
    const items = extractVideosFromSearch(search);
    let nextCursor: string | null = null;
    if (search.has_continuation) {
      innertubeSearchSeq += 1;
      const id = `inn-${innertubeSearchSeq}`;
      innertubeSearchSessions.set(id, search);
      nextCursor = id;
    }
    return { ok: true, items, nextCursor };
  } catch (e) {
    const cause = e instanceof Error ? e.message : String(e);
    logNrmRunError('innertube.search', e, {
      querySample: q.slice(0, 120),
      cursor: cursor ?? null,
    });
    return {
      ok: false,
      userMessage: nrmYoutubeSearchOnDeviceErrorMessage,
      dev: { where: 'innertube.search', cause },
    };
  }
}

export async function searchYoutubeOnDevice(
  query: string,
): Promise<YoutubeSearchOutcome> {
  return searchYoutubePageOnDevice(query, null);
}

function extensionFromMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes('audio/mp4') || m.includes('audio/m4a')) return '.m4a';
  if (m.includes('webm')) return '.webm';
  if (m.includes('mpeg') || m.includes('mp3')) return '.mp3';
  return '.m4a';
}

function mimeMatchesPreferredExtension(mime: string | undefined, ext: NrmAudioExtension): boolean {
  const m = (mime ?? '').toLowerCase();
  switch (ext) {
    case '.mp3':
      return m.includes('mpeg') || m.includes('mp3');
    case '.m4a':
      return m.includes('mp4') || m.includes('m4a');
    case '.opus':
      return m.includes('opus');
    case '.ogg':
      return m.includes('ogg');
    case '.aac':
      return m.includes('aac');
    case '.flac':
      return m.includes('flac');
    case '.wav':
      return m.includes('wav');
    default:
      return false;
  }
}

/** IPA 전용: 사용자 확장자 설정에 맞는 오디오 포맷 우선 선택 */
function chooseInnertubeAudioFormat(
  streamingData: NonNullable<Awaited<ReturnType<Innertube['getBasicInfo']>>['streaming_data']>,
  preferredExt: NrmAudioExtension,
): ReturnType<typeof FormatUtils.chooseFormat> {
  const candidates = [
    ...(streamingData.adaptive_formats ?? []),
    ...(streamingData.formats ?? []),
  ].filter((f) => f.has_audio && !f.has_video);

  const preferred = candidates.filter((f) =>
    mimeMatchesPreferredExtension(f.mime_type, preferredExt),
  );
  const pool = preferred.length > 0 ? preferred : candidates;

  if (pool.length > 0) {
    const best = [...pool].sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];
    return best;
  }

  return FormatUtils.chooseFormat({ type: 'audio', quality: 'best' }, streamingData);
}

function stageWrapError(stage: string, err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err);
  return new Error(`[stage:${stage}] ${msg}`);
}

export function finalAudioFileName(
  userFileName: string,
  streamMime: string,
): string {
  const stem = userFileName.replace(/\.(mp3|m4a|webm|opus|mp4)$/i, '').trim();
  const base = sanitizeFileBase(stem || 'track');
  return `${base}${extensionFromMime(streamMime)}`;
}

/** Android: 실제 파일 확장자가 설정과 다르면 ffmpeg로 변환 */
async function ensureAudioMatchesUserExtension(
  fileUri: string,
  encode: NrmDownloadEncodeSettings,
): Promise<string> {
  if (Platform.OS !== 'android' || !isOnDeviceDownloadAvailable()) {
    return fileUri;
  }
  const {
    extensionToYtDlpFormat,
    extensionFromLocalPath,
    assertLocalPathMatchesExtension,
  } = await import('@/lib/nrmDownloadSettings');
  const { shouldSkipExtensionTranscode } = await import('@/lib/nrmDownloadEncodePolicy');
  const wantExt = encode.extension.slice(1).toLowerCase();
  const path = fileUri.startsWith('file://') ? fileUri.slice(7) : fileUri;
  const haveExt = extensionFromLocalPath(path);
  if (shouldSkipExtensionTranscode(encode.losslessMode, haveExt, wantExt)) {
    return fileUri;
  }

  const { path: outPath } = await transcodeAudioOnDevice(
    path,
    extensionToYtDlpFormat(encode.extension),
    encode,
  );
  const outUri = outPath.startsWith('file://') ? outPath : `file://${outPath}`;
  assertLocalPathMatchesExtension(outUri, encode.extension);
  await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
  return outUri;
}

// ── yt-dlp (Chaquopy) 경로 ────────────────────────────────────────────────────
/**
 * Android: Chaquopy yt-dlp 로 다운로드 후 미디어 라이브러리에 저장합니다.
 * yt-dlp는 user-agent, extractor-args, 쿠키, referer를 모두 처리하므로
 * googlevideo 403을 가장 확실하게 우회합니다.
 *
 * @returns savedLabel  성공시 사용자에게 보여줄 메시지. 실패시 throw.
 */
async function tagThenPersist(
  fileUri: string,
  safeName: string,
  metadata?: NrmAudioFileMetadata,
  pipelineJobId?: string,
): Promise<{ savedLabel: string; lyricsWarning?: 'not_embedded' | 'translation_failed' | 'translation_exhausted' | 'melon_align_failed' | 'memory_insufficient' }> {
  const jobId = pipelineJobId?.trim() || `legacy-${Date.now()}`;
  const { registerDownloadPipelineStart, registerDownloadPipelineEnd } =
    await import('@/lib/nrmDownloadLyricsWorkGate');
  registerDownloadPipelineStart(jobId);
  const { loadDownloadEncodeSettings, applyDownloadExtension } =
    await import('@/lib/nrmDownloadSettings');
  const encode = await loadDownloadEncodeSettings();
  const { applyFfmpegTranscodeStage, applyFfmpegMetadataStage } =
    await import('@/lib/nrmDownloadAudioStages');
  let uri = await applyFfmpegTranscodeStage(fileUri);
  uri = await applyFfmpegMetadataStage(uri, metadata);
  registerDownloadPipelineEnd(jobId, 'legacy_meta_done');
  const resolvedName = applyDownloadExtension(safeName, encode.extension);
  const { postProcessDownloadedAudio } = await import('@/lib/nrmDownloadAudioStages');
  const { fileUri: processedUri, lyricsWarning } = await postProcessDownloadedAudio(
    uri,
    metadata,
    encode.extension,
  );
  const { persistLocalAudioFile } = await import('@/lib/nrmPersistDownload.native');
  try {
    const saved = await persistLocalAudioFile(processedUri, resolvedName, metadata);
    return { ...saved, lyricsWarning };
  } catch (persistErr) {
    await FileSystem.deleteAsync(processedUri, { idempotent: true }).catch(() => {});
    throw stageWrapError('persist_media', persistErr);
  }
}

async function extractWithYtDlp(videoId: string): Promise<string> {
  const { loadDownloadEncodeSettings, extensionToYtDlpFormat } =
    await import('@/lib/nrmDownloadSettings');
  const encode = await loadDownloadEncodeSettings();

  const ytUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  let result: { path: string; message?: string };
  const t0 = Date.now();
  try {
    result = await downloadOnDevice(ytUrl, true, {
      audioFormat: extensionToYtDlpFormat(encode.extension),
      audioQuality: encode.audioQuality,
    });
  } catch (e) {
    throw stageWrapError('ondevice_exec', e);
  }

  const rawPath: string = result.path;
  logDownloadStage('ytdlp', 'extract_ok', {
    videoId,
    elapsedMs: Date.now() - t0,
    path: rawPath.slice(0, 96),
  });
  return rawPath.startsWith('file://') ? rawPath : `file://${rawPath}`;
}

/** innertube·yt-dlp 추출 중단 (타임아웃·폴백 전환) */
class ExtractAbortedError extends Error {
  readonly reason: 'timeout' | 'cancelled';

  constructor(reason: 'timeout' | 'cancelled') {
    super(reason === 'timeout' ? 'EXTRACT_TIMEOUT' : 'EXTRACT_CANCELLED');
    this.name = 'ExtractAbortedError';
    this.reason = reason;
  }
}

/** yt-dlp 5분 초과 — 다운로드 요청 전체 취소 대상 */
export class YtdlpExtractTimeoutError extends ExtractAbortedError {
  constructor() {
    super('timeout');
    this.name = 'YtdlpExtractTimeoutError';
  }
}

/** @deprecated ExtractAbortedError 사용 */
class ExtractRaceCancelledError extends ExtractAbortedError {
  constructor() {
    super('cancelled');
    this.name = 'ExtractRaceCancelledError';
  }
}

async function withExtractTimeout<T>(
  run: (isAborted: () => boolean) => Promise<T>,
  timeoutMs: number,
  onTimeout: () => void,
): Promise<T> {
  let aborted = false;
  const isAborted = () => aborted;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run(isAborted),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          aborted = true;
          onTimeout();
          reject(new ExtractAbortedError('timeout'));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Android: innertube 우선 → (실패·1분 타임아웃) yt-dlp 폴백.
 * yt-dlp는 5분 내 완료되지 않으면 YtdlpExtractTimeoutError.
 */
async function extractAudioSequentialFallback(videoId: string): Promise<string> {
  const ytDlpAvailable =
    Platform.OS === 'android' && isOnDeviceDownloadAvailable();

  if (!ytDlpAvailable) {
    return extractWithInnertube(videoId);
  }

  let innertubeErr: unknown;
  try {
    const uri = await withExtractTimeout(
      (isAborted) => extractWithInnertube(videoId, isAborted),
      NRM_INNERTUBE_EXTRACT_TIMEOUT_MS,
      () => {
        logDownloadStage('innertube', 'extract_timeout', {
          videoId,
          timeoutMs: NRM_INNERTUBE_EXTRACT_TIMEOUT_MS,
        });
      },
    );
    logDownloadStage('pipeline', 'extract_innertube_ok', { videoId });
    return uri;
  } catch (e) {
    innertubeErr = e;
    if (e instanceof YtdlpExtractTimeoutError) throw e;
    logNrmRunError('download.innertube', e, {
      videoId,
      fallback: 'ytdlp',
      timedOut: e instanceof ExtractAbortedError && e.reason === 'timeout',
    });
  }

  try {
    const uri = await withExtractTimeout(
      (_isAborted) => extractWithYtDlp(videoId),
      NRM_YTDLP_EXTRACT_TIMEOUT_MS,
      () => {
        void cancelActiveYtdlpDownload();
        logDownloadStage('ytdlp', 'extract_timeout', {
          videoId,
          timeoutMs: NRM_YTDLP_EXTRACT_TIMEOUT_MS,
        });
      },
    );
    logDownloadStage('pipeline', 'extract_ytdlp_ok', {
      videoId,
      afterInnertubeFail: true,
    });
    return uri;
  } catch (ytdlpErr) {
    if (
      ytdlpErr instanceof ExtractAbortedError &&
      ytdlpErr.reason === 'timeout'
    ) {
      throw new YtdlpExtractTimeoutError();
    }
    logNrmRunError('download.ytdlp', ytdlpErr, { videoId });
    const second =
      ytdlpErr instanceof Error ? ytdlpErr : new Error(String(ytdlpErr));
    const first =
      innertubeErr instanceof Error ? innertubeErr : new Error(String(innertubeErr));
    throw second.message ? second : first;
  }
}

// ── youtubei.js (innertube) 경로 ────────────────────────────────────────────────

async function extractWithInnertube(
  videoId: string,
  isCancelled: () => boolean = () => false,
): Promise<string> {
  const cacheRoot = FileSystem.cacheDirectory;
  if (!cacheRoot) {
    throw new Error('이 기기에서 임시 저장 공간을 사용할 수 없습니다.');
  }

  const attempts = innertubeClientAttempts();

  let lastError: unknown;
  const { loadDownloadEncodeSettings } = await import('@/lib/nrmDownloadSettings');
  const encode = await loadDownloadEncodeSettings();

  for (let i = 0; i < attempts.length; i++) {
    if (isCancelled()) {
      throw new ExtractRaceCancelledError();
    }
    let tempUriForCleanup: string | undefined;
    try {
      const yt = await attempts[i]();
      if (isCancelled()) {
        throw new ExtractRaceCancelledError();
      }
      const info = await yt.getBasicInfo(videoId);
      if (!info.streaming_data) {
        throw new Error('STREAMING_DATA_MISSING');
      }
      const filtered = filterDecipherableStreamingData(info.streaming_data);
      if (!filtered) {
        throw new Error('NO_DECIPHERABLE_FORMAT');
      }
      Object.assign(info, { streaming_data: filtered });

      let format = FormatUtils.chooseFormat(
        { type: 'audio', quality: 'best' },
        filtered,
      );
      if (Platform.OS === 'android' || isStandaloneIos()) {
        format = chooseInnertubeAudioFormat(filtered, encode.extension);
      }
      const mime = format.mime_type ?? 'audio/mp4';
      const tempStemName = finalAudioFileName('track', mime);

      const tempBase =
        cacheRoot.endsWith('/') || cacheRoot.endsWith('\\')
          ? `${cacheRoot}nrm-local-${videoId}-`
          : `${cacheRoot}/nrm-local-${videoId}-`;
      const tempUri = `${tempBase}${Date.now()}-${tempStemName}`;
      tempUriForCleanup = tempUri;

      const formatUrl = await format.decipher(info.actions.session.player);
      if (!formatUrl) {
        throw new Error('NO_STREAM_URL');
      }
      if (isCancelled()) {
        throw new ExtractRaceCancelledError();
      }
      await downloadGooglevideoAudioToFileUri(
        formatUrl,
        info.cpn,
        tempUri,
        format,
      );
      if (isCancelled()) {
        throw new ExtractRaceCancelledError();
      }

      logDownloadStage('innertube', 'download_ok', {
        videoId,
        attempt: i + 1,
        mime,
        uri: tempUri.slice(0, 96),
      });

      return tempUri;
    } catch (e) {
      if (e instanceof ExtractAbortedError) {
        if (tempUriForCleanup) {
          await FileSystem.deleteAsync(tempUriForCleanup, { idempotent: true }).catch(() => {});
        }
        throw e;
      }
      if (tempUriForCleanup) {
        await FileSystem.deleteAsync(tempUriForCleanup, {
          idempotent: true,
        }).catch(() => {});
      }
      lastError = e;
      const msg = e instanceof Error ? e.message : String(e);
      logNrmRunError('innertube.download', e, {
        videoId,
        attempt: i + 1,
        willRetry:
          i < attempts.length - 1 && shouldRetryInnertubeDownload(msg),
      });
      if (i < attempts.length - 1 && shouldRetryInnertubeDownload(msg)) {
        continue;
      }
      throw e;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(String(lastError));
}

async function downloadWithInnertube(
  videoId: string,
  userSuggestedFileName: string,
  metadata?: NrmAudioFileMetadata,
): Promise<{ savedLabel: string }> {
  const fileUri = await extractWithInnertube(videoId);
  return tagThenPersist(fileUri, userSuggestedFileName, metadata);
}

/** yt-dlp/innertube로 오디오만 추출 (ffmpeg·저장 전) */
export async function extractYoutubeAudioOnDevice(videoId: string): Promise<{ fileUri: string }> {
  if (Platform.OS === 'android') {
    return { fileUri: await extractAudioSequentialFallback(videoId) };
  }
  return { fileUri: await extractWithInnertube(videoId) };
}

/** 추출된 파일에 메타데이터(ffmpeg) 적용 후 저장 */
export async function finalizeYoutubeAudioOnDevice(
  fileUri: string,
  userSuggestedFileName: string,
  metadata?: NrmAudioFileMetadata,
): Promise<{ savedLabel: string; lyricsWarning?: 'not_embedded' | 'translation_failed' | 'translation_exhausted' | 'melon_align_failed' | 'memory_insufficient' }> {
  return tagThenPersist(fileUri, userSuggestedFileName, metadata);
}

export async function getAudioStreamUrlWithInnertube(
  videoId: string,
): Promise<string> {
  const attempts = innertubeClientAttempts();

  let lastError: unknown;
  for (let i = 0; i < attempts.length; i++) {
    try {
      const yt = await attempts[i]();
      const info = await yt.getBasicInfo(videoId);
      if (!info.streaming_data) throw new Error('STREAMING_DATA_MISSING');
      const filtered = filterDecipherableStreamingData(info.streaming_data);
      if (!filtered) throw new Error('NO_DECIPHERABLE_FORMAT');
      Object.assign(info, { streaming_data: filtered });
      const format = FormatUtils.chooseFormat(
        { type: 'audio', quality: 'best' },
        filtered,
      );
      const formatUrl = await format.decipher(info.actions.session.player);
      if (!formatUrl) throw new Error('NO_STREAM_URL');
      return formatUrl;
    } catch (e) {
      lastError = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (i < attempts.length - 1 && shouldRetryInnertubeDownload(msg)) continue;
      throw e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

// ── 공개 진입점 ───────────────────────────────────────────────────────────────
/**
 * 모바일 오디오 다운로드 진입점.
 *
 * Android: innertube 우선 → 실패·1분 타임아웃 시 yt-dlp(Chaquopy) 폴백.
 * iOS: youtubei.js 경로 (yt-dlp 바이너리 실행 불가).
 */
export async function downloadYoutubeAudioOnDevice(
  videoId: string,
  userSuggestedFileName: string,
  metadata?: NrmAudioFileMetadata,
): Promise<{ savedLabel: string }> {
  const ytDlpAvailable =
    Platform.OS === 'android' && isOnDeviceDownloadAvailable();

  logNrmRunError('download.route', null, {
    platform: Platform.OS,
    ytDlpAvailable,
    videoId,
  });

  const { applyDownloadExtension, loadDownloadEncodeSettings } =
    await import('@/lib/nrmDownloadSettings');
  const encode = await loadDownloadEncodeSettings();
  const displayLabel = displayLabelFromAudioFileName(
    applyDownloadExtension(userSuggestedFileName, encode.extension),
  );

  try {
    if (Platform.OS === 'android') {
      const fileUri = await extractAudioSequentialFallback(videoId);
      return tagThenPersist(fileUri, userSuggestedFileName, metadata);
    }

    return downloadWithInnertube(videoId, userSuggestedFileName, metadata);
  } catch (e) {
    const { reportNativeDownloadExtractFailure } =
      await import('@/lib/nrmDownloadFailureReport');
    await reportNativeDownloadExtractFailure(videoId, displayLabel, e);
    throw e;
  }
}
