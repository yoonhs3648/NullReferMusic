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
} from 'react-native';

import { NrmChartTrackArt } from '@/components/nrm/charts/NrmChartTrackArt';
import { nrmChartTrackListStyles } from '@/components/nrm/charts/nrmChartTrackListStyles';
import { NrmMetadataEditModal } from '@/components/nrm/NrmMetadataEditModal';
import { NrmTrackListSectionIndex } from '@/components/nrm/NrmTrackListSectionIndex';
import { nrmTokens } from '@/constants/nrmTokens';
import type { NrmDownloadTrackItem } from '@/lib/nrmDownloadTrackTypes';
import { detectLrcUiModeFromText, lyricsUiModeToMetadataField } from '@/lib/nrmLrcUiMode';
import type { NrmAudioFileMetadata } from '@/lib/nrmDownloadAudioMetadata';
import { listDownloadAudioTracks } from '@/lib/nrmListDownloadTracks';
import { readAudioFileMetadata } from '@/lib/nrmReadAudioMetadata';
import { resolveEditableArtistTitle } from '@/lib/nrmAudioMetadataTitle';
import {
  buildTrackListSections,
  filterTracksByQuery,
  resolveSectionIndexForIndexLabel,
  sortTracksForList,
  type TrackListIndexLabel,
  type TrackListSection,
} from '@/lib/nrmTrackListIndex';
import { applyTrackMetadataUpdate } from '@/lib/nrmTrackMetadataUpdate';
import { hasAnyWhisperModelOnDevice } from '@/lib/nrmWhisperModelNative';
import type { NrmWhisperLyricsUiMode } from '@/lib/nrmWhisperLyrics';
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

export function NrmTrackMetadataSettingsHome({
  isDark,
  titleColor,
  bodyColor,
  onBack,
}: Props) {
  const row = nrmChartTrackListStyles;
  const sectionListRef = useRef<SectionList<NrmDownloadTrackItem, TrackListSection>>(null);
  const searchInputRef = useRef<TextInput>(null);

  const [loading, setLoading] = useState(true);
  const [tracks, setTracks] = useState<NrmDownloadTrackItem[]>([]);
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
  const [initialLyricsMode, setInitialLyricsMode] = useState<NrmWhisperLyricsUiMode>('unset');
  const [saving, setSaving] = useState(false);

  const borderColor = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const searchBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
  const sectionHeaderBg = isDark ? nrmTokens.color.surfaceTile2 : nrmTokens.color.surfacePearl;
  const indexMuted = isDark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.28)';

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

  const searchFlatData = useMemo(
    () => sortTracksForList(filteredTracks),
    [filteredTracks],
  );

  const showIndexBar = !searchOpen && !loading && sections.length > 0;

  const openSearch = useCallback(() => setSearchOpen(true), []);
  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery('');
  }, []);

  const jumpToIndex = useCallback(
    (label: TrackListIndexLabel) => {
      const sectionIndex = resolveSectionIndexForIndexLabel(label, sections);
      if (sectionIndex < 0) return;
      sectionListRef.current?.scrollToLocation({
        sectionIndex,
        itemIndex: 0,
        animated: true,
        viewOffset: 0,
      });
    },
    [sections],
  );

  const openEditor = useCallback(async (track: NrmDownloadTrackItem) => {
    setEditTrack(track);
    setModalBusy(true);
    setInitialArtist('');
    setInitialTitle('');
    setInitialFields(EMPTY_METADATA_FIELDS);
    setInitialLyricsMode('unset');
    try {
      const meta = await readAudioFileMetadata(track.audioUri, track.fileName);
      let lyricsMode: NrmWhisperLyricsUiMode = 'unset';
      if (track.lrcUri) {
        try {
          const lrcText = await FileSystem.readAsStringAsync(track.lrcUri, {
            encoding: EncodingType.UTF8,
          });
          lyricsMode = detectLrcUiModeFromText(lrcText);
        } catch {
          lyricsMode = 'configured';
        }
      }
      setInitialLyricsMode(lyricsMode);
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
        lyrics: lyricsUiModeToMetadataField(lyricsMode),
      });
    } finally {
      setModalBusy(false);
    }
  }, []);

  const onSave = useCallback(
    async (_videoId: string, fileName: string, metadata: NrmAudioFileMetadata) => {
      if (!editTrack || saving) return;
      const newLyricsRaw = metadata.lyrics;
      let newLyricsMode: NrmWhisperLyricsUiMode = 'unset';
      if (newLyricsRaw) {
        const { parseWhisperLyricsMode } = await import('@/lib/nrmWhisperLyrics');
        newLyricsMode = parseWhisperLyricsMode(newLyricsRaw) ?? 'unset';
      }
      let effectiveNewLyricsMode = newLyricsMode;
      const lyricsEditable =
        editTrack.extension === '.mp3' &&
        (isStandaloneAndroid() || (Platform.OS === 'web' && usesPcBackendInDev()));
      if (lyricsEditable) {
        const whisperReady = await hasAnyWhisperModelOnDevice();
        if (!whisperReady && newLyricsMode === 'unset' && initialLyricsMode !== 'unset') {
          effectiveNewLyricsMode = initialLyricsMode;
        }
      } else if (initialLyricsMode !== 'unset') {
        effectiveNewLyricsMode = initialLyricsMode;
      }
      setSaving(true);
      try {
        await applyTrackMetadataUpdate({
          track: editTrack,
          newFileName: fileName,
          metadata,
          initialLyricsMode,
          newLyricsMode: effectiveNewLyricsMode,
        });
        setEditTrack(null);
        await reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : '저장에 실패했습니다.');
      } finally {
        setSaving(false);
      }
    },
    [editTrack, initialLyricsMode, reload, saving],
  );

  const renderTrackRow = useCallback(
    (item: NrmDownloadTrackItem) => (
      <Pressable
        onPress={() => void openEditor(item)}
        style={({ pressed }) => [row.trackRow, pressed && row.trackRowPressed]}
        accessibilityRole="button">
        <NrmChartTrackArt imageUrl="" />
        <View style={row.trackMeta}>
          <Text style={[row.trackTitle, { color: titleColor }]} numberOfLines={1}>
            {item.displayLabel}
          </Text>
          <Text style={[row.trackSub, { color: bodyColor }]} numberOfLines={1}>
            {item.lrcUri ? '가사 LRC' : '가사 없음'}
            {' · '}
            {item.extension.replace('.', '').toUpperCase()}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={bodyColor} />
      </Pressable>
    ),
    [bodyColor, openEditor, row, titleColor],
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
      <Pressable onPress={onBack} style={styles.backRow} accessibilityRole="button">
        <Ionicons name="chevron-back" size={22} color={nrmTokens.color.primary} />
        <Text style={[styles.backLabel, { color: nrmTokens.color.primary }]}>뒤로</Text>
      </Pressable>

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
        <Text style={[styles.hint, { color: bodyColor }]}>
          다운로드 경로의 오디오를 탭하면 메타데이터를 편집할 수 있습니다.
        </Text>
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
            contentContainerStyle={[
              styles.listContent,
              showIndexBar && styles.listContentWithIndex,
            ]}
            showsVerticalScrollIndicator={false}
            stickySectionHeadersEnabled
            onScrollToIndexFailed={() => {
              sectionListRef.current?.scrollToLocation({
                sectionIndex: 0,
                itemIndex: 0,
                animated: true,
              });
            }}
          />
        )}

        {showIndexBar ? (
          <NrmTrackListSectionIndex onSelect={jumpToIndex} mutedColor={indexMuted} />
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
        busy={modalBusy || saving}
        onClose={() => {
          if (!saving) setEditTrack(null);
        }}
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
  listContentWithIndex: {
    paddingRight: 22,
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
