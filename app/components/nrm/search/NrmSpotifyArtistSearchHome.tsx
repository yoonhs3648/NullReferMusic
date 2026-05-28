import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { NrmFeatureScreenLogoHeader } from '@/components/nrm/NrmFeatureScreenLogoHeader';
import {
  formatSpotifyCount,
  formatSpotifyDuration,
  NrmSpotifyCoverImage,
  NrmSpotifySearchBar,
  NrmSpotifySectionTitle,
} from '@/components/nrm/search/NrmSpotifySearchUi';
import { nrmTokens } from '@/constants/nrmTokens';
import {
  fetchSpotifyArtistDetail,
  searchSpotifyArtists,
} from '@/lib/nrmSpotifySearchClient';
import type {
  SpotifyArtistDetail,
  SpotifyArtistSearchHit,
} from '@/lib/nrmSpotifySearchTypes';
import { NrmSpotifySearchErrorView } from '@/components/nrm/search/NrmSpotifySearchErrorView';
import type { ChartErrorCode } from '@/lib/nrmChartErrors';
import { splitSpotifySearchFailure } from '@/lib/nrmSpotifySearchUi';
import { nrmSearchEmptyQuery, nrmSearchNoResults } from '@/lib/nrmSearchStrings';

type Props = {
  isDark: boolean;
  paddingHorizontal: number;
  onBackToHome: () => void;
};

export function NrmSpotifyArtistSearchHome({
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
  const [detailLoading, setDetailLoading] = useState(false);
  const [heroError, setHeroError] = useState<ChartErrorCode | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [hits, setHits] = useState<SpotifyArtistSearchHit[]>([]);
  const [detail, setDetail] = useState<SpotifyArtistDetail | null>(null);
  const reqRef = useRef(0);

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
    setHeroError(null);
    setInlineError(null);
    setDetail(null);
    const out = await searchSpotifyArtists(q);
    if (req !== reqRef.current) return;
    setLoading(false);
    if (!out.ok) {
      setHits([]);
      const err = splitSpotifySearchFailure(out);
      setHeroError(err.heroError);
      setInlineError(err.inlineError);
      return;
    }
    setHits(out.data.artists ?? []);
    if ((out.data.artists ?? []).length === 0) {
      setInlineError(nrmSearchNoResults);
    }
  }, [query]);

  const initialCentered =
    !hasSearched &&
    !loading &&
    !detailLoading &&
    hits.length === 0 &&
    !detail &&
    !heroError &&
    !inlineError;

  const openDetail = useCallback(async (hit: SpotifyArtistSearchHit) => {
    const req = ++reqRef.current;
    setDetailLoading(true);
    setHeroError(null);
    setInlineError(null);
    const out = await fetchSpotifyArtistDetail(hit.id);
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

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.scrollInner,
        { paddingHorizontal },
        initialCentered && styles.scrollInnerInitialCentered,
      ]}
      keyboardShouldPersistTaps="handled">
      <NrmFeatureScreenLogoHeader
        isDark={isDark}
        onPressHome={onBackToHome}
        compact={!initialCentered}
      />
      <NrmSpotifySearchBar
        value={query}
        onChangeText={setQuery}
        onSubmit={() => void runSearch()}
        placeholder="아티스트 이름"
        titleColor={titleColor}
        bodyColor={bodyColor}
        isDark={isDark}
        loading={loading}
        compact={initialCentered}
      />
      {loading ? <ActivityIndicator color={nrmTokens.color.primary} /> : null}
      <NrmSpotifySearchErrorView
        errorCode={heroError}
        isDark={isDark}
        paddingHorizontal={0}
      />
      {inlineError ? (
        <Text style={[styles.error, { color: bodyColor }]}>{inlineError}</Text>
      ) : null}
      {!heroError
        ? hits.map((hit) => (
        <Pressable
          key={hit.id}
          onPress={() => void openDetail(hit)}
          style={({ pressed }) => [styles.row, pressed && { backgroundColor: rowHover }]}>
          <NrmSpotifyCoverImage imageUrl={hit.imageUrl} size={56} />
          <View style={styles.rowMeta}>
            <Text style={[styles.rowTitle, { color: titleColor }]} numberOfLines={1}>
              {hit.name}
            </Text>
            <Text style={[styles.rowSub, { color: bodyColor }]}>
              팔로워 {formatSpotifyCount(hit.followers)}
            </Text>
          </View>
        </Pressable>
          ))
        : null}
      {detailLoading ? <ActivityIndicator color={nrmTokens.color.primary} /> : null}
      {!heroError && detail ? (
        <View style={styles.detail}>
          <View style={styles.detailCover}>
            <NrmSpotifyCoverImage imageUrl={detail.info.imageUrl} />
          </View>
          <Text style={[styles.detailTitle, { color: titleColor }]}>{detail.info.name}</Text>
          <Text style={[styles.rowSub, { color: bodyColor }]}>
            팔로워 {formatSpotifyCount(detail.info.followers)} · 인기도{' '}
            {detail.info.popularity}
          </Text>
          {detail.info.genres.length > 0 ? (
            <Text style={[styles.rowSub, { color: bodyColor }]}>
              {detail.info.genres.join(' · ')}
            </Text>
          ) : null}
          {detail.info.spotifyUrl ? (
            <Pressable onPress={() => void Linking.openURL(detail.info.spotifyUrl)}>
              <Text style={styles.link}>Spotify에서 열기</Text>
            </Pressable>
          ) : null}
          <NrmSpotifySectionTitle title="인기곡" color={titleColor} />
          {detail.topTracks.map((t) => (
            <Text key={t.id} style={[styles.listLine, { color: bodyColor }]}>
              {t.name} · {t.artists} · {formatSpotifyDuration(t.durationMs)}
            </Text>
          ))}
          <NrmSpotifySectionTitle title="앨범" color={titleColor} />
          {detail.albums.map((a) => (
            <Text key={a.id} style={[styles.listLine, { color: bodyColor }]}>
              {a.name} · {a.artists}
              {a.releaseDate ? ` · ${a.releaseDate}` : ''}
            </Text>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollInner: { paddingBottom: nrmTokens.space.xxl },
  scrollInnerInitialCentered: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  logoWrap: { marginBottom: nrmTokens.space.md },
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
