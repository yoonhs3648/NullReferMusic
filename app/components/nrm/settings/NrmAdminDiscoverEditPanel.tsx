import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { NrmDiscoverFilterDropdown } from '@/components/nrm/discover/NrmDiscoverFilterDropdown';
import { NrmDiscoverMusicRow } from '@/components/nrm/discover/NrmDiscoverMusicRow';
import { NrmAdminMusicListEditModal } from '@/components/nrm/settings/NrmAdminMusicListEditModal';
import { NrmAdminMusicListSearchBar } from '@/components/nrm/settings/NrmAdminMusicListSearchBar';
import { nrmTokens } from '@/constants/nrmTokens';
import {
  NRM_DISCOVER_GENRE_ALL,
  NRM_DISCOVER_YEAR_OPTIONS,
} from '@/lib/nrmDiscoverFilters';
import {
  fetchMusicListGenres,
  fetchMusicListPageForAdmin,
} from '@/lib/nrmMusicListClient';
import type { NrmDiscoverYearFilter, NrmMusicListItem, NrmMusicListTextSearchField } from '@/lib/nrmMusicListTypes';
import { getNrmModalScrimColor } from '@/lib/nrmUiAppearanceColors';

type Props = {
  titleColor: string;
  bodyColor: string;
  isDark: boolean;
  onBack: () => void;
};

function MenuBackRow({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.backRow} accessibilityRole="button" accessibilityLabel="뒤로">
      <Ionicons name="chevron-back" size={22} color={nrmTokens.color.primary} />
      <Text style={styles.backText}>뒤로</Text>
    </Pressable>
  );
}

const SEARCH_DEBOUNCE_MS = 400;

export function NrmAdminDiscoverEditPanel({ titleColor, bodyColor, isDark, onBack }: Props) {
  const [yearFilter, setYearFilter] = useState<NrmDiscoverYearFilter>('all');
  const [genreFilter, setGenreFilter] = useState(NRM_DISCOVER_GENRE_ALL);
  const [genres, setGenres] = useState<string[]>([]);
  const [searchField, setSearchField] = useState<NrmMusicListTextSearchField>('artist');
  const [searchText, setSearchText] = useState('');
  const [debouncedSearchText, setDebouncedSearchText] = useState('');

  const [items, setItems] = useState<NrmMusicListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [globalBusy, setGlobalBusy] = useState(false);

  const [editItem, setEditItem] = useState<NrmMusicListItem | null>(null);
  const [addStubVisible, setAddStubVisible] = useState(false);

  const loadGenRef = useRef(0);
  const loadMoreLockRef = useRef(false);
  const hasMoreRef = useRef(true);

  const hairline = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const modalScrim = getNrmModalScrimColor(isDark);

  const genreOptions = useMemo(
    () => [
      { value: NRM_DISCOVER_GENRE_ALL, label: '전체선택' },
      ...genres.map((g) => ({ value: g, label: g })),
    ],
    [genres],
  );

  const filterKey = `${yearFilter}|${genreFilter}|${searchField}|${debouncedSearchText}`;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchText(searchText), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchText]);

  useEffect(() => {
    let cancelled = false;
    void fetchMusicListGenres().then((g) => {
      if (!cancelled) setGenres(g);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadInitial = useCallback(async (generation: number) => {
    setLoading(true);
    setLoadingMore(false);
    setError(null);
    hasMoreRef.current = true;
    const out = await fetchMusicListPageForAdmin(0, {
      yearFilter,
      genreFilter,
      textField: debouncedSearchText.trim() ? searchField : null,
      textQuery: debouncedSearchText,
    });
    if (generation !== loadGenRef.current) return;
    if (!out.ok) {
      setError(out.message);
      setItems([]);
      setLoading(false);
      hasMoreRef.current = false;
      return;
    }
    setItems(out.items);
    hasMoreRef.current = out.hasMore;
    setLoading(false);
  }, [yearFilter, genreFilter, searchField, debouncedSearchText]);

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || !hasMoreRef.current || loadMoreLockRef.current) return;
    loadMoreLockRef.current = true;
    setLoadingMore(true);
    const generation = loadGenRef.current;
    const offset = items.length;
    const out = await fetchMusicListPageForAdmin(offset, {
      yearFilter,
      genreFilter,
      textField: debouncedSearchText.trim() ? searchField : null,
      textQuery: debouncedSearchText,
    });
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
      return [...prev, ...out.items.filter((r) => !seen.has(r.id))];
    });
    hasMoreRef.current = out.hasMore;
    setLoadingMore(false);
    loadMoreLockRef.current = false;
  }, [loading, loadingMore, items.length, yearFilter, genreFilter, searchField, debouncedSearchText]);

  useEffect(() => {
    loadGenRef.current += 1;
    const generation = loadGenRef.current;
    void loadInitial(generation);
  }, [filterKey, loadInitial]);

  const handleSaved = useCallback((next: NrmMusicListItem) => {
    setItems((prev) => prev.map((r) => (r.id === next.id ? next : r)));
  }, []);

  const handleDeleted = useCallback((id: number) => {
    setItems((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const listEmpty = loading ? (
    <ActivityIndicator size="large" color={nrmTokens.color.primary} style={styles.loader} />
  ) : error ? (
    <Text style={styles.errorText}>{error}</Text>
  ) : (
    <Text style={[styles.emptyText, { color: bodyColor }]}>표시할 항목이 없습니다.</Text>
  );

  return (
    <View style={styles.root}>
      <MenuBackRow onPress={onBack} />

      <View style={styles.filtersBlock}>
        <Text style={[styles.panelTitle, { color: titleColor }]}>Discover 편집</Text>
        <View style={styles.filterRow}>
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
        <NrmAdminMusicListSearchBar
          titleColor={titleColor}
          bodyColor={bodyColor}
          isDark={isDark}
          searchField={searchField}
          onSearchFieldChange={setSearchField}
          searchText={searchText}
          onSearchTextChange={setSearchText}
        />
        {loading && items.length > 0 ? (
          <ActivityIndicator size="small" color={nrmTokens.color.primary} style={styles.filterLoader} />
        ) : null}
      </View>

      <FlatList
        style={styles.list}
        data={items}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setEditItem(item)}
            disabled={globalBusy}
            style={({ pressed }) => [
              styles.rowPress,
              { borderBottomColor: hairline },
              pressed && { opacity: 0.75 },
            ]}
            accessibilityRole="button">
            <NrmDiscoverMusicRow item={item} titleColor={titleColor} bodyColor={bodyColor} />
            <Ionicons name="chevron-forward" size={18} color={bodyColor} />
          </Pressable>
        )}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.35}
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator size="small" color={nrmTokens.color.primary} style={styles.footerLoader} />
          ) : null
        }
        ListEmptyComponent={listEmpty}
        contentContainerStyle={items.length === 0 ? styles.listContentEmpty : styles.listContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="none"
      />

      <View style={[styles.addBar, { borderTopColor: hairline }]}>
        <Pressable
          onPress={() => setAddStubVisible(true)}
          disabled={globalBusy}
          style={({ pressed }) => [
            styles.addBtn,
            pressed && { opacity: 0.9 },
            globalBusy && { opacity: 0.55 },
          ]}
          accessibilityRole="button">
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.addBtnText}>추가</Text>
        </Pressable>
      </View>

      <Modal
        visible={addStubVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAddStubVisible(false)}>
        <Pressable
          style={[styles.stubScrim, { backgroundColor: modalScrim }]}
          onPress={() => setAddStubVisible(false)}>
          <Pressable
            style={[styles.stubSheet, { backgroundColor: isDark ? nrmTokens.color.surfaceTile1 : nrmTokens.color.canvas, borderColor: hairline }]}
            onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.stubTitle, { color: titleColor }]}>기능 개발중</Text>
            <Text style={[styles.stubBody, { color: bodyColor }]}>
              음악 추가 기능은 준비 중입니다.
            </Text>
            <Pressable
              onPress={() => setAddStubVisible(false)}
              style={({ pressed }) => [styles.stubOkBtn, pressed && { opacity: 0.9 }]}>
              <Text style={styles.stubOkText}>확인</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <NrmAdminMusicListEditModal
        visible={editItem !== null}
        item={editItem}
        genres={genres}
        titleColor={titleColor}
        bodyColor={bodyColor}
        isDark={isDark}
        busy={globalBusy}
        onBusyChange={setGlobalBusy}
        onClose={() => setEditItem(null)}
        onSaved={handleSaved}
        onDeleted={handleDeleted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginBottom: nrmTokens.space.sm,
  },
  backText: {
    fontSize: nrmTokens.font.body,
    color: nrmTokens.color.primary,
    fontWeight: '500',
  },
  panelTitle: {
    fontSize: nrmTokens.font.body,
    fontWeight: '700',
    marginBottom: nrmTokens.space.sm,
  },
  filtersBlock: {
    paddingBottom: nrmTokens.space.xs,
  },
  filterRow: {
    flexDirection: 'row',
    gap: nrmTokens.space.sm,
    marginBottom: nrmTokens.space.sm,
  },
  filterLoader: {
    marginBottom: nrmTokens.space.xs,
  },
  list: { flex: 1 },
  listContent: {
    paddingBottom: nrmTokens.space.md,
  },
  listContentEmpty: {
    flexGrow: 1,
    paddingBottom: nrmTokens.space.md,
  },
  rowPress: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingRight: nrmTokens.space.xs,
  },
  loader: { marginTop: nrmTokens.space.xl },
  footerLoader: { marginVertical: nrmTokens.space.md },
  emptyText: {
    textAlign: 'center',
    marginTop: nrmTokens.space.xl,
    fontSize: nrmTokens.font.body,
  },
  errorText: {
    color: '#c0392b',
    fontSize: nrmTokens.font.caption,
    marginTop: nrmTokens.space.xl,
    textAlign: 'center',
  },
  addBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: nrmTokens.space.sm,
    paddingBottom: nrmTokens.space.xs,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: nrmTokens.color.primary,
    borderRadius: nrmTokens.radius.md,
    paddingVertical: 12,
  },
  addBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: nrmTokens.font.body,
  },
  stubScrim: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: nrmTokens.space.lg,
  },
  stubSheet: {
    borderRadius: nrmTokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: nrmTokens.space.lg,
    gap: nrmTokens.space.sm,
  },
  stubTitle: {
    fontSize: nrmTokens.font.body,
    fontWeight: '700',
    textAlign: 'center',
  },
  stubBody: {
    fontSize: nrmTokens.font.caption,
    textAlign: 'center',
  },
  stubOkBtn: {
    marginTop: nrmTokens.space.sm,
    backgroundColor: nrmTokens.color.primary,
    borderRadius: nrmTokens.radius.md,
    paddingVertical: 11,
    alignItems: 'center',
  },
  stubOkText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: nrmTokens.font.body,
  },
});
