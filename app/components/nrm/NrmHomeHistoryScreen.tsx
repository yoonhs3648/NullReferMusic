import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { NrmMetadataEditModal } from '@/components/nrm/NrmMetadataEditModal';
import { nrmTokens } from '@/constants/nrmTokens';
import {
  activityHistoryEntryOpensTrack,
  formatActivityHistoryDateTitle,
  formatActivityHistoryLabel,
  formatActivityHistoryTime,
  groupActivityHistoryByDate,
  invalidateActivityHistoryCache,
  peekActivityHistoryForDisplay,
  registerActivityHistoryRevisionListener,
  type NrmActivityHistoryEntry,
} from '@/lib/nrmActivityHistory';
import {
  registerActivityHistoryDisplayListener,
  DEFAULT_ACTIVITY_HISTORY_DISPLAY_DAYS,
  type NrmActivityHistoryDisplayDays,
} from '@/lib/nrmActivityHistorySettings';
import type { NrmAudioFileMetadata } from '@/lib/nrmDownloadAudioMetadata';
import type { NrmDownloadTrackItem } from '@/lib/nrmDownloadTrackTypes';
import { listDownloadAudioTracks } from '@/lib/nrmListDownloadTracks';
import { invalidateAudioMetadataCache } from '@/lib/nrmReadAudioMetadata';
import type { NrmLyricsUiMode } from '@/lib/nrmMelonLyrics';
import {
  findDownloadTrackForHistory,
  logStorageMetadataHistory,
  logStorageTrackRemoveHistory,
} from '@/lib/nrmStorageActivityHistory';
import { applyTrackMetadataUpdate } from '@/lib/nrmTrackMetadataUpdate';
import { deleteDownloadTrack } from '@/lib/nrmDeleteDownloadTrack';
import { invalidateListCoverDiskCache, trackListCoverKey } from '@/lib/nrmTrackListCoverLoader';
import { isAlignModelInstalled } from '@/lib/nrmAlignModelNative';
import { loadAlignModelPreference } from '@/lib/nrmDownloadSettings';
import { hasAnyWhisperModelOnDevice } from '@/lib/nrmWhisperModelNative';
import { usesPcBackendInDev } from '@/lib/nrmDevRuntime';
import { isStandaloneAndroid } from '@/lib/nrmStandalonePlatform';
import {
  bootstrapTrackEditorState,
  EMPTY_METADATA_FIELDS,
} from '@/lib/nrmTrackEditorBootstrap';
import { notifyUser } from '@/lib/nrmUserNotify';
import type { YoutubeSearchItem } from '@/lib/youtubeSearchTypes';

type Props = {
  isDark: boolean;
};

type HistorySection = {
  dateKey: string;
  title: string;
  entryCount: number;
  data: NrmActivityHistoryEntry[];
};

function stemOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return (dot > 0 ? fileName.slice(0, dot) : fileName).trim().toLowerCase();
}

function fakeYoutubeItem(track: NrmDownloadTrackItem): YoutubeSearchItem {
  return {
    videoId: `local:${track.audioUri}`,
    title: track.displayLabel,
    channelTitle: '',
    thumbnailUrl: '',
  };
}

/** 설정된 기간의 활동 기록 — 탭 시 Storage와 동일한 메타데이터 편집 */
export function NrmHomeHistoryScreen({ isDark }: Props) {
  const [items, setItems] = useState<NrmActivityHistoryEntry[]>([]);
  const [displayDays, setDisplayDays] = useState<NrmActivityHistoryDisplayDays>(
    DEFAULT_ACTIVITY_HISTORY_DISPLAY_DAYS,
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  /** 비어 있으면 모든 날짜 섹션이 펼쳐진 상태 */
  const [collapsedDateKeys, setCollapsedDateKeys] = useState<Set<string>>(() => new Set());

  const [editTrack, setEditTrack] = useState<NrmDownloadTrackItem | null>(null);
  const [modalBusy, setModalBusy] = useState(false);
  const [initialArtist, setInitialArtist] = useState('');
  const [initialTitle, setInitialTitle] = useState('');
  const [initialFields, setInitialFields] = useState<
    Omit<NrmAudioFileMetadata, 'artist' | 'title'>
  >(EMPTY_METADATA_FIELDS);
  const [initialLyricsMode, setInitialLyricsMode] = useState<NrmLyricsUiMode>('unset');
  const [initialMelonLyricsAvailable, setInitialMelonLyricsAvailable] = useState(false);
  const [initialHasEmbeddedSyncLyrics, setInitialHasEmbeddedSyncLyrics] = useState(false);
  const savingTracksRef = useRef<Set<string>>(new Set());

  const titleColor = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
  const bodyColor = isDark ? nrmTokens.color.textMuted : nrmTokens.color.inkMuted48;
  const hairline = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const sectionHeaderBg = isDark ? nrmTokens.color.surfaceTile1 : nrmTokens.color.canvas;
  const dateColor = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;

  const sections = useMemo((): HistorySection[] => {
    return groupActivityHistoryByDate(items).map((section) => ({
      dateKey: section.title,
      title: formatActivityHistoryDateTitle(section.title),
      entryCount: section.data.length,
      data: collapsedDateKeys.has(section.title) ? [] : section.data,
    }));
  }, [collapsedDateKeys, items]);

  const applySnapshot = useCallback(
    (days: NrmActivityHistoryDisplayDays, rows: NrmActivityHistoryEntry[]) => {
      setDisplayDays(days);
      setItems(rows);
    },
    [],
  );

  const reloadHistory = useCallback(async () => {
    const peek = await peekActivityHistoryForDisplay();
    applySnapshot(peek.displayDays, peek.items);
  }, [applySnapshot]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await reloadHistory();
      setLoading(false);
    })();
  }, [reloadHistory]);

  useEffect(() => {
    registerActivityHistoryDisplayListener((days) => {
      void peekActivityHistoryForDisplay().then((peek) => {
        if (peek.displayDays === days) {
          applySnapshot(days, peek.items);
        }
      });
    });
    return () => registerActivityHistoryDisplayListener(null);
  }, [applySnapshot]);

  useEffect(() => {
    registerActivityHistoryRevisionListener(() => {
      void reloadHistory();
    });
    return () => registerActivityHistoryRevisionListener(null);
  }, [reloadHistory]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    invalidateActivityHistoryCache();
    await reloadHistory();
    setRefreshing(false);
  }, [reloadHistory]);

  const toggleDateSection = useCallback((dateKey: string) => {
    setCollapsedDateKeys((prev) => {
      const next = new Set(prev);
      if (next.has(dateKey)) next.delete(dateKey);
      else next.add(dateKey);
      return next;
    });
  }, []);

  const emptyMessage =
    displayDays === '0' ? 'History 표시가 꺼져 있습니다.' : '최근 기록이 없습니다.';

  const openEditorForTrack = useCallback(async (track: NrmDownloadTrackItem) => {
    setEditTrack(track);
    setModalBusy(true);
    setInitialArtist('');
    setInitialTitle('');
    setInitialFields(EMPTY_METADATA_FIELDS);
    setInitialLyricsMode('unset');
    setInitialMelonLyricsAvailable(false);
    setInitialHasEmbeddedSyncLyrics(false);
    try {
      const state = await bootstrapTrackEditorState(track);
      setInitialLyricsMode(state.initialLyricsMode);
      setInitialMelonLyricsAvailable(state.initialMelonLyricsAvailable);
      setInitialHasEmbeddedSyncLyrics(state.initialHasEmbeddedSyncLyrics);
      setInitialArtist(state.initialArtist);
      setInitialTitle(state.initialTitle);
      setInitialFields(state.initialFields);
    } finally {
      setModalBusy(false);
    }
  }, []);

  const onPressEntry = useCallback(
    async (entry: NrmActivityHistoryEntry) => {
      if (!activityHistoryEntryOpensTrack(entry)) return;
      if (Platform.OS === 'web') {
        void notifyUser('트랙 편집은 Android·iOS 앱에서만 사용할 수 있습니다.');
        return;
      }
      try {
        const tracks = await listDownloadAudioTracks();
        const track = findDownloadTrackForHistory(tracks, entry);
        if (!track) {
          void notifyUser('존재하지 않는 파일입니다.');
          return;
        }
        await openEditorForTrack(track);
      } catch {
        void notifyUser('존재하지 않는 파일입니다.');
      }
    },
    [openEditorForTrack],
  );

  const onSave = useCallback(
    (_videoId: string, fileName: string, metadata: NrmAudioFileMetadata) => {
      if (!editTrack) return;
      const trackKey = editTrack.audioUri;
      if (savingTracksRef.current.has(trackKey)) return;

      const track = editTrack;
      const lyricsModeAtOpen = initialLyricsMode;
      const hasEmbeddedSyncAtOpen = initialHasEmbeddedSyncLyrics;
      const artistAtOpen = initialArtist;
      const titleAtOpen = initialTitle;
      const fieldsAtOpen = initialFields;
      setEditTrack(null);

      void (async () => {
        savingTracksRef.current.add(trackKey);
        try {
          invalidateAudioMetadataCache(track.audioUri);
          await invalidateListCoverDiskCache(trackListCoverKey(track));

          const newLyricsRaw = metadata.lyrics;
          let newLyricsMode: NrmLyricsUiMode = 'unset';
          if (newLyricsRaw) {
            const { parseLyricsUiMode } = await import('@/lib/nrmMelonLyrics');
            newLyricsMode = parseLyricsUiMode(newLyricsRaw);
          }
          let effectiveNewLyricsMode = newLyricsMode;
          const lyricsEditable =
            (track.extension === '.mp3' || track.extension === '.m4a') &&
            (isStandaloneAndroid() || usesPcBackendInDev());
          if (lyricsEditable) {
            const alignPref = await loadAlignModelPreference();
            const [whisperReady, alignReady] = await Promise.all([
              hasAnyWhisperModelOnDevice(),
              isAlignModelInstalled(alignPref),
            ]);
            if (!whisperReady && newLyricsMode === 'unset' && lyricsModeAtOpen !== 'unset') {
              if (
                lyricsModeAtOpen === 'configured' ||
                lyricsModeAtOpen === 'translation'
              ) {
                effectiveNewLyricsMode = lyricsModeAtOpen;
              }
            }
            if (!alignReady && newLyricsMode === 'unset' && lyricsModeAtOpen !== 'unset') {
              if (
                lyricsModeAtOpen === 'melon' ||
                lyricsModeAtOpen === 'melon_translation'
              ) {
                effectiveNewLyricsMode = lyricsModeAtOpen;
              }
            }
          } else if (lyricsModeAtOpen !== 'unset') {
            effectiveNewLyricsMode = lyricsModeAtOpen;
          }

          const updateResult = await applyTrackMetadataUpdate({
            track,
            newFileName: fileName,
            metadata,
            initialLyricsMode: lyricsModeAtOpen,
            newLyricsMode: effectiveNewLyricsMode,
            hasEmbeddedSyncLyrics: hasEmbeddedSyncAtOpen,
          });
          await logStorageMetadataHistory({
            track,
            fileNameAfter: fileName,
            audioUriAfter: track.audioUri,
            metadataAfter: metadata,
            beforeArtist: artistAtOpen,
            beforeTitle: titleAtOpen,
            beforeFields: fieldsAtOpen,
            lyricsModeBefore: lyricsModeAtOpen,
            lyricsModeAfter: effectiveNewLyricsMode,
            lyricsSaved: updateResult.lyricsSaved,
            lyricsTranslationFailed: updateResult.lyricsTranslationFailed,
          });
          await reloadHistory();
        } catch (e) {
          void notifyUser(e instanceof Error ? e.message : '저장에 실패했습니다.');
        } finally {
          savingTracksRef.current.delete(trackKey);
        }
      })();
    },
    [
      editTrack,
      initialArtist,
      initialFields,
      initialHasEmbeddedSyncLyrics,
      initialLyricsMode,
      initialTitle,
      reloadHistory,
    ],
  );

  const onDeleteTrack = useCallback(async () => {
    if (!editTrack) return;
    const track = editTrack;
    try {
      await logStorageTrackRemoveHistory(track);
      await deleteDownloadTrack(track);
      await invalidateListCoverDiskCache(trackListCoverKey(track));
      setEditTrack(null);
      await reloadHistory();
    } catch (e) {
      void notifyUser(e instanceof Error ? e.message : '파일 삭제에 실패했습니다.');
    }
  }, [editTrack, reloadHistory]);

  const renderSectionHeader = useCallback(
    ({ section }: { section: HistorySection }) => {
      const expanded = !collapsedDateKeys.has(section.dateKey);
      return (
        <Pressable
          onPress={() => toggleDateSection(section.dateKey)}
          style={({ pressed }) => [
            styles.sectionHeader,
            { backgroundColor: sectionHeaderBg, borderBottomColor: hairline },
            pressed && styles.sectionHeaderPressed,
          ]}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`${section.title}, ${section.entryCount}건`}>
          <Text style={[styles.sectionHeaderLabel, { color: dateColor }]}>{section.title}</Text>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={bodyColor}
          />
        </Pressable>
      );
    },
    [bodyColor, collapsedDateKeys, dateColor, hairline, sectionHeaderBg, toggleDateSection],
  );

  const renderItem = useCallback(
    ({ item }: { item: NrmActivityHistoryEntry }) => {
      const pressable = activityHistoryEntryOpensTrack(item);
      const labelStyle = [styles.rowLabel, { color: pressable ? titleColor : bodyColor }];

      if (!pressable) {
        return (
          <View style={[styles.row, { borderBottomColor: hairline }]}>
            <Text style={labelStyle} numberOfLines={2}>
              {formatActivityHistoryLabel(item)}
            </Text>
            <Text style={[styles.rowWhen, { color: bodyColor }]}>
              {formatActivityHistoryTime(item.createdAt)}
            </Text>
          </View>
        );
      }

      return (
        <Pressable
          onPress={() => void onPressEntry(item)}
          style={({ pressed }) => [
            styles.row,
            { borderBottomColor: hairline },
            pressed && styles.rowPressed,
          ]}
          accessibilityRole="button">
          <Text style={labelStyle} numberOfLines={2}>
            {formatActivityHistoryLabel(item)}
          </Text>
          <Text style={[styles.rowWhen, { color: bodyColor }]}>
            {formatActivityHistoryTime(item.createdAt)}
          </Text>
        </Pressable>
      );
    },
    [bodyColor, hairline, onPressEntry, titleColor],
  );

  return (
    <View style={styles.wrap}>
      {loading ? (
        <ActivityIndicator style={styles.loader} color={nrmTokens.color.primary} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          contentContainerStyle={sections.length === 0 ? styles.emptyContent : styles.listContent}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: bodyColor }]}>{emptyMessage}</Text>
          }
          renderSectionHeader={renderSectionHeader}
          renderItem={renderItem}
          stickySectionHeadersEnabled
          showsVerticalScrollIndicator={false}
          initialNumToRender={20}
          maxToRenderPerBatch={15}
          windowSize={10}
        />
      )}

      <NrmMetadataEditModal
        visible={!!editTrack}
        item={editTrack ? fakeYoutubeItem(editTrack) : null}
        isDark={isDark}
        purpose="trackEdit"
        excludeFileStem={editTrack ? stemOf(editTrack.fileName) : undefined}
        fixedExtension={editTrack?.extension}
        initialArtist={initialArtist}
        initialTitle={initialTitle}
        initialMetadataFields={initialFields}
        initialStoredLyricsMode={initialLyricsMode}
        initialMelonLyricsAvailable={initialMelonLyricsAvailable}
        initialTrackLrcUri={editTrack?.lrcUri}
        initialHasEmbeddedSyncLyrics={initialHasEmbeddedSyncLyrics}
        busy={modalBusy}
        deleteFileName={editTrack?.fileName}
        onDelete={editTrack ? onDeleteTrack : undefined}
        onClose={() => setEditTrack(null)}
        onConfirm={onSave}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    paddingTop: nrmTokens.layout.homeTabTopInset,
    paddingHorizontal: nrmTokens.space.md,
  },
  loader: {
    marginTop: nrmTokens.space.xl,
  },
  listContent: {
    paddingBottom: nrmTokens.space.xxl,
  },
  emptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: nrmTokens.space.xxl,
  },
  empty: {
    textAlign: 'center',
    fontSize: nrmTokens.font.body,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: nrmTokens.space.xs,
    paddingTop: nrmTokens.space.sm,
    paddingBottom: nrmTokens.space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionHeaderPressed: {
    opacity: 0.9,
  },
  sectionHeaderLabel: {
    fontSize: nrmTokens.font.bodyStrong,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  row: {
    paddingVertical: nrmTokens.space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  rowPressed: {
    opacity: 0.88,
  },
  rowLabel: {
    fontSize: nrmTokens.font.body,
    fontWeight: '500',
    lineHeight: 22,
  },
  rowWhen: {
    fontSize: nrmTokens.font.caption,
  },
});
