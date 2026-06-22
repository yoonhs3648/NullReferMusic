import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { nrmTokens } from '@/constants/nrmTokens';
import type { NrmDownloadTrackItem } from '@/lib/nrmDownloadTrackTypes';
import {
  isEmbeddedSyncLyricsText,
  lyricsUiModeToMetadataField,
  resolveStoredLyricsModeFromFlags,
} from '@/lib/nrmLrcUiMode';
import {
  fetchMelonPlainLyricsFromWebsite,
  isMelonTrackWebsite,
  normalizeMelonTrackWebsite,
  type NrmLyricsUiMode,
} from '@/lib/nrmMelonLyrics';
import type { NrmAudioFileMetadata } from '@/lib/nrmDownloadAudioMetadata';
import { listDownloadAudioTracks } from '@/lib/nrmListDownloadTracks';
import { readAudioFileMetadata } from '@/lib/nrmReadAudioMetadata';
import { resolveEditableArtistTitle } from '@/lib/nrmAudioMetadataTitle';
import {
  buildTrackListSections,
  filterTracksByQuery,
  sortTracksForList,
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
import * as FileSystem from 'expo-file-system/src/legacy/FileSystem';
import { EncodingType } from 'expo-file-system/src/legacy/FileSystem.types';

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

const EMPTY_METADATA_FIELDS: Omit<NrmAudioFileMetadata, 'artist' | 'title'> = {
  album: '',
  genre: '',
  releaseDate: '',
  coverUrl: '',
};

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
function TrackRowCoverArt({
  coverKey,
  coverUrl,
}: {
  coverKey: string;
  coverUrl: string;
}) {
  return (
    <NrmChartTrackArt imageUrl={coverUrl} cacheKey={coverKey} />
  );
}

export function NrmTrackMetadataSettingsHome({
  isDark,
  titleColor,
  bodyColor,
  onBack,
  hideBack = false,
}: Props) {
  const row = nrmChartTrackListStyles;
  const sectionListRef = useRef<SectionList<NrmDownloadTrackItem, TrackListSection>>(null);
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
  >(EMPTY_METADATA_FIELDS);
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

  /** 목록 로드 직후 상단 일부만 선로드 (전체 일괄 로드 방지) */
  useEffect(() => {
    if (loading || searchOpen || tracks.length === 0) return;
    prefetchInitialTrackCovers(tracks, requestCovers);
  }, [loading, listGeneration, requestCovers, searchOpen, tracks]);

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

  const openEditor = useCallback(async (track: NrmDownloadTrackItem) => {
    setEditTrack(track);
    setModalBusy(true);
    setInitialArtist('');
    setInitialTitle('');
    setInitialFields(EMPTY_METADATA_FIELDS);
    setInitialLyricsMode('unset');
    setInitialMelonLyricsAvailable(false);
    setInitialHasEmbeddedSyncLyrics(false);
    try {
      const meta = await readAudioFileMetadata(track.audioUri, track.fileName);
      const normalizedWebsite = normalizeMelonTrackWebsite(meta.website);
      let lrcText = '';
      if (track.lrcUri) {
        try {
          lrcText = await FileSystem.readAsStringAsync(track.lrcUri, {
            encoding: EncodingType.UTF8,
          });
        } catch {
          /* 사이드카 읽기 실패 시 내장 가사로 복원 */
        }
      }

      const embeddedSync = isEmbeddedSyncLyricsText(meta.lyrics) ? (meta.lyrics ?? '').trim() : '';

      let melonLyricsAvailable = false;
      if (isMelonTrackWebsite(normalizedWebsite)) {
        const plain = await fetchMelonPlainLyricsFromWebsite(normalizedWebsite);
        melonLyricsAvailable = plain.trim().length > 0;
      }

      const lyricsMode = resolveStoredLyricsModeFromFlags({
        hasSidecarLrc: !!track.lrcUri && lrcText.trim().length > 0,
        sidecarLrcText: lrcText,
        embeddedSyncLyrics: embeddedSync,
        embeddedLyricsMode: meta.nrmLyricsMode,
        melonTrackUrl: isMelonTrackWebsite(normalizedWebsite) ? normalizedWebsite : undefined,
      });

      setInitialLyricsMode(lyricsMode);
      setInitialMelonLyricsAvailable(melonLyricsAvailable);
      setInitialHasEmbeddedSyncLyrics(embeddedSync.length > 0);
      const { artist, title } = resolveEditableArtistTitle(
        meta.artist,
        meta.title,
        track.displayLabel,
      );
      setInitialArtist(artist);
      setInitialTitle(title);
      const { artist: _a, title: _t, ...rest } = meta;
      setInitialFields({
        ...rest,
        website: normalizedWebsite || rest.website,
        lyrics: lyricsUiModeToMetadataField(lyricsMode),
      });
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

          await applyTrackMetadataUpdate({
            track,
            newFileName: fileName,
            metadata,
            initialLyricsMode: lyricsModeAtOpen,
            newLyricsMode: effectiveNewLyricsMode,
            hasEmbeddedSyncLyrics: hasEmbeddedSyncAtOpen,
          });
          await reload();
        } catch (e) {
          setError(e instanceof Error ? e.message : '저장에 실패했습니다.');
        } finally {
          savingTracksRef.current.delete(trackKey);
        }
      })();
    },
    [editTrack, initialHasEmbeddedSyncLyrics, initialLyricsMode, reload],
  );

  const onDeleteTrack = useCallback(async () => {
    if (!editTrack) return;
    const track = editTrack;
    try {
      await deleteDownloadTrack(track);
      await invalidateListCoverDiskCache(trackListCoverKey(track));
      setEditTrack(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : '파일 삭제에 실패했습니다.');
    }
  }, [editTrack, reload]);

  const renderTrackRow = useCallback(
    (item: NrmDownloadTrackItem) => {
      const coverKey = trackListCoverKey(item);
      return (
      <Pressable
        onPress={() => void openEditor(item)}
        style={({ pressed }) => [row.trackRow, pressed && row.trackRowPressed]}
        accessibilityRole="button">
        <TrackRowCoverArt coverKey={coverKey} coverUrl={coverByKey[coverKey] ?? ''} />
        <View style={row.trackMeta}>
          <Text style={[row.trackTitle, { color: titleColor }]} numberOfLines={2}>
            {item.displayLabel}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={bodyColor} />
      </Pressable>
      );
    },
    [bodyColor, coverByKey, openEditor, row, titleColor],
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

      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: titleColor }]} numberOfLines={1}>
          트랙 메타데이터 설정
        </Text>
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
        {searchOpen ? (
          <FlatList
            style={styles.listFlex}
            data={searchFlatData}
            keyExtractor={(item) => item.audioUri}
            renderItem={({ item }) => renderTrackRow(item)}
            ListEmptyComponent={() => listEmpty}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            viewabilityConfig={viewabilityConfig}
            onViewableItemsChanged={onSearchViewableItemsChanged}
          />
        ) : (
          <SectionList
            ref={sectionListRef}
            style={styles.listFlex}
            sections={sections}
            keyExtractor={(item) => item.audioUri}
            renderItem={({ item }) => renderTrackRow(item)}
            renderSectionHeader={({ section }) => (
              <View style={[styles.sectionHeader, { backgroundColor: sectionHeaderBg }]}>
                <Text style={[styles.sectionHeaderLabel, { color: bodyColor }]}>
                  {section.title}
                </Text>
              </View>
            )}
            ListEmptyComponent={() => listEmpty}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            stickySectionHeadersEnabled
            viewabilityConfig={viewabilityConfig}
            onViewableItemsChanged={onSectionViewableItemsChanged}
            onScrollToIndexFailed={() => {
              sectionListRef.current?.scrollToLocation({
                sectionIndex: 0,
                itemIndex: 0,
                animated: true,
              });
            }}
          />
        )}
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
  wrap: { flex: 1 },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: nrmTokens.space.sm,
  },
  backLabel: { fontSize: nrmTokens.font.body, fontWeight: '600' },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.sm,
    marginBottom: nrmTokens.space.xs,
  },
  title: {
    flex: 1,
    fontSize: nrmTokens.font.lead,
    fontWeight: '700',
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
    position: 'relative',
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
