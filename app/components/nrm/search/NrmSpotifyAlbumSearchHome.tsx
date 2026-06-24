import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { NrmFeatureScreenLogoHeader } from '@/components/nrm/NrmFeatureScreenLogoHeader';
import { NrmScrollToTopFab } from '@/components/nrm/NrmScrollToTopFab';
import {
  formatSpotifyDuration,
  NrmSpotifyCoverImage,
  NrmSpotifySearchBar,
  NrmSpotifySectionTitle,
} from '@/components/nrm/search/NrmSpotifySearchUi';
import { nrmTokens } from '@/constants/nrmTokens';
import {
  fetchSpotifyAlbumDetail,
  searchSpotifyAlbumsPage,
} from '@/lib/nrmSpotifySearchClient';
import type {
  SpotifyAlbumDetail,
  SpotifyAlbumSearchHit,
} from '@/lib/nrmSpotifySearchTypes';
import { NrmSpotifySearchErrorView } from '@/components/nrm/search/NrmSpotifySearchErrorView';
import type { ChartErrorCode } from '@/lib/nrmChartErrors';
import { splitSpotifySearchFailure } from '@/lib/nrmSpotifySearchUi';
import { NRM_SEARCH_SCROLL_TOP_THRESHOLD } from '@/lib/nrmSearchPageSize';
import { nrmSearchEmptyQuery, nrmSearchNoResults } from '@/lib/nrmSearchStrings';

type Props = {
  isDark: boolean;
  paddingHorizontal: number;
  onBackToHome: () => void;
};

const keyExtractorSpotifyAlbum = (item: { id: string }) => item.id;

function mergeSpotifyAlbumHits(
  prev: SpotifyAlbumSearchHit[],
  next: SpotifyAlbumSearchHit[],
): SpotifyAlbumSearchHit[] {
  const seen = new Set(prev.map((h) => h.id));
  return [...prev, ...next.filter((h) => !seen.has(h.id))];
}

export function NrmSpotifyAlbumSearchHome({
  isDark,
  paddingHorizontal,
  onBackToHome,
}: Props) {
  const titleColor = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
  const bodyColor = isDark ? 'rgba(255,255,255,0.72)' : 'rgba(0,0,0,0.62)';
  const rowHover = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';

  const [query, setQuery] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [heroError, setHeroError] = useState<ChartErrorCode | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [hits, setHits] = useState<SpotifyAlbumSearchHit[]>([]);
  const [detail, setDetail] = useState<SpotifyAlbumDetail | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const reqRef = useRef(0);
  const loadMoreLockRef = useRef(false);
  const listRef = useRef<FlatList<SpotifyAlbumSearchHit>>(null);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) {
      setInlineError(nrmSearchEmptyQuery);
      setHeroError(null);
      return;
    }
    setHasSearched(true);
    const req = ++reqRef.current;
    setLoading(true);
    setLoadingMore(false);
    setHeroError(null);
    setInlineError(null);
    setDetail(null);
    setNextCursor(null);
    setHasMore(false);
    const out = await searchSpotifyAlbumsPage(q, null);
    if (req !== reqRef.current) return;
    setLoading(false);
    if (!out.ok) {
      setHits([]);
      const err = splitSpotifySearchFailure(out);
      setHeroError(err.heroError);
      setInlineError(err.inlineError);
      return;
    }
    const albums = out.data.albums ?? [];
    const cursor = out.data.nextCursor ?? null;
    setHits(albums);
    setNextCursor(cursor);
    setHasMore(!!cursor);
    if (albums.length === 0) {
      setInlineError(nrmSearchNoResults);
    }
  }, [query]);

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || !hasMore || !nextCursor) return;
    const q = query.trim();
    if (!q) return;
    if (loadMoreLockRef.current) return;
    loadMoreLockRef.current = true;
    setLoadingMore(true);
    const req = reqRef.current;
    const out = await searchSpotifyAlbumsPage(q, nextCursor);
    if (req !== reqRef.current) {
      loadMoreLockRef.current = false;
      return;
    }
    if (!out.ok) {
      setLoadingMore(false);
      setHasMore(false);
      loadMoreLockRef.current = false;
      return;
    }
    const next = out.data.albums ?? [];
    const cursor = out.data.nextCursor ?? null;
    setHits((prev) => mergeSpotifyAlbumHits(prev, next));
    setNextCursor(cursor);
    setHasMore(!!cursor);
    setLoadingMore(false);
    loadMoreLockRef.current = false;
  }, [query, loading, loadingMore, hasMore, nextCursor]);

  const initialCentered =
    !hasSearched &&
    !loading &&
    !detailLoading &&
    hits.length === 0 &&
    !detail &&
    !heroError &&
    !inlineError;

  const openDetail = useCallback(async (hit: SpotifyAlbumSearchHit) => {
    const req = ++reqRef.current;
    setDetailLoading(true);
    setHeroError(null);
    setInlineError(null);
    const out = await fetchSpotifyAlbumDetail(hit.id);
    if (req !== reqRef.current) return;
    setDetailLoading(false);
    if (!out.ok) {
      const err = splitSpotifySearchFailure(out);
      setHeroError(err.heroError);
      setInlineError(err.inlineError);
      return;
    }
    setDetail(out.data);
  }, []);

  const renderListHeader = () => (
    <View style={styles.listHeaderWrap}>
      <NrmFeatureScreenLogoHeader
        isDark={isDark}
        onPressHome={onBackToHome}
        compact={!initialCentered}
      />
      <NrmSpotifySearchBar
        value={query}
        onChangeText={setQuery}
        onSubmit={() => void runSearch()}
        placeholder="앨범 이름"
        titleColor={titleColor}
        bodyColor={bodyColor}
        isDark={isDark}
        loading={loading}
        compact={initialCentered}
      />
      {loading ? (
        <ActivityIndicator color={nrmTokens.color.primary} style={styles.loader} />
      ) : null}
      <NrmSpotifySearchErrorView
        errorCode={heroError}
        isDark={isDark}
        paddingHorizontal={0}
      />
      {inlineError ? (
        <Text style={[styles.error, { color: bodyColor }]}>{inlineError}</Text>
      ) : null}
    </View>
  );

  const renderListFooter = () => (
    <>
      {loadingMore ? (
        <ActivityIndicator color={nrmTokens.color.primary} style={styles.loader} />
      ) : null}
      {detailLoading ? (
        <ActivityIndicator color={nrmTokens.color.primary} style={styles.loader} />
      ) : null}
      {!heroError && detail ? (
        <View style={styles.detail}>
          <View style={styles.detailCover}>
            <NrmSpotifyCoverImage imageUrl={detail.info.imageUrl} />
          </View>
          <Text style={[styles.detailTitle, { color: titleColor }]}>{detail.info.name}</Text>
          <Text style={[styles.rowSub, { color: bodyColor, textAlign: 'center' }]}>
            {detail.info.artists} · {detail.info.totalTracks}곡
            {detail.info.releaseDate ? ` · ${detail.info.releaseDate}` : ''}
          </Text>
          {detail.info.spotifyUrl ? (
            <Pressable onPress={() => void Linking.openURL(detail.info.spotifyUrl)}>
              <Text style={styles.link}>Spotify에서 열기</Text>
            </Pressable>
          ) : null}
          <NrmSpotifySectionTitle title="수록곡" color={titleColor} />
          {detail.tracks.map((t) => (
            <Text key={`${t.trackNumber}-${t.name}`} style={[styles.listLine, { color: bodyColor }]}>
              {t.trackNumber}. {t.name} · {formatSpotifyDuration(t.durationMs)}
            </Text>
          ))}
        </View>
      ) : null}
    </>
  );

  return (
    <View style={styles.listRoot}>
      <FlatList
        ref={listRef}
        data={!heroError ? hits : []}
        keyExtractor={keyExtractorSpotifyAlbum}
        renderItem={({ item: hit }) => (
          <Pressable
            onPress={() => void openDetail(hit)}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: rowHover }]}>
            <NrmSpotifyCoverImage imageUrl={hit.imageUrl} size={56} />
            <View style={styles.rowMeta}>
              <Text style={[styles.rowTitle, { color: titleColor }]} numberOfLines={1}>
                {hit.name}
              </Text>
              <Text style={[styles.rowSub, { color: bodyColor }]} numberOfLines={1}>
                {hit.artists}
                {hit.releaseDate ? ` · ${hit.releaseDate}` : ''}
              </Text>
            </View>
          </Pressable>
        )}
        ListHeaderComponent={renderListHeader}
        ListFooterComponent={renderListFooter}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.35}
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset.y;
          setShowScrollTop(y > NRM_SEARCH_SCROLL_TOP_THRESHOLD);
        }}
        scrollEventThrottle={200}
        keyboardShouldPersistTaps="handled"
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollInner,
          { paddingHorizontal },
          initialCentered && styles.scrollInnerInitialCentered,
        ]}
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        windowSize={10}
      />
      <NrmScrollToTopFab
        visible={showScrollTop}
        onPress={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}
        isDark={isDark}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  listRoot: { flex: 1 },
  listHeaderWrap: { width: '100%' },
  scroll: { flex: 1 },
  scrollInner: { paddingBottom: nrmTokens.space.xxl },
  scrollInnerInitialCentered: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  loader: { marginVertical: nrmTokens.space.md },
  error: { marginBottom: nrmTokens.space.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.md,
    paddingVertical: nrmTokens.space.sm,
    borderRadius: nrmTokens.radius.sm,
  },
  rowMeta: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: nrmTokens.font.body, fontWeight: '600' },
  rowSub: { fontSize: nrmTokens.font.caption, marginTop: 2 },
  detailCover: { alignSelf: 'center', marginBottom: nrmTokens.space.md },
  detail: { marginTop: nrmTokens.space.lg },
  detailTitle: {
    fontSize: nrmTokens.font.lead,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: nrmTokens.space.xs,
  },
  listLine: { fontSize: nrmTokens.font.caption, marginBottom: 4 },
  link: {
    color: nrmTokens.color.primary,
    fontSize: nrmTokens.font.body,
    marginTop: nrmTokens.space.sm,
    textAlign: 'center',
  },
});
