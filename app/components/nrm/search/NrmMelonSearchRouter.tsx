import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
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
  NrmLastfmDetailHeroCard,
  NrmLastfmSearchBar,
  NrmLastfmSectionTitle,
  type NrmLastfmMetaField,
} from '@/components/nrm/search/NrmLastfmSearchUi';
import { nrmTokens } from '@/constants/nrmTokens';
import {
  fetchMelonAlbumDetail,
  fetchMelonArtistDetail,
  fetchMelonTrackDetail,
  searchMelonAlbums,
  searchMelonArtists,
  searchMelonTracks,
} from '@/lib/nrmMelonSearchClient';
import type {
  MelonAlbumDetail,
  MelonAlbumSearchHit,
  MelonArtistDetail,
  MelonArtistInfo,
  MelonArtistSearchHit,
  MelonTrackDetail,
  MelonTrackSearchHit,
} from '@/lib/nrmMelonSearchTypes';
import {
  nrmSearchEmptyQuery,
  nrmSearchNoResults,
} from '@/lib/nrmSearchStrings';

export type MelonSearchKind = 'artist' | 'album' | 'track';

type ListFrame = {
  id: string;
  type: 'artist-list' | 'album-list' | 'track-list';
  query: string;
  hits: MelonArtistSearchHit[] | MelonAlbumSearchHit[] | MelonTrackSearchHit[];
  searched: boolean;
  loading: boolean;
  error: string | null;
};

type ArtistDetailFrame = {
  id: string;
  type: 'artist-detail';
  hit: MelonArtistSearchHit;
  detail: MelonArtistDetail | null;
  loading: boolean;
  error: string | null;
};

type AlbumDetailFrame = {
  id: string;
  type: 'album-detail';
  albumId: string;
  albumName: string;
  artistName: string;
  detail: MelonAlbumDetail | null;
  loading: boolean;
  error: string | null;
};

type TrackDetailFrame = {
  id: string;
  type: 'track-detail';
  songId: string;
  artist: string;
  track: string;
  hit?: MelonTrackSearchHit;
  detail: MelonTrackDetail | null;
  loading: boolean;
  error: string | null;
};

type Frame = ListFrame | ArtistDetailFrame | AlbumDetailFrame | TrackDetailFrame;

export type MelonSearchRouterState = {
  stack: Frame[];
};

export type MelonSearchNavHandle = {
  goBack: () => boolean;
  captureState: () => MelonSearchRouterState;
  restoreState: (state: MelonSearchRouterState) => void;
};

export type MelonYoutubeNavigateParams = {
  artist: string;
  title: string;
  songId?: string;
  album?: string;
  genre?: string;
  releaseDate?: string;
  imageUrl?: string;
};

type Props = {
  initialKind: MelonSearchKind;
  isDark: boolean;
  paddingHorizontal: number;
  onBackToHome: () => void;
  onNavigateYoutube: (params: MelonYoutubeNavigateParams) => void;
  restoredState?: MelonSearchRouterState | null;
};

let frameSeq = 0;
function nextFrameId(): string {
  frameSeq += 1;
  return `ml-${frameSeq}`;
}

function emptyListFrame(kind: MelonSearchKind): ListFrame {
  const type =
    kind === 'artist'
      ? 'artist-list'
      : kind === 'album'
        ? 'album-list'
        : 'track-list';
  return {
    id: nextFrameId(),
    type,
    query: '',
    hits: [],
    searched: false,
    loading: false,
    error: null,
  };
}

function MelonMetaGrid({
  rows,
  titleColor,
  bodyColor,
  chipBg,
}: {
  rows: { label: string; value: string }[];
  titleColor: string;
  bodyColor: string;
  chipBg: string;
}) {
  const filtered = rows.filter((r) => r.value.trim().length > 0);
  if (filtered.length === 0) return null;
  return (
    <View style={styles.metaGrid}>
      {filtered.map((row) => (
        <View key={row.label} style={[styles.metaChip, { backgroundColor: chipBg }]}>
          <Text style={[styles.metaLabel, { color: bodyColor }]}>{row.label}</Text>
          <Text style={[styles.metaValue, { color: titleColor }]} numberOfLines={2}>
            {row.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

function artistMetaRows(info: MelonArtistInfo): { label: string; value: string }[] {
  return [
    { label: '장르', value: info.genre },
    { label: '유형', value: info.artistType },
    { label: '데뷔', value: info.debutDate },
    { label: '활동년대', value: info.activeEra },
    { label: '소속사', value: info.agency },
    { label: '국적', value: info.nationality },
  ];
}

export const NrmMelonSearchRouter = forwardRef<MelonSearchNavHandle, Props>(
  function NrmMelonSearchRouter(
    { initialKind, isDark, paddingHorizontal, onBackToHome, onNavigateYoutube, restoredState },
    ref,
  ) {
    const titleColor = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
    const bodyColor = isDark ? 'rgba(255,255,255,0.72)' : 'rgba(0,0,0,0.62)';
    const chipBg = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)';
    const rowHover = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';

    const [stack, setStack] = useState<Frame[]>(() =>
      restoredState?.stack?.length ? restoredState.stack : [emptyListFrame(initialKind)],
    );
    const reqRef = useRef(0);

    useEffect(() => {
      if (restoredState?.stack?.length) {
        setStack(restoredState.stack);
      }
    }, [restoredState]);

    const top = stack[stack.length - 1];
    const isTopList =
      top.type === 'artist-list' ||
      top.type === 'album-list' ||
      top.type === 'track-list';
    const initialListCentered =
      isTopList &&
      !top.searched &&
      !top.loading &&
      top.hits.length === 0 &&
      !top.error;

    useImperativeHandle(
      ref,
      () => ({
        goBack: () => {
          if (stack.length > 1) {
            setStack((s) => s.slice(0, -1));
            return true;
          }
          return false;
        },
        captureState: () => ({ stack }),
        restoreState: (state) => {
          if (state.stack?.length) setStack(state.stack);
        },
      }),
      [stack],
    );

    const pushFrame = useCallback((frame: Frame) => {
      setStack((s) => [...s, frame]);
    }, []);

    const updateTop = useCallback((patch: Partial<Frame>) => {
      setStack((s) => {
        if (s.length === 0) return s;
        const next = [...s];
        next[next.length - 1] = { ...next[next.length - 1], ...patch } as Frame;
        return next;
      });
    }, []);

    const runListSearch = useCallback(
      async (frame: ListFrame) => {
        const q = frame.query.trim();
        if (!q) {
          updateTop({ error: nrmSearchEmptyQuery } as Partial<ListFrame>);
          return;
        }
        const req = ++reqRef.current;
        updateTop({ loading: true, error: null, searched: true } as Partial<ListFrame>);

        let out;
        if (frame.type === 'artist-list') {
          out = await searchMelonArtists(q);
        } else if (frame.type === 'album-list') {
          out = await searchMelonAlbums(q);
        } else {
          out = await searchMelonTracks(q);
        }
        if (req !== reqRef.current) return;

        if (!out.ok) {
          updateTop({
            loading: false,
            hits: [],
            error: out.message,
          } as Partial<ListFrame>);
          return;
        }

        let hits: ListFrame['hits'] = [];
        if (frame.type === 'artist-list' && 'artists' in out.data) {
          hits = out.data.artists ?? [];
        } else if (frame.type === 'album-list' && 'albums' in out.data) {
          hits = out.data.albums ?? [];
        } else if (frame.type === 'track-list' && 'tracks' in out.data) {
          hits = out.data.tracks ?? [];
        }

        updateTop({
          loading: false,
          hits,
          error: hits.length === 0 ? nrmSearchNoResults : null,
        } as Partial<ListFrame>);
      },
      [updateTop],
    );

    const openArtistDetail = useCallback(
      async (hit: MelonArtistSearchHit) => {
        pushFrame({
          id: nextFrameId(),
          type: 'artist-detail',
          hit,
          detail: null,
          loading: true,
          error: null,
        });
        const req = ++reqRef.current;
        const out = await fetchMelonArtistDetail(hit.artistId, hit.name);
        if (req !== reqRef.current) return;
        setStack((s) => {
          const next = [...s];
          const cur = next[next.length - 1];
          if (cur.type !== 'artist-detail') return s;
          next[next.length - 1] = {
            ...cur,
            loading: false,
            detail: out.ok ? out.data : null,
            error: out.ok ? null : out.message,
          };
          return next;
        });
      },
      [pushFrame],
    );

    const openAlbumDetail = useCallback(
      async (albumId: string, artistName: string, albumName: string) => {
        pushFrame({
          id: nextFrameId(),
          type: 'album-detail',
          albumId,
          artistName,
          albumName,
          detail: null,
          loading: true,
          error: null,
        });
        const req = ++reqRef.current;
        const out = await fetchMelonAlbumDetail(albumId);
        if (req !== reqRef.current) return;
        setStack((s) => {
          const next = [...s];
          const cur = next[next.length - 1];
          if (cur.type !== 'album-detail') return s;
          next[next.length - 1] = {
            ...cur,
            loading: false,
            detail: out.ok ? out.data : null,
            error: out.ok ? null : out.message,
          };
          return next;
        });
      },
      [pushFrame],
    );

    const openTrackDetail = useCallback(
      async (songId: string, artist: string, track: string, hit?: MelonTrackSearchHit) => {
        pushFrame({
          id: nextFrameId(),
          type: 'track-detail',
          songId,
          artist,
          track,
          hit,
          detail: null,
          loading: true,
          error: null,
        });
        const req = ++reqRef.current;
        const out = await fetchMelonTrackDetail(songId);
        if (req !== reqRef.current) return;
        setStack((s) => {
          const next = [...s];
          const cur = next[next.length - 1];
          if (cur.type !== 'track-detail') return s;
          next[next.length - 1] = {
            ...cur,
            loading: false,
            detail: out.ok ? out.data : null,
            error: out.ok ? null : out.message,
          };
          return next;
        });
      },
      [pushFrame],
    );

    const goYoutubeFromTrack = useCallback(
      (detail: MelonTrackDetail, frame: TrackDetailFrame) => {
        const info = detail.info;
        onNavigateYoutube({
          artist: info.artist || frame.artist,
          title: info.name || frame.track,
          songId: info.songId,
          album: info.album,
          genre: info.genre,
          releaseDate: info.releaseDate,
          imageUrl: info.imageUrl,
        });
      },
      [onNavigateYoutube],
    );

    const renderList = (frame: ListFrame) => {
      const placeholder =
        frame.type === 'artist-list'
          ? '아티스트 이름'
          : frame.type === 'album-list'
            ? '앨범 이름'
            : '곡 이름';

      return (
        <>
          <NrmLastfmSearchBar
            value={frame.query}
            onChangeText={(t) => updateTop({ query: t } as Partial<ListFrame>)}
            onSubmit={() => void runListSearch(frame)}
            placeholder={placeholder}
            titleColor={titleColor}
            bodyColor={bodyColor}
            isDark={isDark}
            loading={frame.loading}
            compact={initialListCentered}
          />
          {frame.loading ? (
            <ActivityIndicator color={nrmTokens.color.primary} style={styles.loader} />
          ) : null}
          {frame.error ? (
            <Text style={[styles.error, { color: bodyColor }]}>{frame.error}</Text>
          ) : null}
          {frame.hits.length > 0 && !frame.error ? (
            <>
              <NrmLastfmSectionTitle title="검색 결과" color={titleColor} />
              {frame.type === 'artist-list'
                ? (frame.hits as MelonArtistSearchHit[]).map((hit) => (
                    <Pressable
                      key={`${hit.artistId}-${hit.name}`}
                      onPress={() => void openArtistDetail(hit)}
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
                          {hit.fanCount > 0
                            ? `팬 ${formatLastfmCount(hit.fanCount)}`
                            : hit.genre || hit.profile || 'Melon'}
                        </Text>
                      </View>
                    </Pressable>
                  ))
                : null}
              {frame.type === 'album-list'
                ? (frame.hits as MelonAlbumSearchHit[]).map((hit) => (
                    <Pressable
                      key={`${hit.albumId}-${hit.name}`}
                      onPress={() => void openAlbumDetail(hit.albumId, hit.artist, hit.name)}
                      style={({ pressed }) => [
                        styles.hitRow,
                        pressed && { backgroundColor: rowHover },
                      ]}>
                      <NrmLastfmCoverImage uri={hit.imageUrl} size={52} />
                      <View style={styles.hitMeta}>
                        <Text style={[styles.hitTitle, { color: titleColor }]} numberOfLines={1}>
                          {hit.albumKind ? `[${hit.albumKind}] ` : ''}
                          {hit.name}
                        </Text>
                        <Text style={[styles.hitSub, { color: bodyColor }]} numberOfLines={1}>
                          {hit.artist}
                          {hit.releaseDate ? ` · ${hit.releaseDate}` : ''}
                          {hit.trackCount > 0 ? ` · ${hit.trackCount}곡` : ''}
                        </Text>
                      </View>
                    </Pressable>
                  ))
                : null}
              {frame.type === 'track-list'
                ? (frame.hits as MelonTrackSearchHit[]).map((hit) => (
                    <Pressable
                      key={`${hit.songId}-${hit.name}`}
                      onPress={() => void openTrackDetail(hit.songId, hit.artist, hit.name, hit)}
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
                          {hit.album ? ` · ${hit.album}` : ''}
                        </Text>
                      </View>
                    </Pressable>
                  ))
                : null}
            </>
          ) : null}
        </>
      );
    };

    const renderArtistDetail = (frame: ArtistDetailFrame) => {
      if (frame.loading) {
        return <ActivityIndicator color={nrmTokens.color.primary} style={styles.loader} />;
      }
      if (frame.error) {
        return <Text style={[styles.error, { color: bodyColor }]}>{frame.error}</Text>;
      }
      if (!frame.detail) return null;
      const info = frame.detail.info;

      return (
        <>
          <View style={styles.heroRow}>
            <NrmLastfmCoverImage uri={info.imageUrl} size={120} />
            <View style={styles.heroMeta}>
              <Text style={[styles.heroTitle, { color: titleColor }]}>{info.name}</Text>
              {info.fanCount > 0 ? (
                <Text style={[styles.stat, { color: bodyColor }]}>
                  팬 {formatLastfmCount(info.fanCount)}
                </Text>
              ) : null}
            </View>
          </View>

          <MelonMetaGrid
            rows={artistMetaRows(info)}
            titleColor={titleColor}
            bodyColor={bodyColor}
            chipBg={chipBg}
          />

          {info.bioSummary ? (
            <>
              <NrmLastfmSectionTitle title="소개" color={titleColor} />
              <Text style={[styles.bio, { color: bodyColor }]}>{info.bioSummary}</Text>
            </>
          ) : null}

          {info.debutSong ? (
            <>
              <NrmLastfmSectionTitle title="데뷔곡" color={titleColor} />
              <Pressable
                onPress={() =>
                  void openTrackDetail(
                    info.debutSong!.songId,
                    info.name,
                    info.debutSong!.name,
                  )
                }
                style={({ pressed }) => [
                  styles.debutCard,
                  { backgroundColor: chipBg },
                  pressed && { opacity: 0.85 },
                ]}>
                <NrmLastfmCoverImage uri={info.debutSong.imageUrl} size={56} />
                <Text style={[styles.hitTitle, { color: titleColor, flex: 1 }]} numberOfLines={2}>
                  {info.debutSong.name}
                </Text>
              </Pressable>
            </>
          ) : null}

          {info.groupMembers.length > 0 ? (
            <>
              <NrmLastfmSectionTitle title="그룹 멤버" color={titleColor} />
              {info.groupMembers.map((m) => (
                <Pressable
                  key={m.artistId}
                  onPress={() =>
                    void openArtistDetail({
                      artistId: m.artistId,
                      name: m.name,
                      imageUrl: m.imageUrl,
                      genre: '',
                      profile: m.profile,
                      fanCount: 0,
                      url: '',
                    })
                  }
                  style={({ pressed }) => [
                    styles.hitRow,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <NrmLastfmCoverImage uri={m.imageUrl} size={44} />
                  <View style={styles.hitMeta}>
                    <Text style={[styles.hitTitle, { color: titleColor }]} numberOfLines={1}>
                      {m.name}
                    </Text>
                    {m.profile ? (
                      <Text style={[styles.hitSub, { color: bodyColor }]} numberOfLines={1}>
                        {m.profile}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              ))}
            </>
          ) : null}

          {frame.detail.popularTracks.length > 0 ? (
            <>
              <NrmLastfmSectionTitle title="인기 곡" color={titleColor} />
              {frame.detail.popularTracks.map((t) => (
                <Pressable
                  key={`${t.songId}-${t.rank}`}
                  onPress={() => void openTrackDetail(t.songId, t.artist || info.name, t.name)}
                  style={({ pressed }) => [
                    styles.hitRow,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <NrmLastfmCoverImage uri={t.imageUrl} size={44} />
                  <Text style={[styles.rank, { color: bodyColor }]}>{t.rank}</Text>
                  <View style={styles.hitMeta}>
                    <Text style={[styles.hitTitle, { color: titleColor }]} numberOfLines={1}>
                      {t.name}
                    </Text>
                    <Text style={[styles.hitSub, { color: bodyColor }]} numberOfLines={1}>
                      {t.album || info.name}
                      {t.likeCount > 0 ? ` · ♥ ${formatLastfmCount(t.likeCount)}` : ''}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </>
          ) : null}

          {frame.detail.popularAlbums.length > 0 ? (
            <>
              <NrmLastfmSectionTitle title="인기 앨범" color={titleColor} />
              {frame.detail.popularAlbums.map((al) => (
                <Pressable
                  key={`${al.albumId}-${al.name}`}
                  onPress={() => void openAlbumDetail(al.albumId, al.artist, al.name)}
                  style={({ pressed }) => [
                    styles.hitRow,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <NrmLastfmCoverImage uri={al.imageUrl} size={52} />
                  <View style={styles.hitMeta}>
                    <Text style={[styles.hitTitle, { color: titleColor }]} numberOfLines={1}>
                      {al.albumKind ? `[${al.albumKind}] ` : ''}
                      {al.name}
                    </Text>
                    <Text style={[styles.hitSub, { color: bodyColor }]} numberOfLines={1}>
                      {al.releaseDate}
                      {al.trackCount > 0 ? ` · ${al.trackCount}곡` : ''}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </>
          ) : null}

          {info.links.length > 0 ? (
            <>
              <NrmLastfmSectionTitle title="연관 정보" color={titleColor} />
              {info.links.map((link, i) =>
                link.snsItems && link.snsItems.length > 0 ? (
                  <View
                    key={`${link.label}-${i}`}
                    style={[styles.linkRow, { borderColor: chipBg }]}>
                    <Text style={[styles.linkLabel, { color: bodyColor }]}>{link.label}</Text>
                    {link.snsItems.map((item) => (
                      <Pressable
                        key={item.label}
                        onPress={() => void Linking.openURL(item.url)}
                        style={({ pressed }) => [styles.snsLine, pressed && { opacity: 0.85 }]}>
                        <Text style={[styles.snsLineText, { color: bodyColor }]}>
                          {item.label}
                          {' : '}
                          <Text style={{ color: nrmTokens.color.primary }}>{item.url}</Text>
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <Pressable
                    key={`${link.label}-${i}`}
                    onPress={() => link.url && void Linking.openURL(link.url)}
                    disabled={!link.url}
                    style={({ pressed }) => [
                      styles.linkRow,
                      { borderColor: chipBg },
                      pressed && link.url && { opacity: 0.85 },
                    ]}>
                    <Text style={[styles.linkLabel, { color: bodyColor }]}>{link.label}</Text>
                    <Text
                      style={[
                        styles.linkValue,
                        { color: link.url ? nrmTokens.color.primary : titleColor },
                      ]}
                      numberOfLines={2}>
                      {link.value}
                    </Text>
                  </Pressable>
                ),
              )}
            </>
          ) : null}
        </>
      );
    };

    const renderAlbumDetail = (frame: AlbumDetailFrame) => {
      if (frame.loading) {
        return <ActivityIndicator color={nrmTokens.color.primary} style={styles.loader} />;
      }
      if (frame.error) {
        return <Text style={[styles.error, { color: bodyColor }]}>{frame.error}</Text>;
      }
      if (!frame.detail) return null;
      const info = frame.detail.info;

      return (
        <>
          <View style={styles.heroRow}>
            <NrmLastfmCoverImage uri={info.imageUrl} size={120} />
            <View style={styles.heroMeta}>
              <Text style={[styles.heroTitle, { color: titleColor }]}>
                {info.albumKind ? `[${info.albumKind}] ` : ''}
                {info.name}
              </Text>
              <Pressable
                onPress={() =>
                  info.artistId
                    ? void openArtistDetail({
                        artistId: info.artistId,
                        name: info.artist,
                        imageUrl: info.imageUrl,
                        genre: info.genre,
                        profile: '',
                        fanCount: 0,
                        url: '',
                      })
                    : undefined
                }
                style={({ pressed }) => pressed && styles.pressedMeta}>
                <Text style={[styles.stat, { color: nrmTokens.color.primary }]}>{info.artist}</Text>
              </Pressable>
              {info.releaseDate ? (
                <Text style={[styles.stat, { color: bodyColor }]}>발매 {info.releaseDate}</Text>
              ) : null}
              {info.likeCount > 0 ? (
                <Text style={[styles.stat, { color: bodyColor }]}>
                  좋아요 {formatLastfmCount(info.likeCount)}
                </Text>
              ) : null}
              {info.trackCount > 0 ? (
                <Text style={[styles.stat, { color: bodyColor }]}>{info.trackCount}곡</Text>
              ) : null}
            </View>
          </View>

          <MelonMetaGrid
            rows={[
              { label: '장르', value: info.genre },
              { label: '발매사', value: info.label },
              { label: '기획사', value: info.agency },
            ]}
            titleColor={titleColor}
            bodyColor={bodyColor}
            chipBg={chipBg}
          />

          {info.description ? (
            <>
              <NrmLastfmSectionTitle title="앨범 소개" color={titleColor} />
              <Text style={[styles.bio, { color: bodyColor }]}>{info.description}</Text>
            </>
          ) : null}

          {info.tracks.length > 0 ? (
            <>
              <NrmLastfmSectionTitle title="수록곡" color={titleColor} />
              {info.tracks.map((t) => (
                <Pressable
                  key={t.songId}
                  onPress={() => void openTrackDetail(t.songId, t.artist || info.artist, t.name)}
                  style={({ pressed }) => [
                    styles.trackRow,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rank, { color: bodyColor }]}>{t.rank}</Text>
                  <View style={styles.hitMeta}>
                    <Text style={[styles.trackName, { color: titleColor }]} numberOfLines={1}>
                      {t.name}
                    </Text>
                    {t.artist && t.artist !== info.artist ? (
                      <Text style={[styles.hitSub, { color: bodyColor }]} numberOfLines={1}>
                        {t.artist}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              ))}
            </>
          ) : null}
        </>
      );
    };

    const renderTrackDetail = (frame: TrackDetailFrame) => {
      if (frame.loading) {
        return <ActivityIndicator color={nrmTokens.color.primary} style={styles.loader} />;
      }
      if (frame.error) {
        return <Text style={[styles.error, { color: bodyColor }]}>{frame.error}</Text>;
      }
      if (!frame.detail) return null;
      const detail = frame.detail;
      const info = detail.info;

      const metaFields: NrmLastfmMetaField[] = [
        { label: '트랙', value: info.name || frame.track },
        {
          label: '아티스트',
          value: info.artist || frame.artist,
          onPress: info.artistId
            ? () =>
                void openArtistDetail({
                  artistId: info.artistId,
                  name: info.artist,
                  imageUrl: info.imageUrl,
                  genre: info.genre,
                  profile: '',
                  fanCount: 0,
                  url: '',
                })
            : undefined,
        },
      ];
      if (info.album) {
        metaFields.push({
          label: '앨범',
          value: info.album,
          onPress: info.albumId
            ? () => void openAlbumDetail(info.albumId, info.artist, info.album)
            : undefined,
        });
      }
      if (info.releaseDate) metaFields.push({ label: '발매일', value: info.releaseDate });
      if (info.genre) metaFields.push({ label: '장르', value: info.genre });
      if (info.likeCount > 0) {
        metaFields.push({ label: '좋아요', value: formatLastfmCount(info.likeCount) });
      }

      return (
        <>
          <NrmLastfmDetailHeroCard
            imageUrl={info.imageUrl}
            fields={metaFields}
            isDark={isDark}
            titleColor={titleColor}
            onCardPress={() => goYoutubeFromTrack(detail, frame)}
          />

          {detail.albumDetail ? (
            <>
              <NrmLastfmSectionTitle title="앨범 정보" color={titleColor} />
              <Pressable
                onPress={() =>
                  void openAlbumDetail(
                    detail.albumDetail!.info.albumId,
                    detail.albumDetail!.info.artist,
                    detail.albumDetail!.info.name,
                  )
                }
                style={({ pressed }) => [
                  styles.albumCard,
                  { backgroundColor: chipBg },
                  pressed && { opacity: 0.85 },
                ]}>
                <NrmLastfmCoverImage uri={detail.albumDetail.info.imageUrl} size={72} />
                <View style={styles.hitMeta}>
                  <Text style={[styles.hitTitle, { color: titleColor }]} numberOfLines={2}>
                    {detail.albumDetail.info.albumKind
                      ? `[${detail.albumDetail.info.albumKind}] `
                      : ''}
                    {detail.albumDetail.info.name}
                  </Text>
                  <Text style={[styles.hitSub, { color: bodyColor }]} numberOfLines={1}>
                    {detail.albumDetail.info.artist}
                    {detail.albumDetail.info.releaseDate
                      ? ` · ${detail.albumDetail.info.releaseDate}`
                      : ''}
                  </Text>
                  {detail.albumDetail.info.genre ? (
                    <Text style={[styles.hitSub, { color: bodyColor }]} numberOfLines={1}>
                      {detail.albumDetail.info.genre}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
              {detail.albumDetail.info.tracks.length > 0 ? (
                <>
                  <NrmLastfmSectionTitle title="수록곡" color={titleColor} />
                  {detail.albumDetail.info.tracks.map((t) => {
                    const isCurrent = t.songId === info.songId;
                    return (
                      <Pressable
                        key={`${t.songId}-${t.rank}`}
                        onPress={() =>
                          void openTrackDetail(
                            t.songId,
                            t.artist || info.artist,
                            t.name,
                          )
                        }
                        style={({ pressed }) => [
                          styles.trackRow,
                          isCurrent && { backgroundColor: rowHover },
                          pressed && { backgroundColor: rowHover },
                        ]}>
                        <Text style={[styles.rank, { color: bodyColor }]}>{t.rank}</Text>
                        <Text
                          style={[
                            styles.trackName,
                            { color: isCurrent ? nrmTokens.color.primary : titleColor },
                          ]}
                          numberOfLines={1}>
                          {t.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </>
              ) : null}
            </>
          ) : null}

          {detail.similarTracks.length > 0 ? (
            <>
              <NrmLastfmSectionTitle title="스타일이 유사한 인기곡" color={titleColor} />
              {detail.similarTracks.map((t) => (
                <Pressable
                  key={`${t.songId}-${t.name}`}
                  onPress={() => void openTrackDetail(t.songId, t.artist, t.name)}
                  style={({ pressed }) => [
                    styles.hitRow,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <NrmLastfmCoverImage uri={t.imageUrl} size={44} />
                  <Text style={[styles.rank, { color: bodyColor }]}>{t.rank}</Text>
                  <View style={styles.hitMeta}>
                    <Text style={[styles.hitTitle, { color: titleColor }]} numberOfLines={1}>
                      {t.name}
                    </Text>
                    <Text style={[styles.hitSub, { color: bodyColor }]} numberOfLines={1}>
                      {t.artist}
                      {t.album ? ` · ${t.album}` : ''}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </>
          ) : null}
        </>
      );
    };

    return (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollInner,
          { paddingHorizontal },
          initialListCentered && styles.scrollInnerInitialCentered,
        ]}
        keyboardShouldPersistTaps="handled">
        <NrmFeatureScreenLogoHeader
          isDark={isDark}
          onPressHome={onBackToHome}
          compact={!initialListCentered}
        />
        {top.type === 'artist-list' ||
        top.type === 'album-list' ||
        top.type === 'track-list'
          ? renderList(top)
          : null}
        {top.type === 'artist-detail' ? renderArtistDetail(top) : null}
        {top.type === 'album-detail' ? renderAlbumDetail(top) : null}
        {top.type === 'track-detail' ? renderTrackDetail(top) : null}
      </ScrollView>
    );
  },
);

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollInner: {
    paddingBottom: nrmTokens.space.xxl,
    width: '100%',
    maxWidth: nrmTokens.layout.maxContentWidth,
    alignSelf: 'center',
  },
  scrollInnerInitialCentered: {
    flexGrow: 1,
    justifyContent: 'center',
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
  heroRow: {
    flexDirection: 'row',
    gap: nrmTokens.space.md,
    marginBottom: nrmTokens.space.md,
  },
  heroMeta: { flex: 1, minWidth: 0 },
  heroTitle: { fontSize: nrmTokens.font.lead, fontWeight: '700' },
  stat: { marginTop: 4, fontSize: nrmTokens.font.caption },
  bio: { fontSize: nrmTokens.font.caption, lineHeight: 20 },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.sm,
    paddingVertical: 6,
    borderRadius: nrmTokens.radius.sm,
  },
  trackName: { flex: 1, fontSize: nrmTokens.font.body },
  pressedMeta: { opacity: 0.85 },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: nrmTokens.space.sm,
    marginBottom: nrmTokens.space.md,
  },
  metaChip: {
    paddingHorizontal: nrmTokens.space.sm,
    paddingVertical: nrmTokens.space.xs,
    borderRadius: nrmTokens.radius.sm,
    minWidth: '45%',
    flexGrow: 1,
  },
  metaLabel: { fontSize: 11, marginBottom: 2 },
  metaValue: { fontSize: nrmTokens.font.caption, fontWeight: '600' },
  debutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.sm,
    padding: nrmTokens.space.sm,
    borderRadius: nrmTokens.radius.sm,
    marginBottom: nrmTokens.space.sm,
  },
  albumCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.sm,
    padding: nrmTokens.space.sm,
    borderRadius: nrmTokens.radius.sm,
    marginBottom: nrmTokens.space.sm,
  },
  linkRow: {
    paddingVertical: nrmTokens.space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  linkLabel: { fontSize: 11, marginBottom: 2 },
  linkValue: { fontSize: nrmTokens.font.caption, fontWeight: '500' },
  snsLine: { paddingVertical: 2 },
  snsLineText: { fontSize: nrmTokens.font.caption },
});
