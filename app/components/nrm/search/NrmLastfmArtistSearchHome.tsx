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
  formatLastfmCount,
  NrmLastfmCoverImage,
  NrmLastfmSearchBar,
  NrmLastfmSectionTitle,
  NrmLastfmTagList,
  NrmSearchPageTitle,
} from '@/components/nrm/search/NrmLastfmSearchUi';
import { nrmTokens } from '@/constants/nrmTokens';
import {
  fetchLastfmArtistDetail,
  searchLastfmArtists,
} from '@/lib/nrmLastfmSearchClient';
import type {
  LastfmArtistDetail,
  LastfmArtistSearchHit,
} from '@/lib/nrmLastfmSearchTypes';
import {
  nrmSearchEmptyQuery,
  nrmSearchNoResults,
} from '@/lib/nrmSearchStrings';

type Props = {
  isDark: boolean;
  paddingHorizontal: number;
  onBackToHome: () => void;
};

export function NrmLastfmArtistSearchHome({
  isDark,
  paddingHorizontal,
  onBackToHome,
}: Props) {
  const titleColor = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
  const bodyColor = isDark ? 'rgba(255,255,255,0.72)' : 'rgba(0,0,0,0.62)';
  const chipBg = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)';
  const rowHover = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hits, setHits] = useState<LastfmArtistSearchHit[]>([]);
  const [detail, setDetail] = useState<LastfmArtistDetail | null>(null);
  const [searched, setSearched] = useState(false);
  const reqRef = useRef(0);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) {
      setError(nrmSearchEmptyQuery);
      return;
    }
    const req = ++reqRef.current;
    setLoading(true);
    setError(null);
    setDetail(null);
    setSearched(true);
    const out = await searchLastfmArtists(q);
    if (req !== reqRef.current) return;
    setLoading(false);
    if (!out.ok) {
      setHits([]);
      setError(out.message);
      return;
    }
    setHits(out.data.artists ?? []);
    if ((out.data.artists ?? []).length === 0) {
      setError(nrmSearchNoResults);
    }
  }, [query]);

  const openDetail = useCallback(async (hit: LastfmArtistSearchHit) => {
    const req = ++reqRef.current;
    setDetailLoading(true);
    setError(null);
    const out = await fetchLastfmArtistDetail(hit.name, hit.mbid || undefined);
    if (req !== reqRef.current) return;
    setDetailLoading(false);
    if (!out.ok) {
      setError(out.message);
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
      ]}
      keyboardShouldPersistTaps="handled">
      <NrmFeatureScreenLogoHeader isDark={isDark} onPressHome={onBackToHome} />
      <NrmSearchPageTitle title="아티스트 검색" color={titleColor} />
      <NrmLastfmSearchBar
        value={query}
        onChangeText={setQuery}
        onSubmit={() => void runSearch()}
        placeholder="아티스트 이름"
        titleColor={titleColor}
        bodyColor={bodyColor}
        isDark={isDark}
        loading={loading}
      />
      {loading || detailLoading ? (
        <ActivityIndicator color={nrmTokens.color.primary} style={styles.loader} />
      ) : null}
      {error ? (
        <Text style={[styles.error, { color: bodyColor }]}>{error}</Text>
      ) : null}

      {!detail && hits.length > 0 ? (
        <>
          <NrmLastfmSectionTitle title="검색 결과" color={titleColor} />
          {hits.map((hit) => (
            <Pressable
              key={`${hit.name}-${hit.mbid || hit.url}`}
              onPress={() => void openDetail(hit)}
              style={({ pressed }) => [
                styles.hitRow,
                pressed && { backgroundColor: rowHover },
              ]}>
              <NrmLastfmCoverImage uri={hit.imageUrl} size={52} />
              <View style={styles.hitMeta}>
                <Text style={[styles.hitTitle, { color: titleColor }]} numberOfLines={1}>
                  {hit.name}
                </Text>
                <Text style={[styles.hitSub, { color: bodyColor }]}>
                  청취자 {formatLastfmCount(hit.listeners)}
                </Text>
              </View>
            </Pressable>
          ))}
        </>
      ) : null}

      {detail ? (
        <>
          <View style={styles.heroRow}>
            <NrmLastfmCoverImage uri={detail.info.imageUrl} size={120} />
            <View style={styles.heroMeta}>
              <Text style={[styles.heroTitle, { color: titleColor }]}>
                {detail.info.name}
              </Text>
              {detail.info.onTour ? (
                <Text style={[styles.badge, { color: nrmTokens.color.primary }]}>
                  ON TOUR
                </Text>
              ) : null}
              <Text style={[styles.stat, { color: bodyColor }]}>
                청취자 {formatLastfmCount(detail.info.listeners)}
              </Text>
              <Text style={[styles.stat, { color: bodyColor }]}>
                재생 {formatLastfmCount(detail.info.playcount)}
              </Text>
              {detail.info.url ? (
                <Pressable onPress={() => void Linking.openURL(detail.info.url)}>
                  <Text style={styles.link}>웹에서 보기</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
          {detail.info.bioSummary ? (
            <>
              <NrmLastfmSectionTitle title="소개" color={titleColor} />
              <Text style={[styles.bio, { color: bodyColor }]}>
                {detail.info.bioSummary}
              </Text>
            </>
          ) : null}
          <NrmLastfmSectionTitle title="장르 · 태그" color={titleColor} />
          <NrmLastfmTagList tags={detail.tags} bodyColor={bodyColor} chipBg={chipBg} />
          <NrmLastfmSectionTitle title="유사 아티스트" color={titleColor} />
          {detail.similarArtists.length === 0 ? (
            <Text style={[styles.empty, { color: bodyColor }]}>없음</Text>
          ) : (
            detail.similarArtists.map((a) => (
              <Pressable
                key={a.name}
                onPress={() => void openDetail({ name: a.name, mbid: '', url: a.url, imageUrl: a.imageUrl, listeners: 0 })}
                style={({ pressed }) => [
                  styles.hitRow,
                  pressed && { backgroundColor: rowHover },
                ]}>
                <NrmLastfmCoverImage uri={a.imageUrl} size={44} />
                <Text style={[styles.hitTitle, { color: titleColor }]}>{a.name}</Text>
              </Pressable>
            ))
          )}
          <NrmLastfmSectionTitle title="인기 곡" color={titleColor} />
          {detail.topTracks.map((t) => (
            <Pressable
              key={`${t.rank}-${t.name}`}
              onPress={() => t.url && void Linking.openURL(t.url)}
              style={({ pressed }) => [
                styles.hitRow,
                pressed && { backgroundColor: rowHover },
              ]}>
              <Text style={[styles.rank, { color: bodyColor }]}>{t.rank}</Text>
              <View style={styles.hitMeta}>
                <Text style={[styles.hitTitle, { color: titleColor }]} numberOfLines={1}>
                  {t.name}
                </Text>
                <Text style={[styles.hitSub, { color: bodyColor }]}>
                  재생 {formatLastfmCount(t.playcount)}
                </Text>
              </View>
            </Pressable>
          ))}
          <NrmLastfmSectionTitle title="인기 앨범" color={titleColor} />
          {detail.topAlbums.map((al) => (
            <Pressable
              key={`${al.name}-${al.artist}`}
              onPress={() => al.url && void Linking.openURL(al.url)}
              style={({ pressed }) => [
                styles.hitRow,
                pressed && { backgroundColor: rowHover },
              ]}>
              <NrmLastfmCoverImage uri={al.imageUrl} size={44} />
              <View style={styles.hitMeta}>
                <Text style={[styles.hitTitle, { color: titleColor }]} numberOfLines={1}>
                  {al.name}
                </Text>
                <Text style={[styles.hitSub, { color: bodyColor }]}>
                  {al.artist} · 재생 {formatLastfmCount(al.playcount)}
                </Text>
              </View>
            </Pressable>
          ))}
        </>
      ) : null}

      {searched && !loading && !detail && hits.length === 0 && !error ? (
        <Text style={[styles.empty, { color: bodyColor }]}>{nrmSearchNoResults}</Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollInner: {
    paddingBottom: nrmTokens.space.xxl,
    width: '100%',
    maxWidth: nrmTokens.layout.maxContentWidth,
    alignSelf: 'center',
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: nrmTokens.space.md,
  },
  loader: { marginVertical: nrmTokens.space.md },
  error: { marginBottom: nrmTokens.space.md, fontSize: nrmTokens.font.caption, lineHeight: 20 },
  hitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.sm,
    paddingVertical: nrmTokens.space.sm,
    borderRadius: nrmTokens.radius.sm,
  },
  hitMeta: { flex: 1, minWidth: 0 },
  hitTitle: { fontSize: nrmTokens.font.body, fontWeight: '600' },
  hitSub: { marginTop: 2, fontSize: nrmTokens.font.caption },
  rank: { width: 28, textAlign: 'center', fontWeight: '600' },
  heroRow: { flexDirection: 'row', gap: nrmTokens.space.md, marginBottom: nrmTokens.space.md },
  heroMeta: { flex: 1, minWidth: 0 },
  heroTitle: { fontSize: nrmTokens.font.lead, fontWeight: '700' },
  badge: { marginTop: 4, fontSize: nrmTokens.font.caption, fontWeight: '700' },
  stat: { marginTop: 4, fontSize: nrmTokens.font.caption },
  link: {
    marginTop: nrmTokens.space.sm,
    color: nrmTokens.color.primary,
    fontSize: nrmTokens.font.caption,
    fontWeight: '600',
  },
  bio: { fontSize: nrmTokens.font.caption, lineHeight: 20 },
  empty: { fontSize: nrmTokens.font.caption },
});
