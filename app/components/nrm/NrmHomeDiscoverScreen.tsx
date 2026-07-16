import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { NrmDiscoverAiLabScreen } from '@/components/nrm/discover/NrmDiscoverAiLabScreen';
import { NrmDiscoverAlbumSearchLayer } from '@/components/nrm/discover/NrmDiscoverAlbumSearchLayer';
import { NrmDiscoverFilterDropdown } from '@/components/nrm/discover/NrmDiscoverFilterDropdown';
import { NrmDiscoverMusicRow } from '@/components/nrm/discover/NrmDiscoverMusicRow';
import { NrmScrollToTopFab } from '@/components/nrm/NrmScrollToTopFab';
import type { MelonYoutubeNavigateParams } from '@/components/nrm/search/NrmMelonSearchRouter';
import { nrmTokens } from '@/constants/nrmTokens';
import {
  buildDiscoverGenreOptions,
  isDiscoverGenreDisabledTemporarily,
  NRM_DISCOVER_GENRE_DEFAULT,
  NRM_DISCOVER_YEAR_DEFAULT,
  NRM_DISCOVER_YEAR_OPTIONS,
} from '@/lib/nrmDiscoverFilters';
import { fetchMusicListGenres, fetchMusicListPage } from '@/lib/nrmMusicListClient';
import type { NrmDiscoverYearFilter, NrmMusicListItem } from '@/lib/nrmMusicListTypes';
import { NRM_SEARCH_SCROLL_TOP_THRESHOLD } from '@/lib/nrmSearchPageSize';

type Props = {
  isDark: boolean;
  paddingHorizontal: number;
  onNavigateYoutube: (params: MelonYoutubeNavigateParams) => void;
};

type DiscoverSubView = 'ai-lab' | 'list' | 'track-search';

export function NrmHomeDiscoverScreen({
  isDark,
  paddingHorizontal,
  onNavigateYoutube,
}: Props) {
  const titleColor = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
  const bodyColor = isDark ? nrmTokens.color.textMuted : nrmTokens.color.inkMuted80;

  const [subView, setSubView] = useState<DiscoverSubView>('ai-lab');
  const [trackSearchQuery, setTrackSearchQuery] = useState('');
  const [yearFilter, setYearFilter] = useState<NrmDiscoverYearFilter>(NRM_DISCOVER_YEAR_DEFAULT);
  const [genreFilter, setGenreFilter] = useState(NRM_DISCOVER_GENRE_DEFAULT);
  const [genres, setGenres] = useState<string[]>([]);
  const [items, setItems] = useState<NrmMusicListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  const listRef = useRef<FlatList<NrmMusicListItem>>(null);
  const loadGenRef = useRef(0);
  const loadMoreLockRef = useRef(false);
  const hasMoreRef = useRef(true);

  const genreOptions = useMemo(() => buildDiscoverGenreOptions(genres), [genres]);

  useEffect(() => {
    if (isDiscoverGenreDisabledTemporarily(genreFilter)) {
      setGenreFilter(NRM_DISCOVER_GENRE_DEFAULT);
    }
  }, [genreFilter]);

  const filterKey = `${yearFilter}|${genreFilter}`;

  const loadInitial = useCallback(async (generation: number) => {
    setLoading(true);
    setLoadingMore(false);
    setError(null);
    setItems([]);
    hasMoreRef.current = true;
    const out = await fetchMusicListPage(0, yearFilter, genreFilter);
    if (generation !== loadGenRef.current) return;
    if (!out.ok) {
      setError(out.message);
      setLoading(false);
      hasMoreRef.current = false;
      return;
    }
    setItems(out.items);
    hasMoreRef.current = out.hasMore;
    setLoading(false);
  }, [yearFilter, genreFilter]);

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || !hasMoreRef.current || loadMoreLockRef.current) return;
    loadMoreLockRef.current = true;
    setLoadingMore(true);
    const generation = loadGenRef.current;
    const offset = items.length;
    const out = await fetchMusicListPage(offset, yearFilter, genreFilter);
    if (generation !== loadGenRef.current) {
      loadMoreLockRef.current = false;
      return;
    }
    if (!out.ok) {
      setLoadingMore(false);
      loadMoreLockRef.current = false;
      return;
    }
    setItems((prev) => {
      const seen = new Set(prev.map((r) => r.id));
      const next = [...prev, ...out.items.filter((r) => !seen.has(r.id))];
      return next;
    });
    hasMoreRef.current = out.hasMore;
    setLoadingMore(false);
    loadMoreLockRef.current = false;
  }, [genreFilter, items.length, loading, loadingMore, yearFilter]);

  useEffect(() => {
    void fetchMusicListGenres()
      .then(setGenres)
      .catch(() => setGenres([]));
  }, []);

  useEffect(() => {
    const generation = ++loadGenRef.current;
    void loadInitial(generation);
  }, [filterKey, loadInitial]);

  const openTrackSearch = useCallback((title: string) => {
    const q = title.trim();
    if (!q) return;
    setTrackSearchQuery(q);
    setSubView('track-search');
  }, []);

  const closeTrackSearch = useCallback(() => {
    setSubView('list');
  }, []);

  const closeDiscoverList = useCallback(() => {
    setSubView('ai-lab');
  }, []);

  useEffect(() => {
    if (subView !== 'list') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeDiscoverList();
      return true;
    });
    return () => sub.remove();
  }, [closeDiscoverList, subView]);

  const keyExtractor = useCallback((item: NrmMusicListItem) => String(item.id), []);

  const renderItem = useCallback(
    ({ item }: { item: NrmMusicListItem }) => (
      <Pressable
        onPress={() => openTrackSearch(item.title)}
        style={({ pressed }) => [styles.rowPress, pressed && styles.rowPressPressed]}
        accessibilityRole="button"
        accessibilityLabel={`${item.title} 트랙 검색`}>
        <NrmDiscoverMusicRow item={item} titleColor={titleColor} bodyColor={bodyColor} />
      </Pressable>
    ),
    [bodyColor, openTrackSearch, titleColor],
  );

  const listHeader = (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <Pressable
          onPress={closeDiscoverList}
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel="AI Lab으로 돌아가기">
          <Ionicons name="chevron-back" size={24} color={nrmTokens.color.primary} />
        </Pressable>
        <View style={styles.titleBlock}>
          <Ionicons
            name="compass"
            size={28}
            color={isDark ? nrmTokens.color.primaryOnDark : nrmTokens.color.primary}
          />
          <Text style={[styles.title, { color: titleColor }]}>Discover</Text>
        </View>
        <View style={styles.backSpacer} />
      </View>

      <View style={styles.filters}>
        <NrmDiscoverFilterDropdown
          label="연도"
          value={yearFilter}
          options={NRM_DISCOVER_YEAR_OPTIONS}
          onChange={setYearFilter}
          isDark={isDark}
          titleColor={titleColor}
          bodyColor={bodyColor}
        />
        <NrmDiscoverFilterDropdown
          label="장르"
          value={genreFilter}
          options={genreOptions}
          onChange={setGenreFilter}
          isDark={isDark}
          titleColor={titleColor}
          bodyColor={bodyColor}
        />
      </View>

      {error ? <Text style={[styles.error, { color: bodyColor }]}>{error}</Text> : null}
      {loading ? (
        <ActivityIndicator style={styles.loader} color={nrmTokens.color.primary} />
      ) : null}
      {!loading && !error && items.length === 0 ? (
        <Text style={[styles.empty, { color: bodyColor }]}>표시할 곡이 없습니다.</Text>
      ) : null}
    </View>
  );

  const listFooter =
    loadingMore && !error ? (
      <ActivityIndicator style={styles.footerLoader} color={nrmTokens.color.primary} />
    ) : null;

  return (
    <View style={styles.root}>
      <View
        style={[styles.aiLabLayer, subView !== 'ai-lab' && styles.aiLabLayerHidden]}
        pointerEvents={subView === 'ai-lab' ? 'auto' : 'none'}>
        <NrmDiscoverAiLabScreen isDark={isDark} />
      </View>

      {subView === 'list' || subView === 'track-search' ? (
        <View
          style={[
            styles.overlayLayer,
            { backgroundColor: isDark ? nrmTokens.color.surfaceTile1 : nrmTokens.color.canvas },
            subView === 'track-search' && styles.listLayerHidden,
          ]}
          pointerEvents={subView === 'list' ? 'auto' : 'none'}>
          <FlatList
            ref={listRef}
            data={loading || error ? [] : items}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            ListHeaderComponent={listHeader}
            ListFooterComponent={listFooter}
            onEndReached={() => void loadMore()}
            onEndReachedThreshold={0.35}
            onScroll={(e) => {
              setShowScrollTop(e.nativeEvent.contentOffset.y > NRM_SEARCH_SCROLL_TOP_THRESHOLD);
            }}
            scrollEventThrottle={200}
            keyboardShouldPersistTaps="handled"
            style={styles.list}
            contentContainerStyle={styles.listContent}
            initialNumToRender={20}
            maxToRenderPerBatch={15}
            windowSize={10}
          />
          <NrmScrollToTopFab
            visible={showScrollTop && subView === 'list'}
            onPress={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}
            isDark={isDark}
          />
        </View>
      ) : null}

      {subView === 'track-search' ? (
        <View
          style={[
            styles.overlayLayer,
            { backgroundColor: isDark ? nrmTokens.color.surfaceTile1 : nrmTokens.color.canvas },
          ]}>
          <NrmDiscoverAlbumSearchLayer
            isDark={isDark}
            paddingHorizontal={paddingHorizontal}
            query={trackSearchQuery}
            onBack={closeTrackSearch}
            onNavigateYoutube={onNavigateYoutube}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  aiLabLayer: { flex: 1 },
  aiLabLayerHidden: {
    opacity: 0,
  },
  listLayerHidden: {
    opacity: 0,
  },
  overlayLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
  },
  list: { flex: 1 },
  listContent: {
    paddingBottom: nrmTokens.space.xxl,
    flexGrow: 1,
  },
  header: {
    paddingTop: nrmTokens.space.sm,
    paddingBottom: nrmTokens.space.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: nrmTokens.space.md,
    gap: nrmTokens.space.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnPressed: { opacity: 0.72 },
  backSpacer: {
    width: 40,
  },
  titleBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.sm,
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: nrmTokens.font.lead,
    fontWeight: '700',
  },
  filters: {
    flexDirection: 'row',
    gap: nrmTokens.space.sm,
    marginBottom: nrmTokens.space.sm,
  },
  rowPress: {
    borderRadius: nrmTokens.radius.sm,
  },
  rowPressPressed: { opacity: 0.82 },
  loader: { marginVertical: nrmTokens.space.lg },
  footerLoader: { marginVertical: nrmTokens.space.md },
  error: {
    marginBottom: nrmTokens.space.sm,
    fontSize: nrmTokens.font.caption,
    lineHeight: 20,
  },
  empty: {
    textAlign: 'center',
    fontSize: nrmTokens.font.caption,
    marginTop: nrmTokens.space.lg,
  },
});
