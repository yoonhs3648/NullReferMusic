import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { NrmMetadataEditModal } from '@/components/nrm/NrmMetadataEditModal';
import { nrmTokens } from '@/constants/nrmTokens';
import {
  activityHistoryEntryOpensTrack,
  activityHistoryKindBadge,
  formatActivityHistoryDateTitle,
  formatActivityHistoryTime,
  formatActivityHistoryTrackLabel,
  groupActivityHistoryByDate,
  invalidateActivityHistoryCache,
  peekActivityHistoryForDisplay,
  registerActivityHistoryRevisionListener,
  type NrmActivityHistoryEntry,
  type NrmActivityHistoryKindBadge,
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

type HistoryDateBlock = {
  dateKey: string;
  title: string;
  entries: NrmActivityHistoryEntry[];
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

function badgeColors(
  tone: NrmActivityHistoryKindBadge['tone'],
  isDark: boolean,
): { bg: string; fg: string } {
  switch (tone) {
    case 'success':
      return isDark
        ? { bg: 'rgba(110,207,138,0.22)', fg: '#6ecf8e' }
        : { bg: 'rgba(46,160,87,0.12)', fg: nrmTokens.color.success };
    case 'primary':
      return isDark
        ? { bg: 'rgba(0,102,204,0.22)', fg: nrmTokens.color.primaryOnDark }
        : { bg: nrmTokens.color.accentSoft, fg: nrmTokens.color.primary };
    case 'warning':
      return isDark
        ? { bg: 'rgba(255,180,80,0.18)', fg: '#e8a84a' }
        : { bg: 'rgba(230,140,40,0.12)', fg: '#c27800' };
    case 'danger':
      return isDark
        ? { bg: 'rgba(215,0,21,0.2)', fg: '#ff6b7a' }
        : { bg: 'rgba(215,0,21,0.1)', fg: nrmTokens.color.danger };
    case 'neutral':
    default:
      return isDark
        ? { bg: 'rgba(255,255,255,0.08)', fg: nrmTokens.color.textMuted }
        : { bg: 'rgba(0,0,0,0.06)', fg: nrmTokens.color.inkMuted80 };
  }
}

type HistoryEntryRowProps = {
  entry: NrmActivityHistoryEntry;
  isDark: boolean;
  titleColor: string;
  bodyColor: string;
  hairline: string;
  onPress: (entry: NrmActivityHistoryEntry) => void;
  isLast: boolean;
};

function HistoryEntryRow({
  entry,
  isDark,
  titleColor,
  bodyColor,
  hairline,
  onPress,
  isLast,
}: HistoryEntryRowProps) {
  const badge = activityHistoryKindBadge(entry.kind);
  const badgeStyle = badgeColors(badge.tone, isDark);
  const trackLabel = formatActivityHistoryTrackLabel(entry);
  const pressable = activityHistoryEntryOpensTrack(entry);
  const rowStyle = [
    styles.entryRow,
    !isLast && { borderBottomColor: hairline, borderBottomWidth: StyleSheet.hairlineWidth },
    !pressable && styles.entryRowStatic,
  ];

  const content = (
    <>
      <View style={[styles.kindBadge, { backgroundColor: badgeStyle.bg }]}>
        <Text style={[styles.kindBadgeText, { color: badgeStyle.fg }]} numberOfLines={1}>
          {badge.label}
        </Text>
      </View>
      <Text
        style={[
          styles.entryTitle,
          { color: pressable ? titleColor : bodyColor },
        ]}
        numberOfLines={2}>
        {trackLabel}
      </Text>
      <Text style={[styles.entryTime, { color: bodyColor }]}>
        {formatActivityHistoryTime(entry.createdAt)}
      </Text>
    </>
  );

  if (!pressable) {
    return (
      <View style={rowStyle} accessibilityRole="text">
        {content}
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => onPress(entry)}
      style={({ pressed }) => [rowStyle, pressed && styles.entryRowPressed]}
      accessibilityRole="button">
      {content}
    </Pressable>
  );
}

type HistoryDateSectionProps = {
  block: HistoryDateBlock;
  expanded: boolean;
  isDark: boolean;
  titleColor: string;
  bodyColor: string;
  hairline: string;
  cardBg: string;
  onToggle: (dateKey: string) => void;
  onPressEntry: (entry: NrmActivityHistoryEntry) => void;
};

function HistoryDateSection({
  block,
  expanded,
  isDark,
  titleColor,
  bodyColor,
  hairline,
  cardBg,
  onToggle,
  onPressEntry,
}: HistoryDateSectionProps) {
  const countBg = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)';
  const countColor = isDark ? nrmTokens.color.textMuted : nrmTokens.color.inkMuted48;

  return (
    <View style={styles.dateSection}>
      <Pressable
        onPress={() => onToggle(block.dateKey)}
        style={({ pressed }) => [
          styles.dateHeader,
          { borderColor: hairline, backgroundColor: cardBg },
          pressed && styles.dateHeaderPressed,
        ]}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${block.title}, ${block.entries.length}건`}>
        <View style={styles.dateHeaderMain}>
          <Text style={[styles.dateTitle, { color: titleColor }]}>{block.title}</Text>
          <View style={[styles.countBadge, { backgroundColor: countBg }]}>
            <Text style={[styles.countBadgeText, { color: countColor }]}>
              {block.entries.length}
            </Text>
          </View>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={bodyColor}
        />
      </Pressable>

      {expanded ? (
        <View style={[styles.entriesCard, { borderColor: hairline, backgroundColor: cardBg }]}>
          {block.entries.map((entry, index) => (
            <HistoryEntryRow
              key={entry.id}
              entry={entry}
              isDark={isDark}
              titleColor={titleColor}
              bodyColor={bodyColor}
              hairline={hairline}
              onPress={onPressEntry}
              isLast={index === block.entries.length - 1}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
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
  const cardBg = isDark ? nrmTokens.color.surfaceTile2 : nrmTokens.color.canvas;

  const dateBlocks = useMemo((): HistoryDateBlock[] => {
    return groupActivityHistoryByDate(items).map((section) => ({
      dateKey: section.title,
      title: formatActivityHistoryDateTitle(section.title),
      entries: section.data,
    }));
  }, [items]);

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

  const renderDateBlock = useCallback(
    ({ item: block }: { item: HistoryDateBlock }) => (
      <HistoryDateSection
        block={block}
        expanded={!collapsedDateKeys.has(block.dateKey)}
        isDark={isDark}
        titleColor={titleColor}
        bodyColor={bodyColor}
        hairline={hairline}
        cardBg={cardBg}
        onToggle={toggleDateSection}
        onPressEntry={(entry) => void onPressEntry(entry)}
      />
    ),
    [
      bodyColor,
      cardBg,
      collapsedDateKeys,
      hairline,
      isDark,
      onPressEntry,
      titleColor,
      toggleDateSection,
    ],
  );

  return (
    <View style={styles.wrap}>
      {loading ? (
        <ActivityIndicator style={styles.loader} color={nrmTokens.color.primary} />
      ) : (
        <FlatList
          data={dateBlocks}
          keyExtractor={(block) => block.dateKey}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          contentContainerStyle={
            dateBlocks.length === 0 ? styles.emptyContent : styles.listContent
          }
          ListEmptyComponent={
            <Text style={[styles.empty, { color: bodyColor }]}>{emptyMessage}</Text>
          }
          renderItem={renderDateBlock}
          showsVerticalScrollIndicator={false}
          initialNumToRender={8}
          maxToRenderPerBatch={6}
          windowSize={8}
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
  dateSection: {
    gap: nrmTokens.space.xxs,
    marginBottom: nrmTokens.space.sm,
  },
  dateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: nrmTokens.space.sm,
    paddingHorizontal: nrmTokens.space.md,
    borderRadius: nrmTokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dateHeaderPressed: {
    opacity: 0.9,
  },
  dateHeaderMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.sm,
    flex: 1,
    minWidth: 0,
  },
  dateTitle: {
    fontSize: nrmTokens.font.bodyStrong,
    fontWeight: '700',
  },
  countBadge: {
    minWidth: 22,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: nrmTokens.radius.pill,
    alignItems: 'center',
  },
  countBadgeText: {
    fontSize: nrmTokens.font.caption,
    fontWeight: '600',
  },
  entriesCard: {
    borderRadius: nrmTokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.sm,
    paddingVertical: nrmTokens.space.sm,
    paddingHorizontal: nrmTokens.space.md,
  },
  entryRowPressed: {
    opacity: 0.88,
  },
  entryRowStatic: {
    opacity: 0.92,
  },
  kindBadge: {
    borderRadius: nrmTokens.radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    maxWidth: 72,
  },
  kindBadgeText: {
    fontSize: nrmTokens.font.finePrint,
    fontWeight: '600',
    textAlign: 'center',
  },
  entryTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: nrmTokens.font.body,
    fontWeight: '500',
    lineHeight: 20,
  },
  entryTime: {
    fontSize: nrmTokens.font.caption,
    fontVariant: ['tabular-nums'],
    minWidth: 40,
    textAlign: 'right',
  },
});
