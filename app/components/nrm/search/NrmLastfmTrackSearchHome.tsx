import { useCallback, useMemo, useRef, useState } from 'react';
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
  fetchLastfmTrackDetail,
  searchLastfmTracks,
} from '@/lib/nrmLastfmSearchClient';
import type {
  LastfmTrackDetail,
  LastfmTrackSearchHit,
} from '@/lib/nrmLastfmSearchTypes';
import {
  nrmSearchEmptyQuery,
  nrmSearchNoResults,
} from '@/lib/nrmSearchStrings';
import { useNrmLastfmTrackCoverLoader } from '@/lib/useNrmLastfmTrackCoverLoader';

type Props = {
  isDark: boolean;
  paddingHorizontal: number;
  onBackToHome: () => void;
};

export function NrmLastfmTrackSearchHome({
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
  const [hits, setHits] = useState<LastfmTrackSearchHit[]>([]);
  const [detail, setDetail] = useState<LastfmTrackDetail | null>(null);
  const reqRef = useRef(0);
  const viewGen = detail ? `detail-${detail.info.mbid}-${detail.info.name}` : `list-${hits.length}`;

  const trackCoverHits = useMemo(() => {
    if (detail) {
      const hero = {
        name: detail.info.name,
        artist: detail.info.artist,
        mbid: detail.info.mbid,
        imageUrl: detail.info.imageUrl,
      };
      const similar = detail.similarTracks.map((t) => ({
        name: t.name,
        artist: t.artist,
        mbid: t.mbid,
        imageUrl: t.imageUrl,
      }));
      return [hero, ...similar];
    }
    return hits.map((hit) => ({
      name: hit.name,
      artist: hit.artist,
      mbid: hit.mbid,
      imageUrl: hit.imageUrl,
    }));
  }, [detail, hits]);

  const { resolveCoverUrl: resolveTrackCoverUrl } = useNrmLastfmTrackCoverLoader({
    hits: trackCoverHits,
    generation: viewGen,
    enabled: trackCoverHits.length > 0,
  });

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
    const out = await searchLastfmTracks(q);
    if (req !== reqRef.current) return;
    setLoading(false);
    if (!out.ok) {
      setHits([]);
      setError(out.message);
      return;
    }
    setHits(out.data.tracks ?? []);
    if ((out.data.tracks ?? []).length === 0) setError(nrmSearchNoResults);
  }, [query]);

  const openDetail = useCallback(async (hit: LastfmTrackSearchHit) => {
    const req = ++reqRef.current;
    setDetailLoading(true);
    setError(null);
    const out = await fetchLastfmTrackDetail(hit.artist, hit.name, hit.mbid);
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
      <NrmSearchPageTitle title="트랙 검색" color={titleColor} />
      <NrmLastfmSearchBar
        value={query}
        onChangeText={setQuery}
        onSubmit={() => void runSearch()}
        placeholder="곡 이름"
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
              key={`${hit.artist}-${hit.name}-${hit.url}`}
              onPress={() => void openDetail(hit)}
              style={({ pressed }) => [
                styles.hitRow,
                pressed && { backgroundColor: rowHover },
              ]}>
              <NrmLastfmCoverImage uri={resolveTrackCoverUrl(hit)} size={52} />
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
            <NrmLastfmCoverImage
              uri={resolveTrackCoverUrl({
                name: detail.info.name,
                artist: detail.info.artist,
                mbid: detail.info.mbid,
                imageUrl: detail.info.imageUrl,
              })}
              size={120}
            />
            <View style={styles.heroMeta}>
              <Text style={[styles.heroTitle, { color: titleColor }]}>
                {detail.info.name}
              </Text>
              <Text style={[styles.stat, { color: bodyColor }]}>{detail.info.artist}</Text>
              {detail.info.album ? (
                <Text style={[styles.stat, { color: bodyColor }]}>
                  앨범 {detail.info.album}
                </Text>
              ) : null}
              <Text style={[styles.stat, { color: bodyColor }]}>
                길이 {formatLastfmDuration(detail.info.durationSec)}
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
          <NrmLastfmSectionTitle title="태그" color={titleColor} />
          <NrmLastfmTagList tags={detail.tags} bodyColor={bodyColor} chipBg={chipBg} />
          <NrmLastfmSectionTitle title="유사 곡" color={titleColor} />
          {detail.similarTracks.length === 0 ? (
            <Text style={[styles.empty, { color: bodyColor }]}>없음</Text>
          ) : (
            detail.similarTracks.map((t) => (
              <Pressable
                key={`${t.rank}-${t.name}-${t.artist}`}
                onPress={() =>
                  void openDetail({
                    name: t.name,
                    artist: t.artist,
                    mbid: t.mbid,
                    url: t.url,
                    imageUrl: t.imageUrl,
                  })
                }
                style={({ pressed }) => [
                  styles.hitRow,
                  pressed && { backgroundColor: rowHover },
                ]}>
                <NrmLastfmCoverImage
                  uri={resolveTrackCoverUrl({
                    name: t.name,
                    artist: t.artist,
                    mbid: t.mbid,
                    imageUrl: t.imageUrl,
                  })}
                  size={44}
                />
                <Text style={[styles.rank, { color: bodyColor }]}>{t.rank}</Text>
                <View style={styles.hitMeta}>
                  <Text style={[styles.hitTitle, { color: titleColor }]} numberOfLines={1}>
                    {t.name}
                  </Text>
                  <Text style={[styles.hitSub, { color: bodyColor }]} numberOfLines={1}>
                    {t.artist}
                  </Text>
                </View>
              </Pressable>
            ))
          )}
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
  rank: { width: 28, textAlign: 'center', fontWeight: '600' },
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
  empty: { fontSize: nrmTokens.font.caption },
});
