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
  NrmLastfmDetailHeroCard,
  NrmLastfmSearchBar,
  NrmLastfmSectionTitle,
  NrmLastfmTagList,
  type NrmLastfmMetaField,
} from '@/components/nrm/search/NrmLastfmSearchUi';
import { nrmTokens } from '@/constants/nrmTokens';
import {
  fetchLastfmAlbumDetail,
  fetchLastfmArtistDetail,
  fetchLastfmTrackDetail,
  searchLastfmAlbums,
  searchLastfmArtists,
  searchLastfmTracks,
} from '@/lib/nrmLastfmSearchClient';
import type { LastfmAuthHandlers } from '@/lib/nrmLastfmAuthFlow';
import {
  isLastfmSearchAuthErrorCode,
  runLastfmAuthFlow,
} from '@/lib/nrmLastfmAuthFlow';
import { NrmLastfmSearchErrorView } from '@/components/nrm/search/NrmLastfmSearchErrorView';
import { splitLastfmSearchFailure } from '@/lib/nrmLastfmSearchUi';
import type {
  LastfmAlbumDetail,
  LastfmAlbumSearchHit,
  LastfmArtistDetail,
  LastfmArtistSearchHit,
  LastfmSearchErrorCode,
  LastfmTrackDetail,
  LastfmTrackSearchHit,
} from '@/lib/nrmLastfmSearchTypes';
import {
  nrmSearchEmptyQuery,
  nrmSearchNoResults,
} from '@/lib/nrmSearchStrings';
import { useNrmLastfmArtistImageLoader } from '@/lib/useNrmLastfmArtistImageLoader';

export type LastfmSearchKind = 'artist' | 'album' | 'track';

type ListFrame = {
  id: string;
  type: 'artist-list' | 'album-list' | 'track-list';
  query: string;
  hits: LastfmArtistSearchHit[] | LastfmAlbumSearchHit[] | LastfmTrackSearchHit[];
  searched: boolean;
  loading: boolean;
  error: string | null;
  errorCode?: LastfmSearchErrorCode | null;
};

type ArtistDetailFrame = {
  id: string;
  type: 'artist-detail';
  hit: LastfmArtistSearchHit;
  detail: LastfmArtistDetail | null;
  loading: boolean;
  error: string | null;
  errorCode?: LastfmSearchErrorCode | null;
};

type AlbumDetailFrame = {
  id: string;
  type: 'album-detail';
  artist: string;
  album: string;
  detail: LastfmAlbumDetail | null;
  loading: boolean;
  error: string | null;
  errorCode?: LastfmSearchErrorCode | null;
};

type TrackDetailFrame = {
  id: string;
  type: 'track-detail';
  artist: string;
  track: string;
  hit?: LastfmTrackSearchHit;
  detail: LastfmTrackDetail | null;
  loading: boolean;
  error: string | null;
  errorCode?: LastfmSearchErrorCode | null;
};

type Frame = ListFrame | ArtistDetailFrame | AlbumDetailFrame | TrackDetailFrame;

export type LastfmSearchRouterState = {
  stack: Frame[];
};

export type LastfmSearchNavHandle = {
  goBack: () => boolean;
  captureState: () => LastfmSearchRouterState;
  restoreState: (state: LastfmSearchRouterState) => void;
};

export type LastfmYoutubeNavigateParams = {
  artist: string;
  title: string;
  /** 트랙 MusicBrainz ID — UI 비표시 */
  mbid?: string;
  album?: string;
  genre?: string;
  releaseDate?: string;
  imageUrl?: string;
};

type Props = {
  initialKind: LastfmSearchKind;
  isDark: boolean;
  paddingHorizontal: number;
  onBackToHome: () => void;
  onNavigateYoutube: (params: LastfmYoutubeNavigateParams) => void;
  restoredState?: LastfmSearchRouterState | null;
  lastfmAuth: LastfmAuthHandlers;
};

let frameSeq = 0;
function nextFrameId(): string {
  frameSeq += 1;
  return `lf-${frameSeq}`;
}

function emptyListFrame(kind: LastfmSearchKind): ListFrame {
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

function listKindFromFrame(frame: ListFrame): LastfmSearchKind {
  if (frame.type === 'artist-list') return 'artist';
  if (frame.type === 'album-list') return 'album';
  return 'track';
}

export const NrmLastfmSearchRouter = forwardRef<LastfmSearchNavHandle, Props>(
  function NrmLastfmSearchRouter(
    {
      initialKind,
      isDark,
      paddingHorizontal,
      onBackToHome,
      onNavigateYoutube,
      restoredState,
      lastfmAuth,
    },
    ref,
  ) {
    const titleColor = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
    const bodyColor = isDark ? 'rgba(255,255,255,0.72)' : 'rgba(0,0,0,0.62)';
    const chipBg = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)';
    const rowHover = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';

    const [stack, setStack] = useState<Frame[]>(() =>
      restoredState?.stack?.length
        ? restoredState.stack
        : [emptyListFrame(initialKind)],
    );
    const reqRef = useRef(0);

    useEffect(() => {
      if (restoredState?.stack?.length) {
        setStack(restoredState.stack);
      }
    }, [restoredState]);

    const top = stack[stack.length - 1];
    const artistListFrame = top.type === 'artist-list' ? top : null;
    const { resolveImageUrl: resolveArtistImageUrl } = useNrmLastfmArtistImageLoader({
      hits: artistListFrame ? (artistListFrame.hits as LastfmArtistSearchHit[]) : [],
      generation: artistListFrame?.id ?? '',
      enabled: !!artistListFrame && artistListFrame.hits.length > 0,
    });
    const isTopList =
      top.type === 'artist-list' ||
      top.type === 'album-list' ||
      top.type === 'track-list';
    const initialListCentered =
      isTopList &&
      !top.searched &&
      !top.loading &&
      top.hits.length === 0 &&
      !top.error &&
      !top.errorCode;

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

    const withAuth = useCallback(
      <T extends { ok: boolean; errorCode?: LastfmSearchErrorCode }>(
        run: () => Promise<T>,
      ): Promise<T> =>
        runLastfmAuthFlow(
          run,
          (r) => !r.ok && isLastfmSearchAuthErrorCode(r.errorCode!),
          lastfmAuth,
        ),
      [lastfmAuth],
    );

    const runListSearch = useCallback(
      async (frame: ListFrame, queryOverride?: string) => {
        const q = (queryOverride ?? frame.query).trim();
        if (!q) {
          updateTop({ error: nrmSearchEmptyQuery } as Partial<ListFrame>);
          return;
        }
        const req = ++reqRef.current;
        updateTop({
          query: q,
          loading: true,
          error: null,
          searched: true,
        } as Partial<ListFrame>);

        let out;
        if (frame.type === 'artist-list') {
          out = await withAuth(() => searchLastfmArtists(q));
        } else if (frame.type === 'album-list') {
          out = await withAuth(() => searchLastfmAlbums(q));
        } else {
          out = await withAuth(() => searchLastfmTracks(q));
        }
        if (req !== reqRef.current) return;

        if (!out.ok) {
          const err = splitLastfmSearchFailure(out);
          updateTop({
            loading: false,
            hits: [],
            error: err.inlineError,
            errorCode: err.heroError,
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
          errorCode: null,
        } as Partial<ListFrame>);
      },
      [updateTop, withAuth],
    );

    const openArtistDetail = useCallback(
      async (hit: LastfmArtistSearchHit) => {
        const frame: ArtistDetailFrame = {
          id: nextFrameId(),
          type: 'artist-detail',
          hit,
          detail: null,
          loading: true,
          error: null,
        };
        pushFrame(frame);
        const req = ++reqRef.current;
        const out = await withAuth(() =>
          fetchLastfmArtistDetail(hit.name, hit.mbid || undefined),
        );
        if (req !== reqRef.current) return;
        setStack((s) => {
          const next = [...s];
          const cur = next[next.length - 1];
          if (cur.type !== 'artist-detail') return s;
          if (!out.ok) {
            const err = splitLastfmSearchFailure(out);
            next[next.length - 1] = {
              ...cur,
              loading: false,
              error: err.inlineError,
              errorCode: err.heroError,
            };
          } else {
            next[next.length - 1] = {
              ...cur,
              loading: false,
              detail: out.data,
            };
          }
          return next;
        });
      },
      [pushFrame, withAuth],
    );

    const openAlbumDetail = useCallback(
      async (artist: string, album: string) => {
        const frame: AlbumDetailFrame = {
          id: nextFrameId(),
          type: 'album-detail',
          artist,
          album,
          detail: null,
          loading: true,
          error: null,
        };
        pushFrame(frame);
        const req = ++reqRef.current;
        const out = await withAuth(() => fetchLastfmAlbumDetail(artist, album));
        if (req !== reqRef.current) return;
        setStack((s) => {
          const next = [...s];
          const cur = next[next.length - 1];
          if (cur.type !== 'album-detail') return s;
          if (!out.ok) {
            const err = splitLastfmSearchFailure(out);
            next[next.length - 1] = {
              ...cur,
              loading: false,
              error: err.inlineError,
              errorCode: err.heroError,
            };
          } else {
            next[next.length - 1] = {
              ...cur,
              loading: false,
              detail: out.data,
            };
          }
          return next;
        });
      },
      [pushFrame, withAuth],
    );

    const openTrackDetail = useCallback(
      async (artist: string, track: string, hit?: LastfmTrackSearchHit) => {
        const frame: TrackDetailFrame = {
          id: nextFrameId(),
          type: 'track-detail',
          artist,
          track,
          hit,
          detail: null,
          loading: true,
          error: null,
        };
        pushFrame(frame);
        const req = ++reqRef.current;
        const out = await withAuth(() => fetchLastfmTrackDetail(artist, track));
        if (req !== reqRef.current) return;
        setStack((s) => {
          const next = [...s];
          const cur = next[next.length - 1];
          if (cur.type !== 'track-detail') return s;
          if (!out.ok) {
            const err = splitLastfmSearchFailure(out);
            next[next.length - 1] = {
              ...cur,
              loading: false,
              error: err.inlineError,
              errorCode: err.heroError,
            };
          } else {
            next[next.length - 1] = {
              ...cur,
              loading: false,
              detail: out.data,
            };
          }
          return next;
        });
      },
      [pushFrame, withAuth],
    );

    const goYoutubeFromTrack = useCallback(
      (detail: LastfmTrackDetail) => {
        const info = detail.info;
        const genre = detail.tags
          .map((t) => t.name)
          .filter(Boolean)
          .slice(0, 3)
          .join(', ');
        onNavigateYoutube({
          artist: info.artist,
          title: info.name,
          mbid: info.mbid || undefined,
          album: info.album,
          genre,
          imageUrl: info.imageUrl,
        });
      },
      [onNavigateYoutube],
    );

    const renderList = (frame: ListFrame) => {
      const kind = listKindFromFrame(frame);
      const placeholder =
        kind === 'artist'
          ? '아티스트 이름'
          : kind === 'album'
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
          <NrmLastfmSearchErrorView
            errorCode={frame.errorCode ?? null}
            isDark={isDark}
            paddingHorizontal={0}
          />
          {frame.error ? (
            <Text style={[styles.error, { color: bodyColor }]}>{frame.error}</Text>
          ) : null}
          {frame.hits.length > 0 && !frame.errorCode ? (
            <>
              <NrmLastfmSectionTitle title="검색 결과" color={titleColor} />
              {frame.type === 'artist-list'
                ? (frame.hits as LastfmArtistSearchHit[]).map((hit) => (
                    <Pressable
                      key={`${hit.name}-${hit.mbid || hit.url}`}
                      onPress={() => void openArtistDetail(hit)}
                      style={({ pressed }) => [
                        styles.hitRow,
                        pressed && { backgroundColor: rowHover },
                      ]}>
                      <NrmLastfmCoverImage uri={resolveArtistImageUrl(hit)} size={52} />
                      <View style={styles.hitMeta}>
                        <Text
                          style={[styles.hitTitle, { color: titleColor }]}
                          numberOfLines={1}>
                          {hit.name}
                        </Text>
                        <Text style={[styles.hitSub, { color: bodyColor }]}>
                          청취자 {formatLastfmCount(hit.listeners)}
                        </Text>
                      </View>
                    </Pressable>
                  ))
                : null}
              {frame.type === 'album-list'
                ? (frame.hits as LastfmAlbumSearchHit[]).map((hit) => (
                    <Pressable
                      key={`${hit.artist}-${hit.name}-${hit.mbid || hit.url}`}
                      onPress={() => void openAlbumDetail(hit.artist, hit.name)}
                      style={({ pressed }) => [
                        styles.hitRow,
                        pressed && { backgroundColor: rowHover },
                      ]}>
                      <NrmLastfmCoverImage uri={hit.imageUrl} size={52} />
                      <View style={styles.hitMeta}>
                        <Text
                          style={[styles.hitTitle, { color: titleColor }]}
                          numberOfLines={1}>
                          {hit.name}
                        </Text>
                        <Text
                          style={[styles.hitSub, { color: bodyColor }]}
                          numberOfLines={1}>
                          {hit.artist}
                        </Text>
                      </View>
                    </Pressable>
                  ))
                : null}
              {frame.type === 'track-list'
                ? (frame.hits as LastfmTrackSearchHit[]).map((hit) => (
                    <Pressable
                      key={`${hit.artist}-${hit.name}-${hit.url}`}
                      onPress={() =>
                        void openTrackDetail(hit.artist, hit.name, hit)
                      }
                      style={({ pressed }) => [
                        styles.hitRow,
                        pressed && { backgroundColor: rowHover },
                      ]}>
                      <NrmLastfmCoverImage uri={hit.imageUrl} size={52} />
                      <View style={styles.hitMeta}>
                        <Text
                          style={[styles.hitTitle, { color: titleColor }]}
                          numberOfLines={1}>
                          {hit.name}
                        </Text>
                        <Text
                          style={[styles.hitSub, { color: bodyColor }]}
                          numberOfLines={1}>
                          {hit.artist}
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
        return (
          <ActivityIndicator color={nrmTokens.color.primary} style={styles.loader} />
        );
      }
      if (frame.errorCode) {
        return (
          <NrmLastfmSearchErrorView
            errorCode={frame.errorCode}
            isDark={isDark}
            paddingHorizontal={0}
          />
        );
      }
      if (frame.error) {
        return <Text style={[styles.error, { color: bodyColor }]}>{frame.error}</Text>;
      }
      if (!frame.detail) return null;
      const detail = frame.detail;
      return (
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
                onPress={() =>
                  void openArtistDetail({
                    name: a.name,
                    mbid: '',
                    url: '',
                    imageUrl: a.imageUrl,
                    listeners: 0,
                  })
                }
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
              onPress={() =>
                void openTrackDetail(t.artist || detail.info.name, t.name, {
                  name: t.name,
                  artist: t.artist || detail.info.name,
                  mbid: t.mbid,
                  url: t.url,
                  imageUrl: t.imageUrl,
                })
              }
              style={({ pressed }) => [
                styles.hitRow,
                pressed && { backgroundColor: rowHover },
              ]}>
              <Text style={[styles.rank, { color: bodyColor }]}>{t.rank}</Text>
              <View style={styles.hitMeta}>
                <Text
                  style={[styles.hitTitle, { color: titleColor }]}
                  numberOfLines={1}>
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
              onPress={() => void openAlbumDetail(al.artist, al.name)}
              style={({ pressed }) => [
                styles.hitRow,
                pressed && { backgroundColor: rowHover },
              ]}>
              <NrmLastfmCoverImage uri={al.imageUrl} size={44} />
              <View style={styles.hitMeta}>
                <Text
                  style={[styles.hitTitle, { color: titleColor }]}
                  numberOfLines={1}>
                  {al.name}
                </Text>
                <Text style={[styles.hitSub, { color: bodyColor }]}>
                  {al.artist} · 재생 {formatLastfmCount(al.playcount)}
                </Text>
              </View>
            </Pressable>
          ))}
        </>
      );
    };

    const renderAlbumDetail = (frame: AlbumDetailFrame) => {
      if (frame.loading) {
        return (
          <ActivityIndicator color={nrmTokens.color.primary} style={styles.loader} />
        );
      }
      if (frame.errorCode) {
        return (
          <NrmLastfmSearchErrorView
            errorCode={frame.errorCode}
            isDark={isDark}
            paddingHorizontal={0}
          />
        );
      }
      if (frame.error) {
        return <Text style={[styles.error, { color: bodyColor }]}>{frame.error}</Text>;
      }
      if (!frame.detail) return null;
      const detail = frame.detail;
      const artistName = detail.info.artist;
      return (
        <>
          <View style={styles.heroRow}>
            <NrmLastfmCoverImage uri={detail.info.imageUrl} size={120} />
            <View style={styles.heroMeta}>
              <Text style={[styles.heroTitle, { color: titleColor }]}>
                {detail.info.name}
              </Text>
              <Pressable
                onPress={() =>
                  void openArtistDetail({
                    name: artistName,
                    mbid: '',
                    url: '',
                    imageUrl: detail.info.imageUrl,
                    listeners: 0,
                  })
                }
                style={({ pressed }) => pressed && styles.pressedMeta}>
                <Text style={[styles.stat, { color: nrmTokens.color.primary }]}>
                  {artistName}
                </Text>
              </Pressable>
              {detail.info.published ? (
                <Text style={[styles.stat, { color: bodyColor }]}>
                  발매 {detail.info.published}
                </Text>
              ) : null}
              <Text style={[styles.stat, { color: bodyColor }]}>
                재생 {formatLastfmCount(detail.info.playcount)}
              </Text>
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
                <Pressable
                  key={`${t.rank}-${t.name}`}
                  onPress={() => void openTrackDetail(artistName, t.name)}
                  style={({ pressed }) => [
                    styles.trackRow,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rank, { color: bodyColor }]}>{t.rank}</Text>
                  <Text
                    style={[styles.trackName, { color: titleColor }]}
                    numberOfLines={1}>
                    {t.name}
                  </Text>
                  <Text style={[styles.dur, { color: bodyColor }]}>
                    {formatLastfmDuration(t.durationSec)}
                  </Text>
                </Pressable>
              ))}
            </>
          ) : null}
        </>
      );
    };

    const renderTrackDetail = (frame: TrackDetailFrame) => {
      if (frame.loading) {
        return (
          <ActivityIndicator color={nrmTokens.color.primary} style={styles.loader} />
        );
      }
      if (frame.errorCode) {
        return (
          <NrmLastfmSearchErrorView
            errorCode={frame.errorCode}
            isDark={isDark}
            paddingHorizontal={0}
          />
        );
      }
      if (frame.error) {
        return <Text style={[styles.error, { color: bodyColor }]}>{frame.error}</Text>;
      }
      if (!frame.detail) return null;
      const detail = frame.detail;
      const info = detail.info;
      const metaFields: NrmLastfmMetaField[] = [
        { label: '트랙', value: info.name },
        { label: '아티스트', value: info.artist },
      ];
      if (info.album) {
        metaFields.push({ label: '앨범', value: info.album });
      }
      metaFields.push(
        { label: '길이', value: formatLastfmDuration(info.durationSec) },
        { label: '재생', value: formatLastfmCount(info.playcount) },
        { label: '청취자', value: formatLastfmCount(info.listeners) },
      );

      return (
        <>
          <NrmLastfmDetailHeroCard
            imageUrl={info.imageUrl}
            fields={metaFields}
            isDark={isDark}
            titleColor={titleColor}
            onCardPress={() => goYoutubeFromTrack(detail)}
          />
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
                  void openTrackDetail(t.artist, t.name, {
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
                <Text style={[styles.rank, { color: bodyColor }]}>{t.rank}</Text>
                <View style={styles.hitMeta}>
                  <Text
                    style={[styles.hitTitle, { color: titleColor }]}
                    numberOfLines={1}>
                    {t.name}
                  </Text>
                  <Text
                    style={[styles.hitSub, { color: bodyColor }]}
                    numberOfLines={1}>
                    {t.artist}
                  </Text>
                </View>
              </Pressable>
            ))
          )}
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
  badge: { marginTop: 4, fontSize: nrmTokens.font.caption, fontWeight: '700' },
  stat: { marginTop: 4, fontSize: nrmTokens.font.caption },
  bio: { fontSize: nrmTokens.font.caption, lineHeight: 20 },
  empty: { fontSize: nrmTokens.font.caption },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.sm,
    paddingVertical: 6,
    borderRadius: nrmTokens.radius.sm,
  },
  trackName: { flex: 1, fontSize: nrmTokens.font.body },
  dur: { fontSize: nrmTokens.font.caption, minWidth: 40, textAlign: 'right' },
  pressedMeta: { opacity: 0.85 },
});
