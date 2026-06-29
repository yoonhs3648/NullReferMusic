import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewToken,
} from 'react-native';

import { NrmChartTrackArt } from '@/components/nrm/charts/NrmChartTrackArt';
import { nrmChartTrackListStyles } from '@/components/nrm/charts/nrmChartTrackListStyles';
import { NrmMetadataEditModal } from '@/components/nrm/NrmMetadataEditModal';
import { NrmTrackListSectionIndex } from '@/components/nrm/NrmTrackListSectionIndex';
import { nrmTokens } from '@/constants/nrmTokens';
import type { NrmDownloadTrackItem } from '@/lib/nrmDownloadTrackTypes';
import type { NrmLyricsUiMode } from '@/lib/nrmMelonLyrics';
import type { NrmAudioFileMetadata } from '@/lib/nrmDownloadAudioMetadata';
import { listDownloadAudioTracks } from '@/lib/nrmListDownloadTracks';
import {
  buildTrackListSections,
  filterTracksByQuery,
  resolveSectionIndexForIndexLabel,
  sortTracksForList,
  type TrackListIndexLabel,
  type TrackListSection,
} from '@/lib/nrmTrackListIndex';
import { applyTrackMetadataUpdate } from '@/lib/nrmTrackMetadataUpdate';
import { deleteDownloadTrack } from '@/lib/nrmDeleteDownloadTrack';
import {
  invalidateListCoverDiskCache,
  prefetchInitialTrackCovers,
  trackListCoverKey,
  useTrackListCoverMap,
} from '@/lib/nrmTrackListCoverLoader';
import { invalidateAudioMetadataCache } from '@/lib/nrmReadAudioMetadata';
import { isAlignModelInstalled } from '@/lib/nrmAlignModelNative';
import { loadAlignModelPreference } from '@/lib/nrmDownloadSettings';
import { hasAnyWhisperModelOnDevice } from '@/lib/nrmWhisperModelNative';
import { usesPcBackendInDev } from '@/lib/nrmDevRuntime';
import { isStandaloneAndroid } from '@/lib/nrmStandalonePlatform';
import type { YoutubeSearchItem } from '@/lib/youtubeSearchTypes';
import {
  logStorageMetadataHistory,
  logStorageTrackRemoveHistory,
} from '@/lib/nrmStorageActivityHistory';
import {
  bootstrapTrackEditorState,
  EMPTY_METADATA_FIELDS,
} from '@/lib/nrmTrackEditorBootstrap';

type Props = {
  isDark: boolean;
  titleColor: string;
  bodyColor: string;
  onBack: () => void;
  hideBack?: boolean;
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

const EMPTY_METADATA_FIELDS_LOCAL = EMPTY_METADATA_FIELDS;

function isDownloadTrackItem(item: unknown): item is NrmDownloadTrackItem {
  return (
    typeof item === 'object' &&
    item !== null &&
    'audioUri' in item &&
    'fileName' in item
  );
}

function tracksFromViewTokens(
  viewableItems: ViewToken[],
): NrmDownloadTrackItem[] {
  const out: NrmDownloadTrackItem[] = [];
  for (const entry of viewableItems) {
    if (entry.isViewable && isDownloadTrackItem(entry.item)) {
      out.push(entry.item);
    }
  }
  return out;
}

/** FlatList/SectionList keyExtractor — 모듈 레벨 상수로 매 렌더 함수 재생성 방지 */
const keyExtractorTrack = (item: NrmDownloadTrackItem) => item.audioUri;

/** 아이콘 마진 — 모듈 레벨로 매 렌더 객체 재생성 방지 */
const CHEVRON_STYLE = { marginRight: 8 } as const;

/**
 * 트랙 행 아이템 — React.memo 적용으로 커버 로드 시 해당 아이템만 리렌더.
 * 다른 커버가 로드되어 coverByKey 참조가 바뀌어도 나머지 아이템은 리렌더 스킵.
 */
const TrackListItem = memo(function TrackListItem({
  item,
  coverKey,
  coverUrl,
  bodyColor,
  titleColor,
  row,
  onPress,
}: {
  item: NrmDownloadTrackItem;
  coverKey: string;
  coverUrl: string;
  bodyColor: string;
  titleColor: string;
  row: typeof nrmChartTrackListStyles;
  onPress: (item: NrmDownloadTrackItem) => void;
}) {
  return (
    <Pressable
      onPress={() => onPress(item)}
      style={({ pressed }) => [row.trackRow, pressed && row.trackRowPressed]}
      accessibilityRole="button">
      <NrmChartTrackArt imageUrl={coverUrl} cacheKey={coverKey} />
      <View style={row.trackMeta}>
        <Text style={[row.trackTitle, { color: titleColor }]} numberOfLines={2}>
          {item.displayLabel}
        </Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={18}
        color={bodyColor}
        style={CHEVRON_STYLE}
      />
    </Pressable>
  );
});

export function NrmTrackMetadataSettingsHome({
  isDark,
  titleColor,
  bodyColor,
  onBack,
  hideBack = false,
}: Props) {
  const row = nrmChartTrackListStyles;
  const sectionListRef = useRef<SectionList<NrmDownloadTrackItem, TrackListSection>>(null);
  const pendingScrollTargetRef = useRef<{
    sectionIndex: number;
    itemIndex: number;
    animated: boolean;
    retryCount: number;
  } | null>(null);
  const searchInputRef = useRef<TextInput>(null);

  const [loading, setLoading] = useState(true);
  const [tracks, setTracks] = useState<NrmDownloadTrackItem[]>([]);
  const [listGeneration, setListGeneration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [editTrack, setEditTrack] = useState<NrmDownloadTrackItem | null>(null);
  const [modalBusy, setModalBusy] = useState(false);
  const [initialArtist, setInitialArtist] = useState('');
  const [initialTitle, setInitialTitle] = useState('');
  const [initialFields, setInitialFields] = useState<
    Omit<NrmAudioFileMetadata, 'artist' | 'title'>
  >(EMPTY_METADATA_FIELDS_LOCAL);
  const [initialLyricsMode, setInitialLyricsMode] = useState<NrmLyricsUiMode>('unset');
  const [initialMelonLyricsAvailable, setInitialMelonLyricsAvailable] = useState(false);
  const [initialHasEmbeddedSyncLyrics, setInitialHasEmbeddedSyncLyrics] = useState(false);
  const savingTracksRef = useRef<Set<string>>(new Set());

  const borderColor = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const searchBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
  const sectionHeaderBg = isDark ? nrmTokens.color.surfaceTile2 : nrmTokens.color.surfacePearl;

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (Platform.OS === 'web') {
        setTracks([]);
        setError('트랙 메타데이터 설정은 Android·iOS 앱에서만 사용할 수 있습니다.');
        return;
      }
      const items = await listDownloadAudioTracks();
      setTracks(items);
      setListGeneration((g) => g + 1);
      if (items.length === 0) {
        setError('다운로드 경로에 오디오 파일이 없습니다. 다운로드 설정에서 경로를 확인하세요.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '목록을 불러오지 못했습니다.');
      setTracks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (searchOpen) {
      const t = setTimeout(() => searchInputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
    setSearchQuery('');
    return undefined;
  }, [searchOpen]);

  const filteredTracks = useMemo(
    () => filterTracksByQuery(tracks, searchQuery),
    [tracks, searchQuery],
  );

  const sections = useMemo(
    () => buildTrackListSections(filteredTracks),
    [filteredTracks],
  );

  const { coverByKey, requestCovers } = useTrackListCoverMap(listGeneration);
  const requestCoversRef = useRef(requestCovers);
  requestCoversRef.current = requestCovers;

  const searchFlatData = useMemo(
    () => sortTracksForList(filteredTracks),
    [filteredTracks],
  );

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 15,
    minimumViewTime: 80,
  }).current;

  const onSectionViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const visible = tracksFromViewTokens(viewableItems);
      if (visible.length > 0) requestCoversRef.current(visible);
    },
    [],
  );

  const onSearchViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const visible = tracksFromViewTokens(viewableItems);
      if (visible.length > 0) requestCoversRef.current(visible);
    },
    [],
  );

  /** 목록 로드 직후 상단 일부만 선로드 (SectionList 표시 순서 기준) */
  useEffect(() => {
    if (loading || searchOpen || sections.length === 0) return;
    const ordered = sections.flatMap((s) => s.data);
    prefetchInitialTrackCovers(ordered, requestCovers);
  }, [loading, listGeneration, requestCovers, searchOpen, sections]);

  /** 검색 결과 — 캐시에 없는 항목만 비동기 요청 (디바운스) */
  useEffect(() => {
    if (!searchOpen) return;
    const t = setTimeout(() => {
      if (searchFlatData.length > 0) {
        requestCovers(searchFlatData);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [requestCovers, searchFlatData, searchOpen]);

  const openSearch = useCallback(() => setSearchOpen(true), []);
  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery('');
  }, []);

  const scrollToSectionStart = useCallback((sectionIndex: number, animated: boolean) => {
    pendingScrollTargetRef.current = { sectionIndex, itemIndex: 0, animated, retryCount: 0 };
    sectionListRef.current?.scrollToLocation({
      sectionIndex,
      itemIndex: 0,
      animated,
      viewPosition: 0,
    });
  }, []);

  const onSelectIndexLabel = useCallback(
    (label: TrackListIndexLabel, animated = true) => {
      const sectionIndex = resolveSectionIndexForIndexLabel(label, sections);
      if (sectionIndex < 0) return;
      scrollToSectionStart(sectionIndex, animated);
    },
    [scrollToSectionStart, sections],
  );

  const openEditor = useCallback(async (track: NrmDownloadTrackItem) => {
    setEditTrack(track);
    setModalBusy(true);
    setInitialArtist('');
    setInitialTitle('');
    setInitialFields(EMPTY_METADATA_FIELDS_LOCAL);
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
          // 저장 전에 캐시 무효화 (저장 후 새 데이터를 읽도록)
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
          await reload();
        } catch (e) {
          setError(e instanceof Error ? e.message : '저장에 실패했습니다.');
        } finally {
          savingTracksRef.current.delete(trackKey);
        }
      })();
    },
    [editTrack, initialArtist, initialFields, initialHasEmbeddedSyncLyrics, initialLyricsMode, initialTitle, reload],
  );

  const onDeleteTrack = useCallback(async () => {
    if (!editTrack) return;
    const track = editTrack;
    try {
      await logStorageTrackRemoveHistory(track);
      await deleteDownloadTrack(track);
      await invalidateListCoverDiskCache(trackListCoverKey(track));
      setEditTrack(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : '파일 삭제에 실패했습니다.');
    }
  }, [editTrack, reload]);

  /** renderItem 시그니처로 직접 사용 — 래퍼 화살표 함수 없이 FlatList에 전달 */
  const renderTrackRow = useCallback(
    ({ item }: { item: NrmDownloadTrackItem }) => {
      const coverKey = trackListCoverKey(item);
      return (
        <TrackListItem
          item={item}
          coverKey={coverKey}
          coverUrl={coverByKey[coverKey] ?? ''}
          bodyColor={bodyColor}
          titleColor={titleColor}
          row={row}
          onPress={openEditor}
        />
      );
    },
    [bodyColor, coverByKey, openEditor, row, titleColor],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: TrackListSection }) => (
      <View style={[styles.sectionHeader, { backgroundColor: sectionHeaderBg }]}>
        <Text style={[styles.sectionHeaderLabel, { color: bodyColor }]}>
          {section.title}
        </Text>
      </View>
    ),
    [bodyColor, sectionHeaderBg],
  );

  const onScrollToIndexFailed = useCallback(
    (info: { index: number; highestMeasuredFrameIndex: number; averageItemLength: number }) => {
      const pending = pendingScrollTargetRef.current;
      if (!pending) return;

      const nextRetryCount = pending.retryCount + 1;
      if (nextRetryCount > 8) {
        pendingScrollTargetRef.current = null;
        return;
      }

      pendingScrollTargetRef.current = { ...pending, retryCount: nextRetryCount };

      const offset = Math.max(0, info.averageItemLength * info.highestMeasuredFrameIndex);
      sectionListRef.current?.getScrollResponder()?.scrollTo({ y: offset, animated: false });

      setTimeout(() => {
        const target = pendingScrollTargetRef.current;
        if (!target) return;
        sectionListRef.current?.scrollToLocation({
          sectionIndex: target.sectionIndex,
          itemIndex: target.itemIndex,
          animated: target.animated,
          viewPosition: 0,
        });
      }, 100);
    },
    [],
  );

  const listEmpty = loading ? (
    <ActivityIndicator style={styles.loader} color={nrmTokens.color.primary} />
  ) : error ? (
    <Text style={[styles.hint, { color: bodyColor }]}>{error}</Text>
  ) : searchOpen && searchQuery.trim() ? (
    <Text style={[styles.hint, { color: bodyColor }]}>검색 결과가 없습니다.</Text>
  ) : null;

  return (
    <View style={styles.wrap}>
      {hideBack ? null : (
        <Pressable onPress={onBack} style={styles.backRow} accessibilityRole="button">
          <Ionicons name="chevron-back" size={22} color={nrmTokens.color.primary} />
          <Text style={[styles.backLabel, { color: nrmTokens.color.primary }]}>뒤로</Text>
        </Pressable>
      )}

      <View style={styles.topActionRow}>
        <View style={styles.topActionSpacer} />
        <Pressable
          onPress={searchOpen ? closeSearch : openSearch}
          style={({ pressed }) => [
            styles.searchToggle,
            pressed && styles.searchTogglePressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={searchOpen ? '검색 닫기' : '트랙 검색'}>
          <Ionicons
            name={searchOpen ? 'close' : 'search'}
            size={22}
            color={searchOpen ? bodyColor : nrmTokens.color.primary}
          />
        </Pressable>
      </View>

      {searchOpen ? (
        <View
          style={[
            styles.searchFieldWrap,
            { borderColor, backgroundColor: searchBg },
          ]}>
          <Ionicons name="search" size={18} color={bodyColor} style={styles.searchFieldIcon} />
          <TextInput
            ref={searchInputRef}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="트랙 검색"
            placeholderTextColor={bodyColor}
            style={[styles.searchInput, { color: titleColor }]}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>
      ) : (
        null
      )}

      <View style={styles.listArea}>
        <View style={styles.listColumn}>
          {searchOpen ? (
            <FlatList
              style={styles.listFlex}
              data={searchFlatData}
              keyExtractor={keyExtractorTrack}
              renderItem={renderTrackRow}
              ListEmptyComponent={listEmpty}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              viewabilityConfig={viewabilityConfig}
              onViewableItemsChanged={onSearchViewableItemsChanged}
              initialNumToRender={15}
              maxToRenderPerBatch={10}
              windowSize={10}
              removeClippedSubviews={Platform.OS === 'android'}
            />
          ) : (
            <SectionList
              ref={sectionListRef}
              style={styles.listFlex}
              sections={sections}
              keyExtractor={keyExtractorTrack}
              renderItem={renderTrackRow}
              renderSectionHeader={renderSectionHeader}
              ListEmptyComponent={listEmpty}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              stickySectionHeadersEnabled
              viewabilityConfig={viewabilityConfig}
              onViewableItemsChanged={onSectionViewableItemsChanged}
              onScrollToIndexFailed={onScrollToIndexFailed}
              initialNumToRender={15}
              maxToRenderPerBatch={10}
              windowSize={10}
            />
          )}
        </View>
        {!searchOpen && sections.length > 0 ? (
          <NrmTrackListSectionIndex
            onSelect={onSelectIndexLabel}
            mutedColor={bodyColor}
            isDark={isDark}
          />
        ) : null}
      </View>

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
    paddingTop: nrmTokens.layout.homeTabTopInset,
    marginRight: -nrmTokens.space.sm,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: nrmTokens.space.sm,
  },
  backLabel: { fontSize: nrmTokens.font.body, fontWeight: '600' },
  topActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: nrmTokens.space.xs,
  },
  topActionSpacer: {
    width: nrmTokens.layout.touchMin,
    height: nrmTokens.layout.touchMin,
  },
  searchToggle: {
    width: nrmTokens.layout.touchMin,
    height: nrmTokens.layout.touchMin,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: nrmTokens.radius.pill,
  },
  searchTogglePressed: {
    transform: [{ scale: 0.95 }],
    opacity: 0.85,
  },
  searchFieldWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: nrmTokens.radius.pill,
    paddingHorizontal: nrmTokens.space.md,
    minHeight: nrmTokens.layout.touchMin,
    marginBottom: nrmTokens.space.md,
  },
  searchFieldIcon: {
    marginRight: nrmTokens.space.xs,
  },
  searchInput: {
    flex: 1,
    fontSize: nrmTokens.font.body,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
  },
  hint: {
    fontSize: nrmTokens.font.caption,
    lineHeight: 20,
    marginBottom: nrmTokens.space.md,
  },
  listArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  listColumn: {
    flex: 1,
    minWidth: 0,
  },
  listFlex: {
    flex: 1,
  },
  listContent: {
    paddingBottom: nrmTokens.space.xxl,
    flexGrow: 1,
  },
  sectionHeader: {
    paddingHorizontal: nrmTokens.space.xs,
    paddingVertical: nrmTokens.space.xxs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.25)',
  },
  sectionHeaderLabel: {
    fontSize: nrmTokens.font.finePrint,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  loader: { marginVertical: nrmTokens.space.xl },
});
