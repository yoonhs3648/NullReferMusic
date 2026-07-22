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
  getCachedDownloadSections,
  getCachedDownloadTracks,
  setCachedDownloadTracks,
} from '@/lib/nrmTrackListCache';
import { revealInChunksAsync, type RevealController } from '@/lib/nrmProgressiveReveal';
import {
  buildTrackListSections,
  filterTracksByQuery,
  sortTracksForList,
  type TrackListIndexLabel,
  type TrackListSection,
} from '@/lib/nrmTrackListIndex';
import {
  buildTrackListFlatItemLayout,
  computeSectionStartOffsets,
  findSectionIndexForJumpLabel,
  scrollSectionListToSection,
  TRACK_LIST_ROW_HEIGHT,
  TRACK_LIST_SECTION_HEADER_HEIGHT,
} from '@/lib/nrmTrackListSectionScroll';
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
  /** false면 탭이 숨겨진 상태(keep-alive). 다시 true가 되면 조용히 목록만 재검증한다. */
  isActive?: boolean;
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

/** 캐시-현재 목록 비교용 — audioUri 시퀀스가 같으면 실질적 변경 없음으로 간주 */
function tracksEqualByAudioUri(
  a: NrmDownloadTrackItem[],
  b: NrmDownloadTrackItem[],
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i]!.audioUri !== b[i]!.audioUri) return false;
  }
  return true;
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
      style={({ pressed }) => [
        row.trackRow,
        styles.trackRowFixed,
        pressed && row.trackRowPressed,
      ]}
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
  isActive = true,
}: Props) {
  const row = nrmChartTrackListStyles;
  const sectionListRef = useRef<SectionList<NrmDownloadTrackItem, TrackListSection>>(null);
  const searchInputRef = useRef<TextInput>(null);

  // 세션 캐시가 있으면 재진입 시 스피너 없이 즉시 이전 목록을 보여준다.
  const [tracks, setTracks] = useState<NrmDownloadTrackItem[]>(
    () => getCachedDownloadTracks() ?? [],
  );
  const tracksRef = useRef<NrmDownloadTrackItem[]>(tracks);
  const [loading, setLoading] = useState(() => tracks.length === 0);
  const [listGeneration, setListGeneration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const isActiveRef = useRef(isActive);
  const initialReloadDoneRef = useRef(false);
  const revealControllerRef = useRef<RevealController | null>(null);
  /** reload() 중첩 호출 시 오래된 호출의 결과가 최신 호출을 덮어쓰지 않도록 하는 세대 토큰 */
  const reloadGenerationRef = useRef(0);

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

  /**
   * @param options.silent true면 로딩 스피너를 띄우지 않고 백그라운드에서 조회한다.
   *   (세션 캐시로 이미 화면에 목록이 표시된 상태에서 최신 여부만 조용히 확인할 때 사용)
   *   내용이 실제로 바뀌지 않았으면 상태를 갱신하지 않아 커버 캐시 무효화·리렌더를 건너뛴다.
   *
   * silent가 아닌 콜드 스타트(캐시 없음) 로딩은 전체 목록을 기다렸다가 한 번에 그리지 않고,
   * `revealInChunksAsync`로 앞에서부터 조금씩 화면에 흘려보낸다. 네이티브 폴더 스캔
   * 자체(readDirectoryAsync/SAF)는 단일 호출이라 쪼갤 수 없지만, 그 결과를 받은 뒤의
   * 정렬·섹션 구성·리스트 마운트 비용은 청크로 나눠 첫 화면이 훨씬 빨리 뜨게 한다.
   */
  const reload = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    const myGeneration = ++reloadGenerationRef.current;
    const isCurrent = () => myGeneration === reloadGenerationRef.current;
    revealControllerRef.current?.cancel();
    revealControllerRef.current = null;
    if (!silent) setLoading(true);
    setError(null);
    try {
      if (Platform.OS === 'web') {
        if (!isCurrent()) return;
        tracksRef.current = [];
        setTracks([]);
        setCachedDownloadTracks([], []);
        setError('트랙 메타데이터 설정은 Android·iOS 앱에서만 사용할 수 있습니다.');
        return;
      }
      const items = await listDownloadAudioTracks();
      if (!isCurrent()) return; // 더 최신 reload()가 이미 시작됨 — 이 결과는 폐기

      if (silent) {
        // 이미 화면에 목록이 보이는 상태 — 조용히 비교 후 실제로 바뀐 경우에만 갱신
        if (!tracksEqualByAudioUri(tracksRef.current, items)) {
          tracksRef.current = items;
          setTracks(items);
          setListGeneration((g) => g + 1);
          setCachedDownloadTracks(items, null);
        } else {
          setCachedDownloadTracks(items);
        }
      } else {
        // 콜드 스타트 — 전체를 기다리지 않고 앞에서부터 조금씩 화면에 흘려보낸다
        const { controller, done } = revealInChunksAsync(items, (visibleSoFar) => {
          if (!isCurrent()) return;
          tracksRef.current = visibleSoFar;
          setTracks(visibleSoFar);
          // 첫 청크가 뜨는 즉시 전체화면 "초기화 중" 안내를 내린다
          setLoading(false);
        });
        revealControllerRef.current = controller;
        await done;
        if (!isCurrent()) return;
        revealControllerRef.current = null;
        setListGeneration((g) => g + 1);
        setCachedDownloadTracks(items, null);
      }

      if (isCurrent() && items.length === 0) {
        setError('다운로드 경로에 오디오 파일이 없습니다. 다운로드 설정에서 경로를 확인하세요.');
      }
    } catch (e) {
      if (!isCurrent()) return;
      setError(e instanceof Error ? e.message : '목록을 불러오지 못했습니다.');
      if (!silent) {
        tracksRef.current = [];
        setTracks([]);
        setCachedDownloadTracks([], []);
      }
    } finally {
      if (isCurrent()) {
        if (!silent) setLoading(false);
        initialReloadDoneRef.current = true;
      }
    }
  }, []);

  useEffect(() => {
    // 캐시로 이미 목록을 보여주고 있으면 조용히 최신화만 확인, 없으면 최초 로딩
    void reload(tracksRef.current.length > 0 ? { silent: true } : undefined);
  }, [reload]);

  useEffect(() => {
    return () => {
      revealControllerRef.current?.cancel();
    };
  }, []);

  // keep-alive: 탭이 다시 활성화되면 마운트 없이 조용히 목록만 재검증
  useEffect(() => {
    const wasActive = isActiveRef.current;
    isActiveRef.current = isActive;
    if (!isActive || wasActive || !initialReloadDoneRef.current) return;
    void reload({ silent: true });
  }, [isActive, reload]);

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

  const sections = useMemo(() => {
    // 검색이 아닐 때 세션 캐시와 트랙이 일치하면 섹션 재구성(정렬·버킷)을 건너뛴다
    if (!searchQuery.trim()) {
      const cachedTracks = getCachedDownloadTracks();
      const cachedSections = getCachedDownloadSections();
      if (
        cachedTracks &&
        cachedSections &&
        tracksEqualByAudioUri(cachedTracks, tracks)
      ) {
        return cachedSections;
      }
    }
    return buildTrackListSections(filteredTracks);
  }, [filteredTracks, searchQuery, tracks]);

  // 검색이 아닌 전체 목록 섹션을 세션 캐시에 보존 → 다음 진입/리마운트 시 즉시 사용
  useEffect(() => {
    if (searchQuery.trim() || tracks.length === 0) return;
    setCachedDownloadTracks(tracks, sections);
  }, [searchQuery, sections, tracks]);

  const sectionStartOffsets = useMemo(
    () => computeSectionStartOffsets(sections),
    [sections],
  );

  const flatItemLayout = useMemo(
    () => buildTrackListFlatItemLayout(sections),
    [sections],
  );

  const getSectionListItemLayout = useCallback(
    (_data: TrackListSection[] | null, index: number) =>
      flatItemLayout[index] ?? flatItemLayout[flatItemLayout.length - 1] ?? {
        length: 0,
        offset: 0,
        index: 0,
      },
    [flatItemLayout],
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

  /**
   * 퀵 네비게이션 — sections 직접 탐색 + 사전 계산 Y 오프셋 scrollTo.
   * scrollToLocation/onScrollToIndexFailed 는 사용하지 않는다(실패 시 최상단 점프 버그).
   */
  const scrollToIndexLabel = useCallback(
    (label: TrackListIndexLabel, animated: boolean) => {
      if (sections.length === 0) return;
      const targetSectionIndex = findSectionIndexForJumpLabel(sections, label);
      scrollSectionListToSection(
        sectionListRef,
        sectionStartOffsets,
        targetSectionIndex,
        animated,
      );
    },
    [sectionStartOffsets, sections],
  );

  const onSelectIndexLabel = useCallback(
    (label: TrackListIndexLabel, animated = true) => {
      scrollToIndexLabel(label, animated);
    },
    [scrollToIndexLabel],
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
      <View
        style={[
          styles.sectionHeader,
          styles.sectionHeaderFixed,
          { backgroundColor: sectionHeaderBg },
        ]}>
        <Text style={[styles.sectionHeaderLabel, { color: bodyColor }]}>
          {section.title}
        </Text>
      </View>
    ),
    [bodyColor, sectionHeaderBg],
  );

  const listEmpty = error ? (
    <Text style={[styles.hint, { color: bodyColor }]}>{error}</Text>
  ) : searchOpen && searchQuery.trim() ? (
    <Text style={[styles.hint, { color: bodyColor }]}>검색 결과가 없습니다.</Text>
  ) : null;

  // 캐시가 없어 처음 목록을 가져오는 중 — 탭 전체 정중앙에 초기화 안내
  if (loading && tracks.length === 0) {
    return (
      <View style={styles.wrap}>
        <View style={styles.initCenter} accessibilityLabel="초기화 중입니다">
          <ActivityIndicator size="large" color={nrmTokens.color.primary} />
          <Text style={[styles.initLabel, { color: bodyColor }]}>초기화 중입니다...</Text>
        </View>
      </View>
    );
  }

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
              getItemLayout={getSectionListItemLayout}
              viewabilityConfig={viewabilityConfig}
              onViewableItemsChanged={onSectionViewableItemsChanged}
              initialNumToRender={12}
              maxToRenderPerBatch={8}
              windowSize={7}
              updateCellsBatchingPeriod={50}
              removeClippedSubviews={Platform.OS === 'android'}
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
  sectionHeaderFixed: {
    height: TRACK_LIST_SECTION_HEADER_HEIGHT,
    justifyContent: 'center',
  },
  /**
   * row.trackRow(nrmChartTrackListStyles)에 marginBottom: xxs 가 이미 있다.
   * 여기서 height를 TRACK_LIST_ROW_HEIGHT로 그대로 주면 실제 행 점유 높이가
   * (height + marginBottom) = TRACK_LIST_ROW_HEIGHT + xxs 가 되어, 퀵 네비게이션
   * 오프셋 계산(nrmTrackListSectionScroll.ts, 행당 TRACK_LIST_ROW_HEIGHT 가정)과
   * 어긋나 목록이 아래로 누적 드리프트된다(뒤쪽 문자로 갈수록 더 크게 밀림).
   * marginBottom을 높이에서 미리 빼서 실제 점유 높이를 TRACK_LIST_ROW_HEIGHT로 맞춘다.
   */
  trackRowFixed: {
    height: TRACK_LIST_ROW_HEIGHT - nrmTokens.space.xxs,
  },
  sectionHeaderLabel: {
    fontSize: nrmTokens.font.finePrint,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  loader: { marginVertical: nrmTokens.space.xl },
  initCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: nrmTokens.space.md,
    paddingHorizontal: nrmTokens.space.lg,
  },
  initLabel: {
    fontSize: nrmTokens.font.body,
    fontWeight: '500',
    textAlign: 'center',
  },
});
