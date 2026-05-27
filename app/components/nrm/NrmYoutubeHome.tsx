import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';
import { logNrmRunError } from '@/lib/nrmDevLog';
import { usesPcBackendInDev } from '@/lib/nrmDevRuntime';
import {
  nrmYoutubeSearchBackendConnectionMessage,
  nrmYoutubeSearchOnDeviceErrorMessage,
  nrmYoutubeSearchPlaceholder,
} from '@/lib/nrmYoutubeStrings';
import { getResolvedApiBaseUrl } from '@/lib/apiBaseUrl';
import { requestDownload } from '@/lib/downloadClient';
import {
  nrmNotifyDownloadFinished,
  nrmNotifyDownloadStarted,
} from '@/lib/nrmMobileDownloadNotifications';
import { persistAudioAfterServerJob } from '@/lib/nrmPersistServerDownload';
import {
  buildChartAudioMetadata,
  normalizeDownloadMetadata,
  type NrmAudioFileMetadata,
} from '@/lib/nrmDownloadAudioMetadata';
import { enrichLastfmDownloadMetadata } from '@/lib/nrmLastfmMetadataEnricher';
import { normalizeLastfmMbid } from '@/lib/nrmLastfmMbid';
import type { ChartTrackItem } from '@/lib/nrmChartsTypes';
import { displayLabelFromAudioFileName } from '@/lib/nrmYoutubeDownloadMeta';
import { notifyUser, confirmUser } from '@/lib/nrmUserNotify';
import { openDownloadSettingsPanel } from '@/lib/nrmDownloadNavEvents';
import { searchYoutube, type YoutubeSearchItem } from '@/lib/youtubeSearchClient';

import { NrmMetadataEditModal } from '@/components/nrm/NrmMetadataEditModal';
import { YoutubeEmbed } from '@/components/nrm/YoutubeEmbed';

function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

const DOWNLOAD_CONSENT_KEY = 'nrm_download_user_consent_v1';

function mapDownloadUserMessage(err: unknown): string {
  const full = err instanceof Error ? err.message : String(err);
  const raw = full.toLowerCase();
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
  if (raw.includes('ffmpeg_required') || raw.includes('transcode_failed')) {
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
  chartDownloadSource?: 'chart' | 'lastfm' | null;
};

export function NrmYoutubeHome({
  isDark,
  phase,
  onSearchCommitted,
  initialQuery,
  chartDownloadTrack = null,
  chartDownloadSource = null,
}: Props) {
  const [query, setQuery] = useState(initialQuery ?? '');
  const [loading, setLoading] = useState(false);
  const initialQueryFiredRef = useRef(false);
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
  const latestSearchTokenRef = useRef(0);

  const inputColors = {
    backgroundColor: isDark ? nrmTokens.color.surfaceTile2 : nrmTokens.color.canvas,
    color: isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink,
    borderColor: isDark ? nrmTokens.color.borderOnDark : 'rgba(0, 0, 0, 0.08)',
  };

  useEffect(() => {
    if (!initialQuery || initialQueryFiredRef.current) return;
    initialQueryFiredRef.current = true;
    setQuery(initialQuery);
    const q = initialQuery.trim();
    if (!q) return;
    const token = ++latestSearchTokenRef.current;
    onSearchCommitted?.();
    setLoading(true);
    setPlayingId(null);
    void searchYoutube(q).then((out) => {
      if (token !== latestSearchTokenRef.current) return;
      if (!out.ok) {
        notifyUser(out.userMessage);
        setResults([]);
      } else {
        setResults(out.items);
      }
      setLoading(false);
    });
  // only run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    const token = ++latestSearchTokenRef.current;
    onSearchCommitted?.();
    setLoading(true);
    setPlayingId(null);
    try {
      const out = await searchYoutube(q);
      if (token !== latestSearchTokenRef.current) return;
      if (!out.ok) {
        logNrmRunError('youtubeSearch.failed', out.userMessage, out.dev);
        notifyUser(out.userMessage);
        setResults([]);
        return;
      }
      setResults(out.items);
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
  }, [query, onSearchCommitted]);

  const runDownloadWithFileName = useCallback(
    async (videoId: string, fileName: string, metadata: NrmAudioFileMetadata) => {
      if (dlInFlight.current.has(videoId)) return;
      const consent = await ensureDownloadConsent();
      if (!consent) return;

      // Android: 다운로드 경로 사전 체크
      if (Platform.OS === 'android') {
        const { checkSafDownloadPath } = await import('@/lib/nrmDownloadSafGrant');
        const pathStatus = await checkSafDownloadPath();
        if (pathStatus === 'no_path') {
          const ok = await confirmUser(
            '다운로드 경로가 없습니다.\n다운로드 설정에서 경로를 지정할까요?',
            { confirmLabel: '설정하기', cancelLabel: '취소' },
          );
          if (ok) openDownloadSettingsPanel();
          return;
        }
        if (pathStatus === 'path_invalid') {
          const ok = await confirmUser(
            '설정된 다운로드 경로가 존재하지 않습니다.\n경로를 다시 설정하시겠습니까?',
            { confirmLabel: '설정하기', cancelLabel: '취소' },
          );
          if (ok) openDownloadSettingsPanel();
          return;
        }
      }

      dlInFlight.current.add(videoId);
      setDlBusy((m) => ({ ...m, [videoId]: true }));
      const { loadDownloadEncodeSettings, applyDownloadExtension, extensionToYtDlpFormat } =
        await import('@/lib/nrmDownloadSettings');
      const encode = await loadDownloadEncodeSettings();
      const safeName = applyDownloadExtension(fileName, encode.extension);
      const displayLabel = displayLabelFromAudioFileName(safeName);

      if (Platform.OS !== 'web') {
        nrmNotifyDownloadStarted(videoId, displayLabel);
      }

      try {
        if (Platform.OS !== 'web' && usesPcBackendInDev()) {
          const res = await requestDownload(youtubeWatchUrl(videoId), {
            noPlaylist: true,
            audioFormat: extensionToYtDlpFormat(encode.extension),
            audioQuality: encode.audioQuality,
            metadata,
          });
          const jobId = res.jobId;
          if (!jobId || typeof jobId !== 'string') {
            throw new Error(
              '서버 응답에 jobId가 없어 파일을 받을 수 없습니다.',
            );
          }
          const apiBase = await getResolvedApiBaseUrl();
          await persistAudioAfterServerJob(apiBase, jobId, { fileName: safeName });
          nrmNotifyDownloadFinished(videoId, displayLabel, true);
          return;
        }

        if (Platform.OS !== 'web') {
          const { downloadYoutubeAudioOnDevice } = await import(
            '@/lib/nrmInnertubeYoutube'
          );
          try {
            const { savedLabel } = await downloadYoutubeAudioOnDevice(
              videoId,
              safeName,
              metadata,
            );
            void savedLabel; // 인앱 오버레이 없이 시스템 알림으로만 표시
            nrmNotifyDownloadFinished(videoId, displayLabel, true);
            return;
          } catch (nativeErr) {
            logNrmRunError('download.native.ondevice_failed', nativeErr, {
              videoId,
            });
            throw nativeErr;
          }
        }

        const web = await import('@/lib/nrmPersistDownload.web');
        if (web.isWebSaveFilePickerSupported()) {
          const handle = await web.pickWebSaveFileHandle(safeName);
          if (!handle) {
            return;
          }
          const res = await requestDownload(youtubeWatchUrl(videoId), {
            noPlaylist: true,
            audioFormat: extensionToYtDlpFormat(encode.extension),
            audioQuality: encode.audioQuality,
            metadata,
          });
          const jobId = res.jobId;
          if (!jobId || typeof jobId !== 'string') {
            throw new Error(
              '서버 응답에 jobId가 없어 파일을 받을 수 없습니다.',
            );
          }
          const apiBase = await getResolvedApiBaseUrl();
          const base = String(apiBase).trim().replace(/\/+$/, '');
          const fileUrl = `${base}/api/download/file?jobId=${encodeURIComponent(jobId)}`;
          await web.writeJobMp3BlobToHandle(handle, fileUrl);
          return;
        }

        const res = await requestDownload(youtubeWatchUrl(videoId), {
          noPlaylist: true,
          audioFormat: extensionToYtDlpFormat(encode.extension),
          audioQuality: encode.audioQuality,
          metadata,
        });
        const jobId = res.jobId;
        if (!jobId || typeof jobId !== 'string') {
          throw new Error(
            '서버 응답에 jobId가 없어 파일을 받을 수 없습니다.',
          );
        }
        const apiBase = await getResolvedApiBaseUrl();
        await persistAudioAfterServerJob(apiBase, jobId, { fileName: safeName });
        return;
      } catch (e) {
        if (Platform.OS !== 'web') {
          nrmNotifyDownloadFinished(videoId, displayLabel, false);
          logNrmRunError('download.native', e, {
            videoId,
            safeName,
            stage: parseDownloadStage(e),
          });
          notifyUser(mapDownloadUserMessage(e));
        } else {
          logNrmRunError('download.web', e, { videoId });
          notifyUser('알 수 없는 오류가 발생했습니다.');
        }
      } finally {
        dlInFlight.current.delete(videoId);
        setDlBusy((m) => {
          const n = { ...m };
          delete n[videoId];
          return n;
        });
      }
    },
    [],
  );

  const openDownloadModalForItem = useCallback(
    async (item: YoutubeSearchItem) => {
      const videoId = item.videoId;
      if (dlInFlight.current.has(videoId)) return;
      setDlMetaBusy((m) => ({ ...m, [videoId]: true }));
      setDownloadModalItem(null);
      setDownloadModalInitialFields(undefined);
      try {
        // metadataSource 분류는 모달에서 UI 힌트용으로 사용합니다.
        const source: 'chart' | 'lastfm' | 'main' =
          chartDownloadTrack && chartDownloadSource === 'lastfm'
            ? 'lastfm'
            : chartDownloadTrack
              ? 'chart'
              : 'main';

        if (source === 'lastfm' && chartDownloadTrack) {
          const t = chartDownloadTrack;
          const meta = await enrichLastfmDownloadMetadata(
            {
              mbid:
                normalizeLastfmMbid(t.mbid) ||
                normalizeLastfmMbid(t.trackId) ||
                undefined,
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
          const { artist: _a, title: _t, ...fields } = meta;
          setDownloadModalInitialFields(fields);
        } else if (source === 'chart' && chartDownloadTrack) {
          const t = chartDownloadTrack;
          const meta = buildChartAudioMetadata(t, t.artists, t.title);
          const { artist: _a, title: _t, ...fields } = meta;
          setDownloadModalInitialFields(fields);
        } else {
          setDownloadModalInitialFields(undefined);
        }

        setDownloadModalItem(item);
      } finally {
        setDlMetaBusy((m) => {
          const n = { ...m };
          delete n[videoId];
          return n;
        });
      }
    },
    [chartDownloadSource, chartDownloadTrack],
  );

  const isWelcome = phase === 'welcome';

  return (
    <View
      style={[
        styles.root,
        !isWelcome && styles.block,
        !isWelcome && (isDark ? styles.blockDark : styles.blockLight),
      ]}>
      <NrmMetadataEditModal
        visible={downloadModalItem !== null}
        item={downloadModalItem}
        isDark={isDark}
        metadataSource={
          chartDownloadSource === 'lastfm'
            ? 'lastfm'
            : chartDownloadTrack
              ? 'chart'
              : 'main'
        }
        initialArtist={chartDownloadTrack?.artists}
        initialTitle={chartDownloadTrack?.title}
        initialMetadataFields={downloadModalInitialFields}
        busy={false}
        onClose={() => {
          setDownloadModalItem(null);
          setDownloadModalInitialFields(undefined);
        }}
        onConfirm={(videoId, fileName, metadata) => {
          setDownloadModalItem(null);
          setDownloadModalInitialFields(undefined);
          void runDownloadWithFileName(
            videoId,
            fileName,
            normalizeDownloadMetadata(metadata),
          );
        }}
      />
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

      <View style={styles.list}>
        {results.map((item) => {
          const active = item.videoId === playingId;
          const rowBorder = isDark
            ? nrmTokens.color.borderOnDark
            : nrmTokens.color.hairline;
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
                    setPlayingId(
                      playingId === item.videoId ? null : item.videoId,
                    );
                  }}
                  style={({ pressed }) => [
                    styles.rowMain,
                    pressed && styles.rowPressed,
                  ]}
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
                        {
                          color: isDark
                            ? nrmTokens.color.bodyOnDark
                            : nrmTokens.color.ink,
                        },
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
                  onPress={() => void openDownloadModalForItem(item)}
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
                        isDark
                          ? nrmTokens.color.primaryOnDark
                          : nrmTokens.color.primary
                      }
                    />
                  ) : (
                    <Ionicons
                      name="download-outline"
                      size={22}
                      color={
                        isDark
                          ? nrmTokens.color.primaryOnDark
                          : nrmTokens.color.primary
                      }
                    />
                  )}
                </Pressable>
              </View>
              {active ? (
                <View style={styles.embedBelow}>
                  <YoutubeEmbed videoId={item.videoId} isDark={isDark} />
                  <Pressable
                    onPress={() => void openDownloadModalForItem(item)}
                    disabled={busy}
                    style={({ pressed }) => [
                      styles.embedDownloadBtn,
                      busy && styles.embedDownloadBtnDisabled,
                      pressed && !busy && styles.embedDownloadBtnPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="재생 중 영상 오디오 다운로드">
                    {busy ? (
                      <ActivityIndicator
                        color={nrmTokens.color.onPrimary}
                        size="small"
                      />
                    ) : (
                      <Text style={styles.embedDownloadLabel}>
                        {Platform.OS === 'web'
                          ? '오디오 다운로드 (MP3)'
                          : '오디오 다운로드'}
                      </Text>
                    )}
                  </Pressable>
                </View>
              ) : null}
            </Fragment>
          );
        })}
      </View>
    </View>
  );
}

const ROW_H = nrmTokens.layout.touchMin;

const styles = StyleSheet.create({
  root: {
    width: '100%',
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
  list: {
    paddingBottom: nrmTokens.space.lg,
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
