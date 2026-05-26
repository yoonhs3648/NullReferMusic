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
  formatLastfmDuration,
  NrmLastfmCoverImage,
  NrmLastfmSearchBar,
  NrmLastfmSectionTitle,
  NrmLastfmTagList,
  NrmSearchPageTitle,
} from '@/components/nrm/search/NrmLastfmSearchUi';
import { nrmTokens } from '@/constants/nrmTokens';
import {
  fetchLastfmAlbumDetail,
  searchLastfmAlbums,
} from '@/lib/nrmLastfmSearchClient';
import type {
  LastfmAlbumDetail,
  LastfmAlbumSearchHit,
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

export function NrmLastfmAlbumSearchHome({
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
  const [hits, setHits] = useState<LastfmAlbumSearchHit[]>([]);
  const [detail, setDetail] = useState<LastfmAlbumDetail | null>(null);
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
    const out = await searchLastfmAlbums(q);
    if (req !== reqRef.current) return;
    setLoading(false);
    if (!out.ok) {
      setHits([]);
      setError(out.message);
      return;
    }
    setHits(out.data.albums ?? []);
    if ((out.data.albums ?? []).length === 0) setError(nrmSearchNoResults);
  }, [query]);

  const openDetail = useCallback(async (hit: LastfmAlbumSearchHit) => {
    const req = ++reqRef.current;
    setDetailLoading(true);
    setError(null);
    const out = await fetchLastfmAlbumDetail(hit.artist, hit.name);
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
      contentContainerStyle={[styles.scrollInner, { paddingHorizontal }]}
      keyboardShouldPersistTaps="handled">
      <NrmFeatureScreenLogoHeader isDark={isDark} onPressHome={onBackToHome} />
      <NrmSearchPageTitle title="앨범 검색" color={titleColor} />
      <NrmLastfmSearchBar
        value={query}
        onChangeText={setQuery}
        onSubmit={() => void runSearch()}
        placeholder="앨범 이름"
        titleColor={titleColor}
        bodyColor={bodyColor}
        isDark={isDark}
        loading={loading}
      />
      {loading || detailLoading ? (
        <ActivityIndicator color={nrmTokens.color.primary} style={styles.loader} />
      ) : null}
      {error ? <Text style={[styles.error, { color: bodyColor }]}>{error}</Text> : null}

      {!detail && hits.length > 0 ? (
        <>
          <NrmLastfmSectionTitle title="검색 결과" color={titleColor} />
          {hits.map((hit) => (
            <Pressable
              key={`${hit.artist}-${hit.name}-${hit.mbid || hit.url}`}
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
                <Text style={[styles.hitSub, { color: bodyColor }]} numberOfLines={1}>
                  {hit.artist}
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
              <Text style={[styles.stat, { color: bodyColor }]}>{detail.info.artist}</Text>
              {detail.info.published ? (
                <Text style={[styles.stat, { color: bodyColor }]}>
                  발매 {detail.info.published}
                </Text>
              ) : null}
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
          {detail.info.wikiSummary ? (
            <>
              <NrmLastfmSectionTitle title="앨범 소개" color={titleColor} />
              <Text style={[styles.bio, { color: bodyColor }]}>
                {detail.info.wikiSummary}
              </Text>
            </>
          ) : null}
          <NrmLastfmSectionTitle title="태그" color={titleColor} />
          <NrmLastfmTagList tags={detail.tags} bodyColor={bodyColor} chipBg={chipBg} />
          {detail.info.tracks.length > 0 ? (
            <>
              <NrmLastfmSectionTitle title="수록곡" color={titleColor} />
              {detail.info.tracks.map((t) => (
                <View key={`${t.rank}-${t.name}`} style={styles.trackRow}>
                  <Text style={[styles.rank, { color: bodyColor }]}>{t.rank}</Text>
                  <Text style={[styles.trackName, { color: titleColor }]} numberOfLines={1}>
                    {t.name}
                  </Text>
                  <Text style={[styles.dur, { color: bodyColor }]}>
                    {formatLastfmDuration(t.durationSec)}
                  </Text>
                </View>
              ))}
            </>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollInner: {
    paddingBottom: nrmTokens.space.xxl,
    maxWidth: nrmTokens.layout.maxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },
  logoWrap: { alignItems: 'center', marginBottom: nrmTokens.space.md },
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
  heroRow: { flexDirection: 'row', gap: nrmTokens.space.md, marginBottom: nrmTokens.space.md },
  heroMeta: { flex: 1, minWidth: 0 },
  heroTitle: { fontSize: nrmTokens.font.lead, fontWeight: '700' },
  stat: { marginTop: 4, fontSize: nrmTokens.font.caption },
  link: {
    marginTop: nrmTokens.space.sm,
    color: nrmTokens.color.primary,
    fontSize: nrmTokens.font.caption,
    fontWeight: '600',
  },
  bio: { fontSize: nrmTokens.font.caption, lineHeight: 20 },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.sm,
    paddingVertical: 6,
  },
  rank: { width: 28, textAlign: 'center', fontWeight: '600' },
  trackName: { flex: 1, fontSize: nrmTokens.font.body },
  dur: { fontSize: nrmTokens.font.caption, minWidth: 40, textAlign: 'right' },
});
