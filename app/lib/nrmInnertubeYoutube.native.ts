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
  notifyInnertubeExtractFailed,
  notifyInnertubeExtractSucceeded,
} from '@/lib/nrmInnertubeExtractSession';
import { NRM_INNERTUBE_STALL_MS } from '@/lib/nrmDownloadTimeouts';
import { cancelActiveInnertubeExtractions } from '@/lib/nrmYoutubeDecipherBridge';
import {
  nrmYoutubeFetch,
  subscribeInnertubeFetchProgress,
} from '@/lib/nrmYoutubeFetch.native';
import { armWallClockTimeout, disarmWallClockTimeout } from '@/lib/nrmWallClockTimeout';
import {
  nrmYoutubeSearchEmptyQueryMessage,
  nrmYoutubeSearchOnDeviceErrorMessage,
} from '@/lib/nrmYoutubeStrings';
import * as FileSystem from 'expo-file-system/src/legacy/FileSystem';

type InnertubeClientLabel = 'android' | 'web' | 'ios';

/** 프로세스 생존 동안 클라이언트별 Innertube 세션 1개씩 재사용 (매 검색/추출 create 금지) */
const innertubeByClient = new Map<InnertubeClientLabel, Promise<Innertube>>();

/**
 * Android 검색이 continuation 없이 끝나면 true.
 * 이후 검색은 web을 우선해 무한스크롤을 살리고, 왕복(android+web)으로 1초를 넘기지 않게 한다.
 * android 세션 자체는 계속 유지(다운로드·폴백용).
 */
let preferWebForSearchPagination = false;

type WalkNode = {
  is: (...t: unknown[]) => boolean;
  as: (...t: unknown[]) => unknown;
};

function clientTypeForLabel(label: InnertubeClientLabel): ClientType {
  if (label === 'android') return ClientType.ANDROID;
  if (label === 'ios') return ClientType.IOS;
  return ClientType.WEB;
}

function invalidateInnertubeClient(label: InnertubeClientLabel): void {
  innertubeByClient.delete(label);
}

function getOrCreateInnertubeClient(label: InnertubeClientLabel): Promise<Innertube> {
  const existing = innertubeByClient.get(label);
  if (existing) return existing;
  const created = Innertube.create({
    lang: 'ko',
    location: 'KR',
    client_type: clientTypeForLabel(label),
    fetch: nrmYoutubeFetch,
  }).catch((err) => {
    invalidateInnertubeClient(label);
    throw err;
  });
  innertubeByClient.set(label, created);
  return created;
}

/**
 * android(또는 iOS) 세션만 미리 만든다. web은 폴백 시점에만 생성.
 * 호출 시점: 프로세스당 최초 YouTube 검색(콜드스타트 워밍 금지).
 */
export async function warmInnertubeSessions(): Promise<void> {
  const label: InnertubeClientLabel =
    Platform.OS === 'android'
      ? 'android'
      : isStandaloneIos()
        ? 'ios'
        : 'web';
  const startedAt = Date.now();
  const already = innertubeByClient.has(label);
  try {
    await getOrCreateInnertubeClient(label);
    logNrmDev('innertube.session', {
      event: 'warm_ok',
      client: label,
      elapsedMs: Date.now() - startedAt,
      sessionCached: already,
    });
  } catch (e) {
    logNrmRunError('innertube.session', e, {
      event: 'warm_fail',
      client: label,
      elapsedMs: Date.now() - startedAt,
    });
  }
}

/** 프로세스당 최초 YouTube 검색에서만 InnerTube 세션 워밍 */
let firstSearchInnertubeWarmPromise: Promise<void> | null = null;
let firstSearchInnertubeWarmSettled = false;

/** UI: InnerTube 최초 워밍이 끝났으면 true (미완료 시 검색 화면에 '초기화 중...' 표시) */
export function isInnertubeWarmSettled(): boolean {
  return firstSearchInnertubeWarmSettled;
}

export function ensureInnertubeWarmedOnFirstSearch(): Promise<void> {
  if (!firstSearchInnertubeWarmPromise) {
    firstSearchInnertubeWarmPromise = warmInnertubeSessions().finally(() => {
      firstSearchInnertubeWarmSettled = true;
    });
  }
  return firstSearchInnertubeWarmPromise;
}

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
  return /EXTRACT_TIMEOUT|No valid URL to decipher|Failed to decipher|No matching formats|Streaming data not available|STREAMING_DATA_MISSING|NO_DECIPHERABLE_FORMAT|status code 400|non 2xx|FETCH_FAILED|status code 403|read property 'as'|properties of null \(reading 'as'\)|Cannot cast SearchMobileHeader to one of SearchHeader/i.test(
    msg,
  );
}

/** innertube·yt-dlp 추출 중단 (사용자 취소·폴백 전환) */
class ExtractAbortedError extends Error {
  readonly reason: 'timeout' | 'cancelled';

  constructor(reason: 'timeout' | 'cancelled') {
    super(reason === 'timeout' ? 'EXTRACT_TIMEOUT' : 'EXTRACT_CANCELLED');
    this.name = 'ExtractAbortedError';
    this.reason = reason;
  }
}

/** @deprecated 타임아웃 폴백 제거 — 호환용으로만 유지 */
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

type InnertubeClientSpec = {
  label: InnertubeClientLabel;
  create: () => Promise<Innertube>;
};

function pushClientSpec(
  specs: InnertubeClientSpec[],
  label: InnertubeClientLabel,
): void {
  specs.push({
    label,
    create: () => getOrCreateInnertubeClient(label),
  });
}

/** 다운로드/추출: Android 기기에서는 android → web (세션은 클라이언트별 1회 생성 후 재사용) */
function buildExtractClientSpecs(_fetchFn: typeof fetch): InnertubeClientSpec[] {
  const specs: InnertubeClientSpec[] = [];

  if (Platform.OS === 'android') {
    pushClientSpec(specs, 'android');
    pushClientSpec(specs, 'web');
    return specs;
  }

  if (isStandaloneIos()) {
    pushClientSpec(specs, 'ios');
    pushClientSpec(specs, 'android');
    pushClientSpec(specs, 'web');
    return specs;
  }

  pushClientSpec(specs, 'web');
  pushClientSpec(specs, 'android');
  pushClientSpec(specs, 'ios');
  return specs;
}

function isInnertubeUserCancelled(e: unknown): boolean {
  return (
    (e instanceof ExtractAbortedError && e.reason === 'cancelled') ||
    (e instanceof Error && e.message === 'EXTRACT_CANCELLED')
  );
}

async function bindCancellation<T>(
  promise: Promise<T>,
  isCancelled: () => boolean,
): Promise<T> {
  if (isCancelled()) {
    throw new ExtractRaceCancelledError();
  }
  return promise;
}

/** 추출 전용 — 플랫폼별 클라이언트 순서 */
function innertubeExtractClientSpecs(
  fetchFn: typeof fetch,
): InnertubeClientSpec[] {
  return buildExtractClientSpecs(fetchFn);
}

function innertubeBrowseClientSpecs(): InnertubeClientSpec[] {
  const specs: InnertubeClientSpec[] = [];

  // 검색: 기본 android → 실패 시 web.
  // android가 continuation을 안 주면 preferWebForSearchPagination 으로 web 우선(세션은 둘 다 유지).
  if (Platform.OS === 'android') {
    if (preferWebForSearchPagination) {
      pushClientSpec(specs, 'web');
      pushClientSpec(specs, 'android');
    } else {
      pushClientSpec(specs, 'android');
      pushClientSpec(specs, 'web');
    }
    return specs;
  }

  return buildExtractClientSpecs(nrmYoutubeFetch);
}

export function getInnertube(): Promise<Innertube> {
  if (Platform.OS === 'android') {
    return getOrCreateInnertubeClient('android');
  }
  if (isStandaloneIos()) {
    return getOrCreateInnertubeClient('ios');
  }
  return getOrCreateInnertubeClient('web');
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
    if (node.is(YTNodes.Video)) {
      const v = node.as(YTNodes.Video) as InstanceType<typeof YTNodes.Video>;
      const title = v.title?.text?.trim() ?? '';
      if (!v.video_id || !title) continue;
      items.push({
        videoId: v.video_id,
        title,
        channelTitle: v.author?.name?.trim() ?? '',
        thumbnailUrl: thumbnailUrl(v.thumbnails ?? []),
      });
      continue;
    }
    // Android 검색 결과는 CompactVideo 로 오는 경우가 있음
    if (node.is(YTNodes.CompactVideo)) {
      const v = node.as(YTNodes.CompactVideo) as InstanceType<typeof YTNodes.CompactVideo>;
      const title = v.title?.text?.trim() ?? '';
      if (!v.video_id || !title) continue;
      items.push({
        videoId: v.video_id,
        title,
        channelTitle: v.author?.name?.trim() ?? '',
        thumbnailUrl: thumbnailUrl(v.thumbnails ?? []),
      });
    }
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
    // 페이지네이션(continuation)이 아닌 최초/신규 검색에서만 세션 워밍
    if (!cursor) {
      await ensureInnertubeWarmedOnFirstSearch();
    }
    if (cursor) {
      const session = innertubeSearchSessions.get(cursor);
      if (!session) {
        return {
          ok: false,
          userMessage: nrmYoutubeSearchOnDeviceErrorMessage,
          dev: { where: 'innertube.session_missing', cursor },
        };
      }
      const contStartedAt = Date.now();
      logNrmDev('innertube.search', {
        event: 'continuation_start',
        cursor,
        querySample: q.slice(0, 120),
      });
      const next = await session.getContinuation();
      innertubeSearchSessions.set(cursor, next);
      const items = extractVideosFromSearch(next);
      const hasMore = next.has_continuation;
      if (!hasMore) {
        innertubeSearchSessions.delete(cursor);
      }
      logNrmDev('innertube.search', {
        event: 'continuation_ok',
        cursor,
        itemCount: items.length,
        hasMore,
        elapsedMs: Date.now() - contStartedAt,
      });
      return { ok: true, items, nextCursor: hasMore ? cursor : null };
    }

    innertubeSearchSessions.clear();
    // 세션 풀 재사용: android → web (또는 pagination sticky 시 web → android)
    const specs = innertubeBrowseClientSpecs();
    logNrmDev('innertube.search', {
      event: 'start',
      querySample: q.slice(0, 120),
      clients: specs.map((s) => s.label),
      preferWebForSearchPagination,
    });
    let search: InnertubeSearchFeed | undefined;
    let usedClient: InnertubeClientLabel | undefined;
    let lastSearchErr: unknown;
    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i]!;
      const attemptStartedAt = Date.now();
      const hadCachedSession = innertubeByClient.has(spec.label);
      logNrmDev('innertube.search', {
        event: 'client_attempt',
        querySample: q.slice(0, 120),
        client: spec.label,
        attempt: i + 1,
        clientsTotal: specs.length,
        sessionCached: hadCachedSession,
      });
      try {
        const yt = await spec.create();
        logNrmDev('innertube.search', {
          event: 'session_ok',
          client: spec.label,
          attempt: i + 1,
          elapsedMs: Date.now() - attemptStartedAt,
          sessionCached: hadCachedSession,
        });
        search = await yt.search(q, { type: 'video' });
        usedClient = spec.label;
        // android는 결과만 오고 continuation이 비는 경우가 많음 → web으로 페이지네이션 확보
        if (
          usedClient === 'android' &&
          !search.has_continuation &&
          specs.some((s) => s.label === 'web')
        ) {
          const webStartedAt = Date.now();
          const webHadCache = innertubeByClient.has('web');
          try {
            const webYt = await getOrCreateInnertubeClient('web');
            const webSearch = await webYt.search(q, { type: 'video' });
            preferWebForSearchPagination = true;
            search = webSearch;
            usedClient = 'web';
            logNrmDev('innertube.search', {
              event: 'pagination_fallback_web',
              querySample: q.slice(0, 120),
              reason: 'android_no_continuation',
              elapsedMs: Date.now() - webStartedAt,
              sessionCached: webHadCache,
              hasMore: webSearch.has_continuation,
            });
          } catch (webErr) {
            logNrmRunError('innertube.search', webErr, {
              event: 'pagination_fallback_web_fail',
              querySample: q.slice(0, 120),
              elapsedMs: Date.now() - webStartedAt,
            });
            // android 결과 유지 (무한스크롤만 없음)
          }
        }
        logNrmDev('innertube.search', {
          event: 'search_ok',
          querySample: q.slice(0, 120),
          client: usedClient,
          attempt: i + 1,
          elapsedMs: Date.now() - attemptStartedAt,
          fellBack: i > 0 || usedClient !== spec.label,
          hasContinuation: !!search.has_continuation,
        });
        break;
      } catch (e) {
        lastSearchErr = e;
        const hasNext = i < specs.length - 1;
        logNrmRunError('innertube.search', e, {
          event: 'client_fail',
          querySample: q.slice(0, 120),
          client: spec.label,
          attempt: i + 1,
          elapsedMs: Date.now() - attemptStartedAt,
          willRetry: hasNext,
          fallbackTo: hasNext ? specs[i + 1]!.label : null,
        });
        if (hasNext) {
          logNrmDev('innertube.search', {
            event: 'fallback',
            from: spec.label,
            to: specs[i + 1]!.label,
            querySample: q.slice(0, 120),
          });
          continue;
        }
        throw e;
      }
    }
    if (!search) {
      throw lastSearchErr instanceof Error
        ? lastSearchErr
        : new Error(String(lastSearchErr ?? 'SEARCH_FAILED'));
    }
    const items = extractVideosFromSearch(search);
    let nextCursor: string | null = null;
    if (search.has_continuation) {
      innertubeSearchSeq += 1;
      const id = `inn-${innertubeSearchSeq}`;
      innertubeSearchSessions.set(id, search);
      nextCursor = id;
    }
    logNrmDev('innertube.search', {
      event: 'ok',
      querySample: q.slice(0, 120),
      client: usedClient ?? null,
      itemCount: items.length,
      hasMore: nextCursor != null,
      nextCursor,
    });
    return { ok: true, items, nextCursor };
  } catch (e) {
    const cause = e instanceof Error ? e.message : String(e);
    logNrmRunError('innertube.search', e, {
      event: 'fail',
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

/**
 * InnerTube 추출 중 HTTP/단계 진행이 멈추면 네이티브 wall-clock 로 즉시 abort → yt-dlp.
 * 긴 “전체 추출 타임아웃”이 아니라 스톨(무진행) 감지이다.
 * googlevideo 미디어 다운로드 구간은 스톨을 잠시 끈다 (수 분 소요 가능).
 */
function runInnertubeExtractWithStallWatchdog(
  videoId: string,
): Promise<string> {
  let aborted = false;
  let settled = false;
  let stallPaused = false;
  let rejectStall: ((e: Error) => void) | null = null;
  const stallId = `innertube-stall:${videoId}:${Date.now()}`;

  const stallPromise = new Promise<string>((_, reject) => {
    rejectStall = reject;
  });

  const armStall = () => {
    if (settled || stallPaused) return;
    disarmWallClockTimeout(stallId);
    armWallClockTimeout(stallId, NRM_INNERTUBE_STALL_MS, () => {
      if (settled || stallPaused) return;
      aborted = true;
      void cancelActiveInnertubeExtractions('stall');
      logDownloadStage('pipeline', 'innertube_stall', {
        videoId,
        stallMs: NRM_INNERTUBE_STALL_MS,
        fallback: 'ytdlp',
      });
      rejectStall?.(new ExtractAbortedError('timeout'));
    });
  };

  const onProgress = () => {
    if (settled || aborted || stallPaused) return;
    armStall();
  };

  const pauseStallForMediaDownload = () => {
    stallPaused = true;
    disarmWallClockTimeout(stallId);
  };

  armStall();
  const unsubHttp = subscribeInnertubeFetchProgress(onProgress);

  const work = extractWithInnertube(
    videoId,
    () => aborted,
    onProgress,
    pauseStallForMediaDownload,
  );

  return Promise.race([work, stallPromise]).finally(() => {
    settled = true;
    aborted = true;
    disarmWallClockTimeout(stallId);
    unsubHttp();
    // race 패배 쪽 미처리 rejection 방지
    void work.catch(() => {});
    void stallPromise.catch(() => {});
  });
}

/**
 * Android: innertube(android → web) → 스톨/실패 시 yt-dlp.
 * 큐 항목마다 동일 순서로 처음부터 시도.
 */
async function extractAudioSequentialFallback(videoId: string): Promise<string> {
  const ytDlpAvailable =
    Platform.OS === 'android' && isOnDeviceDownloadAvailable();

  if (!ytDlpAvailable) {
    return extractWithInnertube(videoId);
  }

  let innertubeErr: unknown;
  const extractStartedAt = Date.now();
  try {
    const uri = await runInnertubeExtractWithStallWatchdog(videoId);
    logDownloadStage('pipeline', 'extract_innertube_ok', {
      videoId,
      elapsedMs: Date.now() - extractStartedAt,
    });
    notifyInnertubeExtractSucceeded(videoId);
    return uri;
  } catch (e) {
    innertubeErr = e;
    if (isInnertubeUserCancelled(e)) throw e;
    const stalled =
      e instanceof ExtractAbortedError && e.reason === 'timeout';
    notifyInnertubeExtractFailed(videoId, stalled ? 'timeout' : 'error');
    logNrmRunError('download.innertube', e, {
      event: stalled ? 'stall_fallback' : 'all_clients_fail',
      videoId,
      fallback: 'ytdlp',
      elapsedMs: Date.now() - extractStartedAt,
    });
    logDownloadStage('pipeline', 'fallback_to_ytdlp', {
      videoId,
      reason: stalled ? 'stall' : 'error',
      elapsedMs: Date.now() - extractStartedAt,
    });
  }

  try {
    logDownloadStage('ytdlp', 'extract_start', { videoId });
    const uri = await extractWithYtDlp(videoId);
    logDownloadStage('pipeline', 'extract_ytdlp_ok', {
      videoId,
      afterInnertubeFail: true,
      elapsedMs: Date.now() - extractStartedAt,
    });
    return uri;
  } catch (ytdlpErr) {
    logNrmRunError('download.ytdlp', ytdlpErr, {
      event: 'fail',
      videoId,
      elapsedMs: Date.now() - extractStartedAt,
    });
    const second =
      ytdlpErr instanceof Error ? ytdlpErr : new Error(String(ytdlpErr));
    const first =
      innertubeErr instanceof Error
        ? innertubeErr
        : new Error(String(innertubeErr));
    throw second.message ? second : first;
  }
}

// ── youtubei.js (innertube) 경로 ────────────────────────────────────────────────

async function extractWithInnertube(
  videoId: string,
  isCancelled: () => boolean = () => false,
  onProgress: () => void = () => {},
  pauseStallForMediaDownload: () => void = () => {},
): Promise<string> {
  const cacheRoot = FileSystem.cacheDirectory;
  if (!cacheRoot) {
    throw new Error('이 기기에서 임시 저장 공간을 사용할 수 없습니다.');
  }

  const specs = innertubeExtractClientSpecs(nrmYoutubeFetch);
  let lastError: unknown;
  const { loadDownloadEncodeSettings } = await import('@/lib/nrmDownloadSettings');
  const encode = await loadDownloadEncodeSettings();
  const extractStartedAt = Date.now();
  const ping = () => {
    onProgress();
  };

  logDownloadStage('innertube', 'extract_start', {
    videoId,
    clients: specs.map((s) => s.label),
  });
  ping();

  for (let i = 0; i < specs.length; i++) {
    if (isCancelled()) {
      throw new ExtractRaceCancelledError();
    }
    const spec = specs[i]!;
    let tempUriForCleanup: string | undefined;
    const clientLabel = spec.label;
    const attemptStartedAt = Date.now();
    try {
      const hadCachedSession = innertubeByClient.has(clientLabel);
      logDownloadStage('innertube', 'client_attempt', {
        videoId,
        attempt: i + 1,
        client: clientLabel,
        clientsTotal: specs.length,
        elapsedMs: Date.now() - extractStartedAt,
        sessionCached: hadCachedSession,
      });
      ping();
      const yt = await bindCancellation(spec.create(), isCancelled);
      logDownloadStage('innertube', 'session_ok', {
        videoId,
        attempt: i + 1,
        client: clientLabel,
        elapsedMs: Date.now() - extractStartedAt,
        attemptMs: Date.now() - attemptStartedAt,
        sessionCached: hadCachedSession,
      });
      ping();
      if (isCancelled()) {
        throw new ExtractRaceCancelledError();
      }
      logDownloadStage('innertube', 'basic_info_start', {
        videoId,
        attempt: i + 1,
        client: clientLabel,
        elapsedMs: Date.now() - extractStartedAt,
      });
      ping();
      const info = await bindCancellation(
        yt.getBasicInfo(videoId),
        isCancelled,
      );
      logDownloadStage('innertube', 'basic_info_ok', {
        videoId,
        attempt: i + 1,
        client: clientLabel,
        elapsedMs: Date.now() - extractStartedAt,
        attemptMs: Date.now() - attemptStartedAt,
        hasStreamingData: !!info.streaming_data,
      });
      ping();
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

      logDownloadStage('innertube', 'decipher_start', {
        videoId,
        attempt: i + 1,
        client: clientLabel,
        elapsedMs: Date.now() - extractStartedAt,
      });
      ping();
      const formatUrl = await bindCancellation(
        format.decipher(info.actions.session.player),
        isCancelled,
      );
      if (!formatUrl) {
        throw new Error('NO_STREAM_URL');
      }
      if (isCancelled()) {
        throw new ExtractRaceCancelledError();
      }
      logDownloadStage('innertube', 'googlevideo_start', {
        videoId,
        attempt: i + 1,
        client: clientLabel,
        elapsedMs: Date.now() - extractStartedAt,
      });
      ping();
      // 미디어 다운로드는 수분 걸릴 수 있음 — 스톨 워치독 일시 중지
      pauseStallForMediaDownload();
      await downloadGooglevideoAudioToFileUri(
        formatUrl,
        info.cpn,
        tempUri,
        format,
        { isCancelled },
      );
      if (isCancelled()) {
        throw new ExtractRaceCancelledError();
      }
      ping();

      logDownloadStage('innertube', 'download_ok', {
        videoId,
        attempt: i + 1,
        client: clientLabel,
        mime,
        fellBack: i > 0,
        attemptMs: Date.now() - attemptStartedAt,
        elapsedMs: Date.now() - extractStartedAt,
        uri: tempUri.slice(0, 96),
      });

      return tempUri;
    } catch (e) {
      if (isInnertubeUserCancelled(e)) {
        if (tempUriForCleanup) {
          await FileSystem.deleteAsync(tempUriForCleanup, { idempotent: true }).catch(() => {});
        }
        throw e instanceof ExtractAbortedError
          ? e
          : new ExtractRaceCancelledError();
      }
      if (tempUriForCleanup) {
        await FileSystem.deleteAsync(tempUriForCleanup, {
          idempotent: true,
        }).catch(() => {});
      }
      lastError = e;
      const hasNextClient = i < specs.length - 1;
      logNrmRunError('innertube.download', e, {
        event: 'client_fail',
        videoId,
        attempt: i + 1,
        client: clientLabel,
        attemptMs: Date.now() - attemptStartedAt,
        elapsedMs: Date.now() - extractStartedAt,
        willRetry: hasNextClient,
        fallbackTo: hasNextClient ? specs[i + 1]!.label : 'ytdlp_or_fail',
      });
      // 어떤 실패든 즉시 다음 클라이언트 (타임아웃 대기 없음)
      if (hasNextClient) {
        logDownloadStage('innertube', 'fallback', {
          videoId,
          from: clientLabel,
          to: specs[i + 1]!.label,
          attemptMs: Date.now() - attemptStartedAt,
        });
        ping();
        void cancelActiveInnertubeExtractions('client_fail');
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
  const specs = innertubeBrowseClientSpecs();
  logNrmDev('innertube.stream', {
    event: 'start',
    videoId,
    clients: specs.map((s) => s.label),
  });

  let lastError: unknown;
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i]!;
    const attemptStartedAt = Date.now();
    logNrmDev('innertube.stream', {
      event: 'client_attempt',
      videoId,
      client: spec.label,
      attempt: i + 1,
    });
    try {
      const yt = await spec.create();
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
      logNrmDev('innertube.stream', {
        event: 'ok',
        videoId,
        client: spec.label,
        attempt: i + 1,
        fellBack: i > 0,
        elapsedMs: Date.now() - attemptStartedAt,
      });
      return formatUrl;
    } catch (e) {
      lastError = e;
      const hasNext = i < specs.length - 1;
      const msg = e instanceof Error ? e.message : String(e);
      logNrmRunError('innertube.stream', e, {
        event: 'client_fail',
        videoId,
        client: spec.label,
        attempt: i + 1,
        willRetry: hasNext && shouldRetryInnertubeDownload(msg),
        fallbackTo: hasNext ? specs[i + 1]!.label : null,
        elapsedMs: Date.now() - attemptStartedAt,
      });
      if (hasNext && shouldRetryInnertubeDownload(msg)) {
        logNrmDev('innertube.stream', {
          event: 'fallback',
          videoId,
          from: spec.label,
          to: specs[i + 1]!.label,
        });
        continue;
      }
      throw e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

// ── 공개 진입점 ───────────────────────────────────────────────────────────────
/**
 * 모바일 오디오 다운로드 진입점.
 *
 * Android: innertube android → web → (스톨/실패 시) yt-dlp.
 * InnerTube HTTP 는 네이티브 고정, 백그라운드 WebView 금지, 무진행 시 스톨 워치독.
 * 가사/병렬 파이프라인은 그대로.
 * iOS: youtubei.js 경로 (yt-dlp 바이너리 실행 불가).
 */
export async function downloadYoutubeAudioOnDevice(
  videoId: string,
  userSuggestedFileName: string,
  metadata?: NrmAudioFileMetadata,
): Promise<{ savedLabel: string }> {
  const ytDlpAvailable =
    Platform.OS === 'android' && isOnDeviceDownloadAvailable();

  logNrmDev('download.route', {
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
