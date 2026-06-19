import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  InteractionManager,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { NrmScrollToTopFab } from '@/components/nrm/NrmScrollToTopFab';

import { nrmTokens } from '@/constants/nrmTokens';
import { logNrmRunError } from '@/lib/nrmDevLog';
import {
  nrmYoutubeDownloadYtDlpFailedMessage,
  nrmYoutubeSearchBackendConnectionMessage,
  nrmYoutubeSearchOnDeviceErrorMessage,
  nrmYoutubeSearchPlaceholder,
} from '@/lib/nrmYoutubeStrings';
import {
  nrmNotifyDownloadFinished,
  nrmNotifyDownloadStarted,
  nrmNotifyDownloadWorkEnded,
} from '@/lib/nrmMobileDownloadNotifications';
import {
  nrmBackgroundWorkAcquire,
  nrmBackgroundWorkRelease,
  nrmDownloadBackgroundWorkToken,
  nrmLyricsBackgroundWorkToken,
} from '@/lib/nrmBackgroundWork';
import {
  normalizeDownloadMetadata,
  type NrmAudioFileMetadata,
} from '@/lib/nrmDownloadAudioMetadata';
import {
  cleanupAudioExtraction,
  finalizeAudioDownloadParallel,
  startAudioExtraction,
  type AudioExtractionResult,
} from '@/lib/nrmDownloadPipeline';
import { loadDownloadMetadataMode } from '@/lib/nrmDownloadSettings';
import {
  DownloadMetadataAuthInterruptedError,
  DownloadMetadataUnavailableError,
  resolveAutoDownloadMetadataWithAuth,
  resolveModalInitialMetadataFieldsWithAuth,
  type DownloadMetadataAuthHandlers,
} from '@/lib/nrmDownloadMetadataAuth';
import { resolveDownloadFileName } from '@/lib/nrmResolveDownloadPayload';
import { enrichMelonDownloadMetadata } from '@/lib/nrmMelonMetadataEnricher';
import type { ChartTrackItem } from '@/lib/nrmChartsTypes';
import { chartTrackDisplayLabel } from '@/lib/nrmChartsTypes';
import { displayLabelFromAudioFileName } from '@/lib/nrmYoutubeDownloadMeta';
import { notifyUser, confirmUser } from '@/lib/nrmUserNotify';
import { openDownloadSettingsPanel } from '@/lib/nrmDownloadNavEvents';
import {
  mergeYoutubeSearchItems,
  searchYoutubePage,
  type YoutubeSearchItem,
} from '@/lib/youtubeSearchClient';
import {
  YOUTUBE_SEARCH_PAGE_SIZE,
  YOUTUBE_SEARCH_SCROLL_TOP_THRESHOLD,
} from '@/lib/nrmYoutubeSearchPageSize';

import { NrmDownloadMetadataUnavailableOverlay } from '@/components/nrm/NrmDownloadMetadataUnavailableOverlay';
import { NrmLyricsEmbedUnavailableOverlay } from '@/components/nrm/NrmLyricsEmbedUnavailableOverlay';
import { NrmLyricsTranslationFailedOverlay } from '@/components/nrm/NrmLyricsTranslationFailedOverlay';
import { NrmMetadataEditModal } from '@/components/nrm/NrmMetadataEditModal';
import { YoutubeEmbed } from '@/components/nrm/YoutubeEmbed';

const DOWNLOAD_CONSENT_KEY = 'nrm_download_user_consent_v1';

/** Android W^X exec 거부(code_cache 바이너리) — 저장 권한과 구분 */
function isBinaryExecPermissionError(raw: string, full: string): boolean {
  const execPathHint =
    raw.includes('code_cache') ||
    raw.includes('whisper-cli') ||
    raw.includes('/ffmpeg/ffmpeg') ||
    raw.includes('cannot run program') ||
    raw.includes('operation not permitted');
  const permHint =
    raw.includes('permission denied') ||
    raw.includes('error=13') ||
    raw.includes('eacces') ||
    raw.includes('errno 13');
  return execPathHint && permHint;
}

function mapDownloadUserMessage(err: unknown): string {
  const full = err instanceof Error ? err.message : String(err);
  const raw = full.toLowerCase();
  if (full.includes('yt-dlp 실행이 실패') || raw.includes('yt-dlp를 찾을 수 없')) {
    return nrmYoutubeDownloadYtDlpFailedMessage;
  }
  if (isBinaryExecPermissionError(raw, full)) {
    return '오디오 변환(ffmpeg)에 실패했습니다. 앱을 완전히 종료한 뒤 다시 시도하거나, 확장자를 m4a로 바꿔 보세요.';
  }
  if (
    raw.includes('permission denied') ||
    raw.includes('error-13') ||
    raw.includes('eacces') ||
    (raw.includes('권한') && raw.includes('필요')) ||
    raw.includes('not declared in androidmanifest') ||
    (raw.includes('read_media_audio') && raw.includes('not declared')) ||
    raw.includes('requestpermissionsasync') && raw.includes('rejected') &&
      (raw.includes('not declared') || raw.includes('audio permission'))
  ) {
    return '저장 권한 문제로 다운로드하지 못했습니다.';
  }
  if (
    raw.includes('다운로드 폴더') ||
    raw.includes('saf') ||
    raw.includes('[stage:persist_media]')
  ) {
    return '저장 폴더 문제로 다운로드하지 못했습니다. 메뉴 → 다운로드 설정에서 경로를 확인하세요.';
  }
  if (raw.includes('ffmpeg_required') || raw.includes('transcode_failed') || raw.includes('ffmpeg_exit_') || raw.includes('shineenc_exit_') || raw.includes('e_type')) {
    return '오디오 변환(ffmpeg)에 실패했습니다. 앱을 완전히 종료한 뒤 다시 시도하거나, 확장자를 m4a로 바꿔 보세요.';
  }
  if (
    raw.includes('ffmpeg') ||
    raw.includes('postprocessor') ||
    raw.includes('download_failed')
  ) {
    return 'YouTube에서 오디오를 받지 못했습니다. 잠시 후 다시 시도하거나, 네트워크·YouTube 로그인 상태를 확인하세요.';
  }
  if (raw.includes('network') || raw.includes('timeout') || raw.includes('http')) {
    return '네트워크 문제로 다운로드하지 못했습니다.';
  }
  if (__DEV__ && full.trim()) {
    return `다운로드에 실패했습니다. (${full.slice(0, 120)})`;
  }
  return '알 수 없는 오류가 발생했습니다.';
}

function parseDownloadStage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const m = raw.match(/\[stage:([^\]]+)\]/);
  return m?.[1] ?? 'unknown';
}

async function ensureDownloadConsent(): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  const saved = await AsyncStorage.getItem(DOWNLOAD_CONSENT_KEY);
  if (saved === 'true') return true;
  const ok = await new Promise<boolean>((resolve) => {
    Alert.alert(
      '다운로드 안내',
      '오디오 다운로드를 위해 저장 권한을 사용합니다. 계속할까요?',
      [
        { text: '취소', style: 'cancel', onPress: () => resolve(false) },
        { text: '동의', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
  if (ok) {
    await AsyncStorage.setItem(DOWNLOAD_CONSENT_KEY, 'true');
  }
  return ok;
}

type Props = {
  isDark: boolean;
  phase: 'welcome' | 'browsing';
  onSearchCommitted?: () => void;
  /** 차트에서 클릭 시 자동으로 이 쿼리로 검색 */
  initialQuery?: string;
  /** 차트·Last.fm에서 넘어온 트랙 — 다운로드 메타데이터·모달 기본값 */
  chartDownloadTrack?: ChartTrackItem | null;
  chartDownloadSource?: 'chart' | 'lastfm' | 'melon' | null;
  downloadMetadataAuth: DownloadMetadataAuthHandlers;
  /** browsing·오버레이: FlatList가 남은 높이를 채움 */
  fillHeight?: boolean;
};

export function NrmYoutubeHome({
  isDark,
  phase,
  onSearchCommitted,
  initialQuery,
  chartDownloadTrack = null,
  chartDownloadSource = null,
  downloadMetadataAuth,
  fillHeight = false,
}: Props) {
  const { height: windowHeight } = useWindowDimensions();
  const [query, setQuery] = useState(initialQuery ?? '');
  const [committedQuery, setCommittedQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const initialQueryFiredRef = useRef(false);
  const platformQueryRef = useRef((initialQuery ?? '').trim());
  const metadataRetainChosenRef = useRef(false);
  const listRef = useRef<FlatList<YoutubeSearchItem>>(null);
  const loadMoreLockRef = useRef(false);
  const [results, setResults] = useState<YoutubeSearchItem[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [dlBusy, setDlBusy] = useState<Record<string, boolean>>({});
  const dlInFlight = useRef<Set<string>>(new Set());
  const [downloadModalItem, setDownloadModalItem] =
    useState<YoutubeSearchItem | null>(null);
  const [downloadModalInitialFields, setDownloadModalInitialFields] = useState<
    Omit<NrmAudioFileMetadata, 'artist' | 'title'> | undefined
  >(undefined);
  const [dlMetaBusy, setDlMetaBusy] = useState<Record<string, boolean>>({});
  const [metadataUnavailableOpen, setMetadataUnavailableOpen] = useState(false);
  const [lyricsEmbedUnavailableOpen, setLyricsEmbedUnavailableOpen] = useState(false);
  const [lyricsTranslationFailedOpen, setLyricsTranslationFailedOpen] = useState(false);
  const [lyricsTranslationExhausted, setLyricsTranslationExhausted] = useState(false);
  const [chartContextActive, setChartContextActive] = useState(
    () => !!chartDownloadTrack,
  );
  const latestSearchTokenRef = useRef(0);

  type DownloadSession = {
    extractionPromise: Promise<AudioExtractionResult>;
    aborted: boolean;
    extractionError: unknown | null;
  };
  const downloadSessionsRef = useRef<Map<string, DownloadSession>>(new Map());
  const melonChartMetaCacheRef = useRef<{
    songId: string;
    fields: Omit<NrmAudioFileMetadata, 'artist' | 'title'>;
  } | null>(null);

  const inputColors = {
    backgroundColor: isDark ? nrmTokens.color.surfaceTile2 : nrmTokens.color.canvas,
    color: isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink,
    borderColor: isDark ? nrmTokens.color.borderOnDark : 'rgba(0, 0, 0, 0.08)',
  };

  const applySearchSuccess = useCallback(
    (items: YoutubeSearchItem[], cursor: string | null, append: boolean) => {
      setResults((prev) => (append ? mergeYoutubeSearchItems(prev, items) : items));
      setNextCursor(cursor);
      setHasMore(!!cursor);
    },
    [],
  );

  const runSearchWithQuery = useCallback(
    async (q: string, token: number) => {
      setLoading(true);
      setLoadingMore(false);
      setPlayingId(null);
      setNextCursor(null);
      setHasMore(false);
      setShowScrollTop(false);
      try {
        const out = await searchYoutubePage(q, null, YOUTUBE_SEARCH_PAGE_SIZE);
        if (token !== latestSearchTokenRef.current) return;
        if (!out.ok) {
          logNrmRunError('youtubeSearch.failed', out.userMessage, out.dev);
          notifyUser(out.userMessage);
          setResults([]);
          return;
        }
        applySearchSuccess(out.items, out.nextCursor, false);
      } catch (e) {
        if (token !== latestSearchTokenRef.current) return;
        logNrmRunError('youtubeSearch.unexpected', e);
        notifyUser(
          Platform.OS === 'web'
            ? nrmYoutubeSearchBackendConnectionMessage
            : nrmYoutubeSearchOnDeviceErrorMessage,
        );
        setResults([]);
      } finally {
        if (token !== latestSearchTokenRef.current) return;
        setLoading(false);
      }
    },
    [applySearchSuccess],
  );

  useEffect(() => {
    if (!initialQuery || initialQueryFiredRef.current) return;
    initialQueryFiredRef.current = true;
    platformQueryRef.current = initialQuery.trim();
    metadataRetainChosenRef.current = false;
    if (chartDownloadTrack) {
      setChartContextActive(true);
    }
    setQuery(initialQuery);
    const q = initialQuery.trim();
    if (!q) return;
    onSearchCommitted?.();
    setCommittedQuery(q);
    const token = ++latestSearchTokenRef.current;
    void runSearchWithQuery(q, token);
  // only run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!chartDownloadTrack) {
      setChartContextActive(false);
    }
  }, [chartDownloadTrack]);

  const resolveChartMetadataOnSearch = useCallback(
    async (q: string): Promise<void> => {
      if (!chartDownloadTrack) {
        setChartContextActive(false);
        return;
      }
      const platformQ = platformQueryRef.current;
      if (q === platformQ) {
        if (metadataRetainChosenRef.current && !chartContextActive) {
          return;
        }
        setChartContextActive(true);
        return;
      }
      if (metadataRetainChosenRef.current) {
        return;
      }
      const label = chartTrackDisplayLabel(chartDownloadTrack) || platformQ;
      const keep = await confirmUser('의 메타데이터를 유지할까요?', {
        highlight: label,
        cancelLabel: '아니요',
        confirmLabel: '네',
      });
      metadataRetainChosenRef.current = true;
      setChartContextActive(keep);
    },
    [chartContextActive, chartDownloadTrack],
  );

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    onSearchCommitted?.();
    setCommittedQuery(q);
    await resolveChartMetadataOnSearch(q);
    const token = ++latestSearchTokenRef.current;
    await runSearchWithQuery(q, token);
  }, [onSearchCommitted, query, resolveChartMetadataOnSearch, runSearchWithQuery]);

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || !hasMore || !nextCursor || !committedQuery.trim()) {
      return;
    }
    if (loadMoreLockRef.current) return;
    loadMoreLockRef.current = true;
    setLoadingMore(true);
    const token = latestSearchTokenRef.current;
    try {
      const out = await searchYoutubePage(
        committedQuery,
        nextCursor,
        YOUTUBE_SEARCH_PAGE_SIZE,
      );
      if (token !== latestSearchTokenRef.current) return;
      if (!out.ok) {
        logNrmRunError('youtubeSearch.loadMore', out.userMessage, out.dev);
        notifyUser(out.userMessage);
        setHasMore(false);
        return;
      }
      applySearchSuccess(out.items, out.nextCursor, true);
    } catch (e) {
      if (token !== latestSearchTokenRef.current) return;
      logNrmRunError('youtubeSearch.loadMoreUnexpected', e);
    } finally {
      if (token === latestSearchTokenRef.current) {
        setLoadingMore(false);
      }
      loadMoreLockRef.current = false;
    }
  }, [
    applySearchSuccess,
    committedQuery,
    hasMore,
    loading,
    loadingMore,
    nextCursor,
  ]);

  const showScrollTopRef = useRef(false);
  const onResultsScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      const shouldShow = y >= YOUTUBE_SEARCH_SCROLL_TOP_THRESHOLD;
      if (shouldShow !== showScrollTopRef.current) {
        showScrollTopRef.current = shouldShow;
        setShowScrollTop(shouldShow);
      }
    },
    [],
  );

  const scrollResultsToTop = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    setShowScrollTop(false);
  }, []);

  const effectiveChartTrack =
    chartContextActive && chartDownloadTrack ? chartDownloadTrack : null;
  const effectiveChartSource =
    chartContextActive && chartDownloadTrack ? chartDownloadSource : null;

  const metadataContext = useMemo(
    () => ({
      chartTrack: effectiveChartTrack,
      chartSource: effectiveChartSource,
    }),
    [effectiveChartSource, effectiveChartTrack],
  );

  /** Melon 차트 → YouTube: 다운로드 팝업 전 메타(작곡가·발매일 등) 선조회 */
  useEffect(() => {
    melonChartMetaCacheRef.current = null;
    if (effectiveChartSource !== 'melon' || !effectiveChartTrack?.trackId?.trim()) {
      return;
    }
    const t = effectiveChartTrack;
    const songId = t.trackId.trim();
    let cancelled = false;
    void (async () => {
      try {
        const meta = await enrichMelonDownloadMetadata(
          {
            songId,
            artist: t.artists,
            title: t.title,
            album: t.album,
            genre: t.genre,
            releaseDate: t.releaseDate,
            imageUrl: t.imageUrl,
          },
          t.artists,
          t.title,
        );
        if (cancelled) return;
        const { artist: _a, title: _t, ...fields } = meta;
        melonChartMetaCacheRef.current = { songId, fields };
      } catch {
        /* 다운로드 시 재조회 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [effectiveChartTrack, effectiveChartSource]);

  const clearDownloadSession = useCallback((videoId: string) => {
    downloadSessionsRef.current.delete(videoId);
    dlInFlight.current.delete(videoId);
    setDlBusy((m) => {
      const n = { ...m };
      delete n[videoId];
      return n;
    });
    setDlMetaBusy((m) => {
      const n = { ...m };
      delete n[videoId];
      return n;
    });
  }, []);

  const cleanupSessionExtraction = useCallback(async (videoId: string) => {
    const session = downloadSessionsRef.current.get(videoId);
    if (!session) return;
    try {
      const extraction = await session.extractionPromise;
      if (session.aborted) {
        await cleanupAudioExtraction(extraction);
      }
    } catch {
      /* 추출 실패·중단 시 임시 파일 없을 수 있음 */
    }
  }, []);

  const abortMetadataPrefetch = useCallback(
    (videoId: string, options?: { showUnavailableOverlay?: boolean }) => {
      const session = downloadSessionsRef.current.get(videoId);
      if (session) {
        session.aborted = true;
        void import('@/lib/nrmDownloadLyricsWorkGate')
          .then((m) => m.registerDownloadPipelineEnd(videoId, 'abort_prefetch'))
          .finally(() => cleanupSessionExtraction(videoId).finally(() => clearDownloadSession(videoId)));
      } else {
        clearDownloadSession(videoId);
      }
      if (options?.showUnavailableOverlay && Platform.OS !== 'web') {
        setMetadataUnavailableOpen(true);
      }
    },
    [cleanupSessionExtraction, clearDownloadSession],
  );

  const handleMetadataPrefetchError = useCallback(
    (videoId: string, e: unknown) => {
      if (e instanceof DownloadMetadataAuthInterruptedError) {
        abortMetadataPrefetch(videoId);
        return;
      }
      if (e instanceof DownloadMetadataUnavailableError) {
        abortMetadataPrefetch(videoId, { showUnavailableOverlay: true });
        return;
      }
      logNrmRunError('download.metadata_prefetch', e, { videoId });
      notifyUser('메타데이터를 불러오지 못했습니다.');
      abortMetadataPrefetch(videoId);
    },
    [abortMetadataPrefetch],
  );

  const ensureDownloadReady = useCallback(async (): Promise<boolean> => {
    const consent = await ensureDownloadConsent();
    if (!consent) return false;

    if (Platform.OS === 'android') {
      const { checkSafDownloadPath } = await import('@/lib/nrmDownloadSafGrant');
      const pathStatus = await checkSafDownloadPath();
      if (pathStatus === 'no_path') {
        const ok = await confirmUser(
          '다운로드 경로가 없습니다.\n다운로드 설정에서 경로를 지정할까요?',
          { confirmLabel: '설정하기', cancelLabel: '취소' },
        );
        if (ok) openDownloadSettingsPanel();
        return false;
      }
      if (pathStatus === 'path_invalid') {
        const ok = await confirmUser(
          '설정된 다운로드 경로가 존재하지 않습니다.\n경로를 다시 설정하시겠습니까?',
          { confirmLabel: '설정하기', cancelLabel: '취소' },
        );
        if (ok) openDownloadSettingsPanel();
        return false;
      }
    }
    return true;
  }, []);

  const handleExtractionFailure = useCallback(
    (videoId: string, e: unknown) => {
      logNrmRunError('download.extract', e, { videoId });
      notifyUser(mapDownloadUserMessage(e));
      setDownloadModalItem((cur) => (cur?.videoId === videoId ? null : cur));
      setDownloadModalInitialFields(undefined);
      void import('@/lib/nrmDownloadLyricsWorkGate').then((m) =>
        m.registerDownloadPipelineEnd(videoId, 'extract_fail'),
      );
      clearDownloadSession(videoId);
    },
    [clearDownloadSession],
  );

  const beginParallelExtraction = useCallback(
    (videoId: string) => {
      void import('@/lib/nrmDownloadLyricsWorkGate').then((m) =>
        m.registerDownloadPipelineStart(videoId),
      );
      const session: DownloadSession = {
        extractionPromise: startAudioExtraction(videoId),
        aborted: false,
        extractionError: null,
      };
      downloadSessionsRef.current.set(videoId, session);
      void session.extractionPromise.catch((e) => {
        const current = downloadSessionsRef.current.get(videoId);
        if (!current || current.aborted || current !== session) return;
        session.extractionError = e;
        handleExtractionFailure(videoId, e);
      });
      return session.extractionPromise;
    },
    [handleExtractionFailure],
  );

  const completeDownloadAfterExtraction = useCallback(
    async (
      videoId: string,
      fileName: string,
      metadata: NrmAudioFileMetadata | undefined,
      _options?: {},
    ) => {
      const session = downloadSessionsRef.current.get(videoId);
      if (!session || session.aborted) {
        return;
      }
      if (session.extractionError) {
        throw session.extractionError;
      }

      const { applyDownloadExtension, loadDownloadEncodeSettings } =
        await import('@/lib/nrmDownloadSettings');
      const encode = await loadDownloadEncodeSettings();
      const safeName = applyDownloadExtension(fileName, encode.extension);
      const displayLabel = displayLabelFromAudioFileName(safeName);

      // 다운로드 시작 알림 (중복 설정 로드 없이 여기서 한 번만)
      if (Platform.OS !== 'web') {
        nrmNotifyDownloadStarted(videoId, displayLabel);
      }

      let pipelineEnded = false;
      const endDownloadPipeline = async (reason: string) => {
        if (pipelineEnded) return;
        pipelineEnded = true;
        const { registerDownloadPipelineEnd } = await import('@/lib/nrmDownloadLyricsWorkGate');
        registerDownloadPipelineEnd(videoId, reason);
      };

      try {
        const extraction = await session.extractionPromise;
        if (session.aborted) return;
        const out = await finalizeAudioDownloadParallel(extraction, fileName, metadata, {
          onAudioPersisted:
            Platform.OS !== 'web'
              ? () => {
                  void endDownloadPipeline('audio_persisted');
                  nrmNotifyDownloadFinished(videoId, displayLabel, true, 'audio');
                  // 오디오 저장 완료 후 dl 토큰 해제 — 가사(Whisper/멜론)는 별도 native 토큰
                  nrmBackgroundWorkRelease(nrmDownloadBackgroundWorkToken(videoId));
                }
              : undefined,
          onLyricsStageStarted:
            Platform.OS !== 'web'
              ? () => {
                  nrmNotifyDownloadStarted(videoId, displayLabel, 'lyrics');
                  nrmBackgroundWorkAcquire(nrmLyricsBackgroundWorkToken(videoId));
                }
              : undefined,
          onLyricsStageEnded:
            Platform.OS !== 'web'
              ? () => {
                  nrmNotifyDownloadFinished(videoId, displayLabel, false, 'lyrics');
                  nrmBackgroundWorkRelease(nrmLyricsBackgroundWorkToken(videoId));
                }
              : undefined,
          onLyricsPersisted:
            Platform.OS !== 'web'
              ? () => {
                  nrmNotifyDownloadFinished(
                    videoId,
                    displayLabel,
                    true,
                    'lyrics',
                  );
                }
              : undefined,
        });
        if (out.lyricsWarning === 'not_embedded') {
          InteractionManager.runAfterInteractions(() => {
            setLyricsEmbedUnavailableOpen(true);
          });
        } else if (out.lyricsWarning === 'translation_exhausted') {
          InteractionManager.runAfterInteractions(() => {
            setLyricsTranslationExhausted(true);
            setLyricsTranslationFailedOpen(true);
          });
        } else if (out.lyricsWarning === 'translation_failed') {
          InteractionManager.runAfterInteractions(() => {
            setLyricsTranslationExhausted(false);
            setLyricsTranslationFailedOpen(true);
          });
        } else if (out.lyricsWarning === 'memory_insufficient') {
          InteractionManager.runAfterInteractions(() => {
            notifyUser('메모리가 부족합니다. 가사생성을 중지합니다.');
          });
        } else if (out.lyricsWarning === 'melon_align_failed') {
          InteractionManager.runAfterInteractions(() => {
            notifyUser('멜론가사 생성에 실패했습니다.');
          });
        }
      } catch (e) {
        if (Platform.OS !== 'web') {
          nrmNotifyDownloadFinished(videoId, displayLabel, false, 'audio');
          logNrmRunError('download.native', e, {
            videoId,
            stage: parseDownloadStage(e),
          });
          notifyUser(mapDownloadUserMessage(e));
        } else {
          logNrmRunError('download.web', e, { videoId });
          notifyUser(mapDownloadUserMessage(e));
        }
        throw e;
      } finally {
        await endDownloadPipeline('finalize_done');
      }
    },
    [],
  );

  const handleModalConfirm = useCallback(
    (videoId: string, fileName: string, metadata: NrmAudioFileMetadata) => {
      const normalized = normalizeDownloadMetadata(metadata);

      // 모달 닫기는 즉시 — UI 커밋·애니메이션이 끝난 후 추출 시작
      setDownloadModalItem(null);
      setDownloadModalInitialFields(undefined);

      InteractionManager.runAfterInteractions(() => {
        const session: DownloadSession = {
          extractionPromise: beginParallelExtraction(videoId),
          aborted: false,
          extractionError: null,
        };
        downloadSessionsRef.current.set(videoId, session);

        void (async () => {
          try {
            await completeDownloadAfterExtraction(videoId, fileName, normalized);
          } catch {
            /* notifyUser / overlays inside completeDownloadAfterExtraction */
          } finally {
            if (Platform.OS !== 'web') {
              nrmNotifyDownloadWorkEnded(videoId);
            }
            clearDownloadSession(videoId);
          }
        })();
      });
    },
    [beginParallelExtraction, clearDownloadSession, completeDownloadAfterExtraction],
  );

  const handleModalClose = useCallback(() => {
    const videoId = downloadModalItem?.videoId;
    setDownloadModalItem(null);
    setDownloadModalInitialFields(undefined);
    if (!videoId) return;
    const session = downloadSessionsRef.current.get(videoId);
    if (session) {
      session.aborted = true;
      void import('@/lib/nrmDownloadLyricsWorkGate')
        .then((m) => m.registerDownloadPipelineEnd(videoId, 'modal_close'))
        .finally(() => cleanupSessionExtraction(videoId).finally(() => clearDownloadSession(videoId)));
      return;
    }
    clearDownloadSession(videoId);
  }, [cleanupSessionExtraction, clearDownloadSession, downloadModalItem?.videoId]);

  const startDownloadForItem = useCallback(
    async (item: YoutubeSearchItem) => {
      const videoId = item.videoId;
      if (dlInFlight.current.has(videoId)) return;

      const ready = await ensureDownloadReady();
      if (!ready) return;

      const mode = await loadDownloadMetadataMode();

      dlInFlight.current.add(videoId);
      setDlBusy((m) => ({ ...m, [videoId]: true }));

      if (mode === 'manual') {
        setDlMetaBusy((m) => ({ ...m, [videoId]: true }));
        setDlBusy((m) => {
          const n = { ...m };
          delete n[videoId];
          return n;
        });
        try {
          const cached = melonChartMetaCacheRef.current;
          const fields =
            cached &&
            effectiveChartSource === 'melon' &&
            effectiveChartTrack?.trackId?.trim() === cached.songId
              ? cached.fields
              : await resolveModalInitialMetadataFieldsWithAuth(
                  item,
                  metadataContext,
                  downloadMetadataAuth,
                );
          setDownloadModalInitialFields(fields);
          setDownloadModalItem(item);
          // 모달이 열려있는 동안 확인 시 필요한 모듈/설정 미리 로드 (확인 직후 비용 감소)
          void import('@/lib/nrmInnertubeYoutube');
          void import('@/lib/nrmDownloadSettings').then((m) => m.loadDownloadEncodeSettings());
        } catch (e) {
          handleMetadataPrefetchError(videoId, e);
        } finally {
          setDlMetaBusy((m) => {
            const n = { ...m };
            delete n[videoId];
            return n;
          });
        }
        return;
      }

      try {
        if (mode === 'auto') {
          beginParallelExtraction(videoId);
          const [metadata, fileName] = await Promise.all([
            resolveAutoDownloadMetadataWithAuth(
              item,
              metadataContext,
              downloadMetadataAuth,
            ),
            resolveDownloadFileName(item, metadataContext),
          ]);
          InteractionManager.runAfterInteractions(() => {
            void (async () => {
              try {
                await completeDownloadAfterExtraction(videoId, fileName, metadata);
              } catch {
                /* notifyUser / overlays inside completeDownloadAfterExtraction */
              } finally {
                if (Platform.OS !== 'web') {
                  nrmNotifyDownloadWorkEnded(videoId);
                }
                clearDownloadSession(videoId);
              }
            })();
          });
        } else {
          const fileName = await resolveDownloadFileName(item, metadataContext);
          beginParallelExtraction(videoId);
          InteractionManager.runAfterInteractions(() => {
            void (async () => {
              try {
                await completeDownloadAfterExtraction(videoId, fileName, undefined);
              } catch {
                /* notifyUser / overlays inside completeDownloadAfterExtraction */
              } finally {
                if (Platform.OS !== 'web') {
                  nrmNotifyDownloadWorkEnded(videoId);
                }
                clearDownloadSession(videoId);
              }
            })();
          });
        }
      } catch (e) {
        if (mode === 'auto') {
          handleMetadataPrefetchError(videoId, e);
        }
        if (Platform.OS !== 'web') {
          nrmNotifyDownloadWorkEnded(videoId);
        }
        clearDownloadSession(videoId);
      }
    },
    [
      beginParallelExtraction,
      clearDownloadSession,
      completeDownloadAfterExtraction,
      downloadMetadataAuth,
      effectiveChartSource,
      effectiveChartTrack,
      ensureDownloadReady,
      handleMetadataPrefetchError,
      metadataContext,
    ],
  );

  const isWelcome = phase === 'welcome';
  const titleColor = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
  const bodyColor = isDark ? nrmTokens.color.bodyMuted : nrmTokens.color.inkMuted80;
  const rowBorder = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const useResultList =
    fillHeight ||
    committedQuery.length > 0 ||
    loading ||
    loadingMore ||
    results.length > 0;
  const resultListMaxHeight = Math.min(windowHeight * 0.55, 520);

  const searchHeader = (
    <View style={styles.searchRowWrap}>
      <View style={styles.searchRow}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={runSearch}
          placeholder={nrmYoutubeSearchPlaceholder}
          placeholderTextColor={isDark ? '#6b7288' : '#9ca3af'}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          editable
          style={[styles.input, inputColors]}
        />
        <Pressable
          onPress={runSearch}
          disabled={query.trim().length === 0}
          style={({ pressed }) => [
            styles.searchBtn,
            query.trim().length === 0 && styles.searchBtnDisabled,
            pressed && !loading && styles.searchBtnPressed,
          ]}>
          {loading ? (
            <ActivityIndicator color={nrmTokens.color.onPrimary} />
          ) : (
            <Text style={styles.searchBtnLabel}>검색</Text>
          )}
        </Pressable>
      </View>
    </View>
  );

  const renderResultItem = ({ item }: ListRenderItemInfo<YoutubeSearchItem>) => {
    const active = item.videoId === playingId;
    const busy = !!dlBusy[item.videoId] || !!dlMetaBusy[item.videoId];
    return (
      <Fragment key={item.videoId}>
        <View
          style={[
            styles.row,
            { borderBottomColor: rowBorder },
            active && styles.rowActive,
          ]}>
          <Pressable
            onPress={() => {
              setPlayingId(playingId === item.videoId ? null : item.videoId);
            }}
            style={({ pressed }) => [styles.rowMain, pressed && styles.rowPressed]}
            accessibilityRole="button"
            accessibilityLabel="재생 영역 열기">
            <View style={styles.thumb}>
              {item.thumbnailUrl ? (
                <Image
                  source={{ uri: item.thumbnailUrl }}
                  style={StyleSheet.absoluteFill}
                />
              ) : null}
            </View>
            <View style={styles.rowText}>
              <Text
                style={[
                  styles.title,
                  { color: isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink },
                ]}
                numberOfLines={2}>
                {item.title}
              </Text>
              <Text
                style={[
                  styles.channel,
                  {
                    color: isDark
                      ? nrmTokens.color.bodyMuted
                      : nrmTokens.color.inkMuted48,
                  },
                ]}
                numberOfLines={1}>
                {item.channelTitle}
              </Text>
            </View>
          </Pressable>
          <Pressable
            onPress={() => void startDownloadForItem(item)}
            disabled={busy}
            style={({ pressed }) => [
              styles.rowDownloadBtn,
              {
                borderColor: isDark
                  ? nrmTokens.color.primaryOnDark
                  : nrmTokens.color.primary,
              },
              busy && styles.rowDownloadBtnDisabled,
              pressed && !busy && styles.rowDownloadBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="이 영상 오디오 다운로드">
            {busy ? (
              <ActivityIndicator
                size="small"
                color={
                  isDark ? nrmTokens.color.primaryOnDark : nrmTokens.color.primary
                }
              />
            ) : (
              <Ionicons
                name="download-outline"
                size={22}
                color={
                  isDark ? nrmTokens.color.primaryOnDark : nrmTokens.color.primary
                }
              />
            )}
          </Pressable>
        </View>
        {active ? (
          <View style={styles.embedBelow}>
            <YoutubeEmbed videoId={item.videoId} isDark={isDark} />
            <Pressable
              onPress={() => void startDownloadForItem(item)}
              disabled={busy}
              style={({ pressed }) => [
                styles.embedDownloadBtn,
                busy && styles.embedDownloadBtnDisabled,
                pressed && !busy && styles.embedDownloadBtnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="재생 중 영상 오디오 다운로드">
              {busy ? (
                <ActivityIndicator color={nrmTokens.color.onPrimary} size="small" />
              ) : (
                <Text style={styles.embedDownloadLabel}>
                  {Platform.OS === 'web' ? '오디오 다운로드 (MP3)' : '오디오 다운로드'}
                </Text>
              )}
            </Pressable>
          </View>
        ) : null}
      </Fragment>
    );
  };

  return (
    <View
      style={[
        styles.root,
        fillHeight && styles.rootFill,
        !isWelcome && styles.block,
        !isWelcome && (isDark ? styles.blockDark : styles.blockLight),
      ]}>
      <NrmDownloadMetadataUnavailableOverlay
        visible={metadataUnavailableOpen}
        isDark={isDark}
        titleColor={titleColor}
        bodyColor={bodyColor}
        onClose={() => setMetadataUnavailableOpen(false)}
      />
      <NrmLyricsEmbedUnavailableOverlay
        visible={lyricsEmbedUnavailableOpen}
        isDark={isDark}
        titleColor={titleColor}
        bodyColor={bodyColor}
        onClose={() => setLyricsEmbedUnavailableOpen(false)}
      />
      <NrmMetadataEditModal
        visible={downloadModalItem !== null}
        item={downloadModalItem}
        isDark={isDark}
        metadataSource={
          !chartContextActive || !chartDownloadTrack
            ? 'main'
            : chartDownloadSource === 'melon'
              ? 'melon'
              : chartDownloadSource === 'lastfm'
                ? 'lastfm'
                : 'chart'
        }
        initialArtist={effectiveChartTrack?.artists}
        initialTitle={effectiveChartTrack?.title}
        initialMetadataFields={downloadModalInitialFields}
        busy={!!(downloadModalItem && dlMetaBusy[downloadModalItem.videoId])}
        onClose={handleModalClose}
        onConfirm={(videoId, fileName, metadata) => {
          void handleModalConfirm(videoId, fileName, metadata);
        }}
      />
      <NrmLyricsTranslationFailedOverlay
        visible={lyricsTranslationFailedOpen}
        isDark={isDark}
        titleColor={titleColor}
        bodyColor={bodyColor}
        exhausted={lyricsTranslationExhausted}
        onClose={() => setLyricsTranslationFailedOpen(false)}
      />
      {useResultList ? (
        <>
          <FlatList
            ref={listRef}
            style={[
              styles.resultList,
              !fillHeight && { maxHeight: resultListMaxHeight, flexGrow: 0 },
            ]}
            contentContainerStyle={styles.resultListContent}
            data={results}
            keyExtractor={(item) => item.videoId}
            renderItem={renderResultItem}
            ListHeaderComponent={searchHeader}
            ListFooterComponent={
              loadingMore ? (
                <ActivityIndicator
                  style={styles.footerLoader}
                  color={nrmTokens.color.primary}
                />
              ) : null
            }
            onEndReached={() => void loadMore()}
            onEndReachedThreshold={0.35}
            onScroll={onResultsScroll}
            scrollEventThrottle={200}
            keyboardShouldPersistTaps="always"
            showsVerticalScrollIndicator={Platform.OS === 'web'}
            nestedScrollEnabled
          />
          <NrmScrollToTopFab
            visible={showScrollTop && results.length > 0}
            onPress={scrollResultsToTop}
            isDark={isDark}
            bottomOffset={nrmTokens.space.xl + 56}
          />
        </>
      ) : (
        searchHeader
      )}
    </View>
  );
}

const ROW_H = nrmTokens.layout.touchMin;

const styles = StyleSheet.create({
  root: {
    width: '100%',
  },
  rootFill: {
    flex: 1,
    minHeight: 0,
  },
  resultList: {
    flex: 1,
  },
  resultListContent: {
    paddingBottom: nrmTokens.space.lg,
  },
  footerLoader: {
    marginVertical: nrmTokens.space.md,
  },
  block: {
    width: '100%',
    maxWidth: nrmTokens.layout.maxContentWidth,
    padding: nrmTokens.space.lg,
    borderRadius: nrmTokens.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  blockDark: {
    backgroundColor: nrmTokens.color.surfaceTile1,
    borderColor: nrmTokens.color.borderOnDark,
  },
  blockLight: {
    backgroundColor: nrmTokens.color.canvas,
    borderColor: nrmTokens.color.hairline,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.sm,
    flex: 1,
    maxWidth: nrmTokens.layout.homeSearchClusterMaxWidth,
    minWidth: 0,
  },
  searchRowWrap: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: nrmTokens.space.md,
  },
  input: {
    flex: 1,
    height: ROW_H,
    borderWidth: 1,
    borderRadius: nrmTokens.radius.pill,
    paddingHorizontal: 20,
    paddingVertical: Platform.OS === 'ios' ? 12 : 0,
    fontSize: nrmTokens.font.body,
    fontWeight: '400',
    letterSpacing: -0.37,
    ...Platform.select({
      android: { textAlignVertical: 'center' },
      web: {
        outlineStyle: 'none',
        boxSizing: 'border-box' as const,
      },
    }),
  },
  searchBtn: {
    height: ROW_H,
    paddingHorizontal: 22,
    borderRadius: nrmTokens.radius.pill,
    backgroundColor: nrmTokens.color.primary,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 72,
  },
  searchBtnPressed: {
    transform: [{ scale: 0.95 }],
    opacity: 0.98,
  },
  searchBtnDisabled: {
    opacity: 0.55,
  },
  searchBtnLabel: {
    color: nrmTokens.color.onPrimary,
    fontWeight: '400',
    fontSize: nrmTokens.font.body,
    letterSpacing: -0.37,
  },
  embedBelow: {
    marginTop: nrmTokens.space.sm,
    marginBottom: nrmTokens.space.md,
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: nrmTokens.space.sm,
    paddingVertical: nrmTokens.space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.md,
    minWidth: 0,
  },
  rowDownloadBtn: {
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    minWidth: 56,
    paddingVertical: 10,
    paddingHorizontal: nrmTokens.space.sm,
    borderRadius: nrmTokens.radius.pill,
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  rowDownloadBtnDisabled: {
    opacity: 0.55,
  },
  rowDownloadBtnPressed: {
    transform: [{ scale: 0.95 }],
    opacity: 0.92,
  },
  embedDownloadBtn: {
    marginTop: nrmTokens.space.md,
    paddingVertical: 11,
    paddingHorizontal: 22,
    borderRadius: nrmTokens.radius.pill,
    backgroundColor: nrmTokens.color.primary,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: nrmTokens.layout.touchMin,
  },
  embedDownloadBtnDisabled: {
    opacity: 0.55,
  },
  embedDownloadBtnPressed: {
    transform: [{ scale: 0.95 }],
    opacity: 0.98,
  },
  embedDownloadLabel: {
    color: nrmTokens.color.onPrimary,
    fontSize: nrmTokens.font.body,
    fontWeight: '400',
    letterSpacing: -0.37,
  },
  rowActive: {
    backgroundColor: nrmTokens.color.accentSoft,
  },
  rowPressed: {
    opacity: 0.9,
  },
  thumb: {
    width: 112,
    aspectRatio: 16 / 9,
    borderRadius: nrmTokens.radius.sm,
    backgroundColor: '#222',
    overflow: 'hidden',
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
  channel: {
    fontSize: nrmTokens.font.small,
    marginTop: 4,
  },
});
