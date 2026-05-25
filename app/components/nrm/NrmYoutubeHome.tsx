import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Fragment, useCallback, useRef, useState } from 'react';
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
import { displayLabelFromAudioFileName } from '@/lib/nrmYoutubeDownloadMeta';
import { notifyUser, confirmUser } from '@/lib/nrmUserNotify';
import { openDownloadSettingsPanel } from '@/lib/nrmDownloadNavEvents';
import { nrmTrackPlayer } from '@/lib/nrmTrackPlayer';
import { searchYoutube, type YoutubeSearchItem } from '@/lib/youtubeSearchClient';

import { NrmDownloadModal } from '@/components/nrm/NrmDownloadModal';
import { NrmNativeAudioPlayer } from '@/components/nrm/NrmNativeAudioPlayer';
import { YoutubeEmbed } from '@/components/nrm/YoutubeEmbed';

function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

const DOWNLOAD_CONSENT_KEY = 'nrm_download_user_consent_v1';

function mapDownloadUserMessage(err: unknown): string {
  const raw = (err instanceof Error ? err.message : String(err)).toLowerCase();
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
  if (raw.includes('network') || raw.includes('timeout') || raw.includes('http')) {
    return '네트워크 문제로 다운로드하지 못했습니다.';
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
};

/**
 * TrackPlayer 네이티브 모듈 사용 가능 여부.
 * 표준 Expo Go에는 react-native-track-player가 번들되지 않아 false가 됩니다.
 * APK 빌드에서는 true입니다.
 */
const CAN_USE_TRACK_PLAYER =
  Platform.OS !== 'web' && nrmTrackPlayer.isModuleAvailable();

export function NrmYoutubeHome({
  isDark,
  phase,
  onSearchCommitted,
}: Props) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<YoutubeSearchItem[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [trackLoadingId, setTrackLoadingId] = useState<string | null>(null);
  const [dlBusy, setDlBusy] = useState<Record<string, boolean>>({});
  const dlInFlight = useRef<Set<string>>(new Set());
  const [downloadModalItem, setDownloadModalItem] =
    useState<YoutubeSearchItem | null>(null);
  const latestSearchTokenRef = useRef(0);

  const inputColors = {
    backgroundColor: isDark ? nrmTokens.color.surfaceTile2 : nrmTokens.color.canvas,
    color: isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink,
    borderColor: isDark ? nrmTokens.color.borderOnDark : 'rgba(0, 0, 0, 0.08)',
  };

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    const token = ++latestSearchTokenRef.current;
    onSearchCommitted?.();
    setLoading(true);
    setPlayingId(null);
    setTrackLoadingId(null);
    if (Platform.OS !== 'web') void nrmTrackPlayer.stop();
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
    async (videoId: string, fileName: string) => {
      if (dlInFlight.current.has(videoId)) return;
      const consent = await ensureDownloadConsent();
      if (!consent) return;

      // Android: 다운로드 경로 사전 체크
      if (Platform.OS === 'android') {
        const { checkSafDownloadPath } = await import('@/lib/nrmDownloadSafGrant');
        const pathStatus = await checkSafDownloadPath();
        if (pathStatus === 'no_path') {
          const ok = await confirmUser(
            '다운로드 경로가 설정되지 않았습니다.\n설정에서 경로를 먼저 지정하시겠습니까?',
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
      const displayLabel = displayLabelFromAudioFileName(fileName);
      const safeName =
        Platform.OS === 'web'
          ? fileName.endsWith('.mp3')
            ? fileName
            : `${fileName}.mp3`
          : fileName;

      if (Platform.OS !== 'web') {
        nrmNotifyDownloadStarted(videoId, displayLabel);
      }

      try {
        if (Platform.OS !== 'web' && usesPcBackendInDev()) {
          const res = await requestDownload(youtubeWatchUrl(videoId), {
            noPlaylist: true,
          });
          const jobId = res.jobId;
          if (!jobId || typeof jobId !== 'string') {
            throw new Error(
              '서버 응답에 jobId가 없어 파일을 받을 수 없습니다.',
            );
          }
          const apiBase = await getResolvedApiBaseUrl();
          await persistAudioAfterServerJob(apiBase, jobId, { fileName });
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
        });
        const jobId = res.jobId;
        if (!jobId || typeof jobId !== 'string') {
          throw new Error(
            '서버 응답에 jobId가 없어 파일을 받을 수 없습니다.',
          );
        }
        const apiBase = await getResolvedApiBaseUrl();
        await persistAudioAfterServerJob(apiBase, jobId, { fileName });
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

  const isWelcome = phase === 'welcome';

  return (
    <View
      style={[
        styles.root,
        !isWelcome && styles.block,
        !isWelcome && (isDark ? styles.blockDark : styles.blockLight),
      ]}>
      <NrmDownloadModal
        visible={downloadModalItem !== null}
        item={downloadModalItem}
        isDark={isDark}
        onClose={() => setDownloadModalItem(null)}
        onConfirm={(videoId, fileName) => {
          setDownloadModalItem(null);
          void runDownloadWithFileName(videoId, fileName);
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
          const busy = !!dlBusy[item.videoId];
          const trackFetching = trackLoadingId === item.videoId;
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
                    if (!CAN_USE_TRACK_PLAYER) {
                      // 웹 또는 표준 Expo Go: YoutubeEmbed(WebView) 로 재생
                      setPlayingId(
                        playingId === item.videoId ? null : item.videoId,
                      );
                      return;
                    }
                    // APK 네이티브 빌드: TrackPlayer로 재생
                    if (playingId === item.videoId) {
                      setPlayingId(null);
                      setTrackLoadingId(null);
                      void nrmTrackPlayer.stop();
                      return;
                    }
                    setPlayingId(item.videoId);
                    setTrackLoadingId(item.videoId);
                    const currentVideoId = item.videoId;
                    void (async () => {
                      try {
                        const { getAudioStreamUrlWithInnertube } = await import(
                          '@/lib/nrmInnertubeYoutube'
                        );
                        const url = await getAudioStreamUrlWithInnertube(currentVideoId);
                        await nrmTrackPlayer.play({
                          id: currentVideoId,
                          url,
                          title: item.title,
                          artist: item.channelTitle ?? 'NullReferenceMusic',
                          artwork: item.thumbnailUrl ?? undefined,
                        });
                      } catch {
                        setPlayingId(null);
                        notifyUser('재생할 수 없습니다. 잠시 후 다시 시도하세요.');
                      } finally {
                        setTrackLoadingId(null);
                      }
                    })();
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
                    {trackFetching ? (
                      <View style={[StyleSheet.absoluteFill, styles.thumbLoadingOverlay]}>
                        <ActivityIndicator size="small" color="#fff" />
                      </View>
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
                  onPress={() => setDownloadModalItem(item)}
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
              {/* 플레이어 영역
                  APK: NrmNativeAudioPlayer (TrackPlayer) → 시스템 미디어 알림 지원
                  웹 / 표준 Expo Go: YoutubeEmbed (WebView) */}
              {active ? (
                <View style={styles.embedBelow}>
                  {CAN_USE_TRACK_PLAYER ? (
                    <NrmNativeAudioPlayer
                      videoId={item.videoId}
                      title={item.title}
                      channelTitle={item.channelTitle ?? ''}
                      thumbnailUrl={item.thumbnailUrl}
                      isDark={isDark}
                      onStop={() => {
                        setPlayingId(null);
                        void nrmTrackPlayer.stop();
                      }}
                    />
                  ) : (
                    <YoutubeEmbed videoId={item.videoId} isDark={isDark} />
                  )}
                  <Pressable
                    onPress={() => setDownloadModalItem(item)}
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
  thumbLoadingOverlay: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
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
