import { StatusBar } from 'expo-status-bar';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {

  Animated,
  BackHandler,

  KeyboardAvoidingView,

  Platform,

  ScrollView,

  StyleSheet,
  Text,

  useWindowDimensions,

  View,

} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';



import { NrmAppleMusicChartsHome } from '@/components/nrm/charts/NrmAppleMusicChartsHome';
import { NrmMelonChartsHome } from '@/components/nrm/charts/NrmMelonChartsHome';
import { NrmMelonGenreChartsHome } from '@/components/nrm/charts/NrmMelonGenreChartsHome';
import { NrmLastfmChartsHome } from '@/components/nrm/charts/NrmLastfmChartsHome';
import { NrmPeriodChartsHome } from '@/components/nrm/charts/NrmPeriodChartsHome';
import { NrmSpotifyChartsHome } from '@/components/nrm/charts/NrmSpotifyChartsHome';
import { NrmLastfmApiAuthModal } from '@/components/nrm/NrmLastfmApiAuthModal';
import { NrmSpotifyChartsLoginModal } from '@/components/nrm/settings/NrmSpotifyChartsLoginModal';
import { NrmSpotifyChartsSilentCapture } from '@/components/nrm/settings/NrmSpotifyChartsSilentCapture';
import {
  NrmLastfmSearchRouter,
  type LastfmSearchKind,
  type LastfmSearchNavHandle,
  type LastfmSearchRouterState,
  type LastfmYoutubeNavigateParams,
} from '@/components/nrm/search/NrmLastfmSearchRouter';
import { lastfmFieldsToChartTrack } from '@/lib/nrmLastfmDownloadMetadata';
import { NrmSpotifyAlbumSearchHome } from '@/components/nrm/search/NrmSpotifyAlbumSearchHome';
import { NrmSpotifyArtistSearchHome } from '@/components/nrm/search/NrmSpotifyArtistSearchHome';
import { NrmSpotifyTrackSearchHome } from '@/components/nrm/search/NrmSpotifyTrackSearchHome';

import { NrmAppMenu, type NrmAppMenuHandle } from '@/components/nrm/NrmAppMenu';
import { setupNrmMobileDownloadNotifications } from '@/lib/nrmMobileDownloadNotifications';

import { NrmLogo } from '@/components/nrm/NrmLogo';

import { NrmYoutubeHome } from '@/components/nrm/NrmYoutubeHome';

import { nrmTokens } from '@/constants/nrmTokens';

import { useNrmUiAppearance } from '@/context/NrmUiAppearanceContext';

import { getNrmRootBackgroundColor } from '@/lib/nrmUiAppearanceColors';
import { saveSpotifyChartsSession } from '@/lib/nrmSpotifyChartsSession';
import type { ChartErrorCode } from '@/lib/nrmChartErrors';
import type { ChartTrackItem } from '@/lib/nrmChartsTypes';
import type { LastfmAuthHandlers } from '@/lib/nrmLastfmAuthFlow';
import type { LastfmSearchErrorCode } from '@/lib/nrmLastfmSearchTypes';



const LOGO_TOP_FRAC = 0.1;



type MainView =
  | 'youtube'
  | 'appleMusicCharts'
  | 'spotifyChartsOfficial'
  | 'spotifyChartsCharts'
  | 'lastfmCharts'
  | 'melonCharts'
  | 'periodLastfmCharts'
  | 'periodSpotifyCharts'
  | 'genreCharts'
  | 'spotifySearchArtist'
  | 'spotifySearchAlbum'
  | 'spotifySearchTrack'
  | 'lastfmSearchArtist'
  | 'lastfmSearchAlbum'
  | 'lastfmSearchTrack';

type ChartView = Exclude<
  MainView,
  | 'youtube'
  | 'spotifySearchArtist'
  | 'spotifySearchAlbum'
  | 'spotifySearchTrack'
  | 'lastfmSearchArtist'
  | 'lastfmSearchAlbum'
  | 'lastfmSearchTrack'
>;

function formatYoutubeDisplayQuery(artist?: string | null, title?: string | null): string {
  const a = (artist ?? '').trim();
  const t = (title ?? '').trim();
  if (a && t) return `${a} - ${t}`;
  return t || a;
}



export default function HomeScreen() {

  const { isDark } = useNrmUiAppearance();

  const { width, height: winH } = useWindowDimensions();

  const [mainView, setMainView] = useState<MainView>('youtube');

  const [layoutPhase, setLayoutPhase] = useState<'welcome' | 'browsing'>(

    'welcome',

  );

  const [homeEpoch, setHomeEpoch] = useState(0);
  const [searchViewEpoch, setSearchViewEpoch] = useState(0);
  const [easterVisible, setEasterVisible] = useState(false);
  const easterOpacity = useRef(new Animated.Value(0)).current;
  const logoTapCountRef = useRef(0);
  const easterHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 차트 아이템 클릭으로 youtube 검색 화면으로 왔을 때 복귀할 차트 뷰 */
  const [chartReturnView, setChartReturnView] = useState<ChartView | null>(null);
  /** 차트 아이템 클릭으로 전달된 초기 검색 쿼리 */
  const [chartSearchQuery, setChartSearchQuery] = useState<string | undefined>(undefined);
  const [chartDownloadTrack, setChartDownloadTrack] =
    useState<ChartTrackItem | null>(null);
  const [chartDownloadSource, setChartDownloadSource] = useState<
    'chart' | 'lastfm' | null
  >(null);
  /** Last.fm 검색 → 유튜브 복귀용 */
  const [searchReturnView, setSearchReturnView] = useState<MainView | null>(null);
  const [lastfmNavSnapshot, setLastfmNavSnapshot] =
    useState<LastfmSearchRouterState | null>(null);
  const [lastfmNavRestore, setLastfmNavRestore] =
    useState<LastfmSearchRouterState | null>(null);
  const lastfmNavRef = useRef<LastfmSearchNavHandle>(null);
  const [chartsBearerModalOpen, setChartsBearerModalOpen] = useState(false);
  const [chartsBearerModalExpired, setChartsBearerModalExpired] = useState(false);
  const [silentCaptureActive, setSilentCaptureActive] = useState(false);
  const [lastfmAuthModalOpen, setLastfmAuthModalOpen] = useState(false);
  const [lastfmAuthModalErrorCode, setLastfmAuthModalErrorCode] = useState<
    ChartErrorCode | LastfmSearchErrorCode
  >('auth_failed');
  const chartsBearerRenewResolver = useRef<((ok: boolean) => void) | null>(null);
  const menuRef = useRef<NrmAppMenuHandle>(null);
  const titleColor = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
  const bodyColor = isDark ? nrmTokens.color.textMuted : nrmTokens.color.inkMuted80;



  const pad = width >= 900 ? nrmTokens.space.xxl : nrmTokens.space.lg;

  const logoPadTop = Math.max(0, winH * LOGO_TOP_FRAC);

  const rootBackground = getNrmRootBackgroundColor(isDark);

  const isWelcome = layoutPhase === 'welcome';

  const isAppleMusicCharts = mainView === 'appleMusicCharts';
  const isSpotifyChartsOfficial = mainView === 'spotifyChartsOfficial';
  const isSpotifyChartsCharts = mainView === 'spotifyChartsCharts';
  const isLastfmCharts = mainView === 'lastfmCharts';
  const isMelonCharts = mainView === 'melonCharts';
  const isPeriodLastfmCharts = mainView === 'periodLastfmCharts';
  const isPeriodSpotifyCharts = mainView === 'periodSpotifyCharts';
  const isGenreCharts = mainView === 'genreCharts';
  const isSpotifySearchArtist = mainView === 'spotifySearchArtist';
  const isSpotifySearchAlbum = mainView === 'spotifySearchAlbum';
  const isSpotifySearchTrack = mainView === 'spotifySearchTrack';
  const isSpotifySearchView =
    isSpotifySearchArtist || isSpotifySearchAlbum || isSpotifySearchTrack;
  const isLastfmSearchArtist = mainView === 'lastfmSearchArtist';
  const isLastfmSearchAlbum = mainView === 'lastfmSearchAlbum';
  const isLastfmSearchTrack = mainView === 'lastfmSearchTrack';
  const isLastfmSearchView =
    isLastfmSearchArtist || isLastfmSearchAlbum || isLastfmSearchTrack;
  const isChartsView =
    isAppleMusicCharts ||
    isSpotifyChartsOfficial ||
    isSpotifyChartsCharts ||
    isLastfmCharts ||
    isMelonCharts ||
    isPeriodLastfmCharts ||
    isPeriodSpotifyCharts ||
    isGenreCharts;
  const isFullScreenFeature =
    isChartsView || isSpotifySearchView || isLastfmSearchView;



  const resetToYoutubeHome = useCallback(() => {

    setMainView('youtube');

    setLayoutPhase('welcome');

    setHomeEpoch((v) => v + 1);
    setChartReturnView(null);
    setChartSearchQuery(undefined);
    setChartDownloadTrack(null);
    setChartDownloadSource(null);
    setSearchReturnView(null);
    setLastfmNavRestore(null);

  }, []);

  /** 차트 아이템 클릭: 유튜브 검색으로 이동하고 이전 차트 뷰를 저장 */
  const navigateToSearchFromChart = useCallback(
    (item: ChartTrackItem, source: 'chart' | 'lastfm' = 'chart') => {
      const q = formatYoutubeDisplayQuery(item.artists, item.title);
      if (!q) return;
      setChartReturnView(mainView as ChartView);
      setChartSearchQuery(q);
      setChartDownloadTrack(item);
      setChartDownloadSource(source);
      setMainView('youtube');
      setLayoutPhase('browsing');
      setHomeEpoch((v) => v + 1);
    },
    [mainView],
  );



  const onMainLogoPress = useCallback(() => {
    logoTapCountRef.current += 1;
    if (logoTapCountRef.current >= 10) {
      logoTapCountRef.current = 0;
      if (easterHoldTimerRef.current) {
        clearTimeout(easterHoldTimerRef.current);
        easterHoldTimerRef.current = null;
      }
      setEasterVisible(true);
      easterOpacity.setValue(1);
      easterHoldTimerRef.current = setTimeout(() => {
        Animated.timing(easterOpacity, {
          toValue: 0,
          duration: 420,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) setEasterVisible(false);
        });
      }, 1000);
    }

    resetToYoutubeHome();

  }, [easterOpacity, resetToYoutubeHome]);

  useEffect(() => {
    return () => {
      if (easterHoldTimerRef.current) {
        clearTimeout(easterHoldTimerRef.current);
      }
    };
  }, []);



  const openAppleMusicCharts = useCallback(() => {
    setMainView('appleMusicCharts');
    setLayoutPhase('browsing');
  }, []);

  const openSpotifyChartsOfficial = useCallback(() => {
    setMainView('spotifyChartsOfficial');
    setLayoutPhase('browsing');
  }, []);

  const openSpotifyChartsCharts = useCallback(() => {
    setMainView('spotifyChartsCharts');
    setLayoutPhase('browsing');
  }, []);

  const openLastfmCharts = useCallback(() => {
    setMainView('lastfmCharts');
    setLayoutPhase('browsing');
  }, []);

  const openMelonCharts = useCallback(() => {
    setMainView('melonCharts');
    setLayoutPhase('browsing');
  }, []);

  const openPeriodLastfmCharts = useCallback(() => {
    setMainView('periodLastfmCharts');
    setLayoutPhase('browsing');
  }, []);

  const openPeriodSpotifyCharts = useCallback(() => {
    setMainView('periodSpotifyCharts');
    setLayoutPhase('browsing');
  }, []);

  const openGenreCharts = useCallback(() => {
    setMainView('genreCharts');
    setLayoutPhase('browsing');
  }, []);

  const openSpotifyArtistSearch = useCallback(() => {
    setSearchViewEpoch((v) => v + 1);
    setChartReturnView(null);
    setChartSearchQuery(undefined);
    setChartDownloadTrack(null);
    setChartDownloadSource(null);
    setMainView('spotifySearchArtist');
    setLayoutPhase('browsing');
  }, []);

  const openSpotifyAlbumSearch = useCallback(() => {
    setSearchViewEpoch((v) => v + 1);
    setChartReturnView(null);
    setChartSearchQuery(undefined);
    setChartDownloadTrack(null);
    setChartDownloadSource(null);
    setMainView('spotifySearchAlbum');
    setLayoutPhase('browsing');
  }, []);

  const openSpotifyTrackSearch = useCallback(() => {
    setSearchViewEpoch((v) => v + 1);
    setChartReturnView(null);
    setChartSearchQuery(undefined);
    setChartDownloadTrack(null);
    setChartDownloadSource(null);
    setMainView('spotifySearchTrack');
    setLayoutPhase('browsing');
  }, []);

  const openLastfmSearch = useCallback((kind: LastfmSearchKind) => {
    setSearchViewEpoch((v) => v + 1);
    setChartReturnView(null);
    setChartSearchQuery(undefined);
    setChartDownloadTrack(null);
    setChartDownloadSource(null);
    setLastfmNavRestore(null);
    setLastfmNavSnapshot(null);
    setSearchReturnView(null);
    const view: MainView =
      kind === 'artist'
        ? 'lastfmSearchArtist'
        : kind === 'album'
          ? 'lastfmSearchAlbum'
          : 'lastfmSearchTrack';
    setMainView(view);
    setLayoutPhase('browsing');
  }, []);

  const openLastfmArtistSearch = useCallback(
    () => openLastfmSearch('artist'),
    [openLastfmSearch],
  );
  const openLastfmAlbumSearch = useCallback(
    () => openLastfmSearch('album'),
    [openLastfmSearch],
  );
  const openLastfmTrackSearch = useCallback(
    () => openLastfmSearch('track'),
    [openLastfmSearch],
  );

  const navigateToYoutubeFromLastfm = useCallback(
    (params: LastfmYoutubeNavigateParams) => {
      const artist = params.artist.trim();
      const title = params.title.trim();
      if (!artist && !title) return;
      const displayQ = formatYoutubeDisplayQuery(artist, title);
      setSearchReturnView(mainView);
      setLastfmNavSnapshot(lastfmNavRef.current?.captureState() ?? null);
      setChartSearchQuery(displayQ);
      setChartDownloadTrack(
        lastfmFieldsToChartTrack({
          artist,
          title,
          mbid: params.mbid,
          album: params.album,
          genre: params.genre,
          releaseDate: params.releaseDate,
          imageUrl: params.imageUrl,
        }),
      );
      setChartDownloadSource('lastfm');
      setMainView('youtube');
      setLayoutPhase('browsing');
      setHomeEpoch((v) => v + 1);
    },
    [mainView],
  );

  const openChartsSessionSettings = useCallback(() => {
    menuRef.current?.openChartsSession();
  }, []);

  const renewChartsBearerViaWebView = useCallback((): Promise<boolean> => {
    if (Platform.OS === 'web') {
      return Promise.resolve(false);
    }
    if (Platform.OS === 'android') {
      return new Promise((resolve) => {
        chartsBearerRenewResolver.current = resolve;
        setChartsBearerModalExpired(false);
        setSilentCaptureActive(true);
      });
    }
    return new Promise((resolve) => {
      chartsBearerRenewResolver.current = resolve;
      setChartsBearerModalExpired(false);
      setChartsBearerModalOpen(true);
    });
  }, []);

  const showChartsBearerExpiredOverlay = useCallback(() => {
    setChartsBearerModalExpired(true);
    setChartsBearerModalOpen(true);
  }, []);

  const openLastfmTokenSettings = useCallback(() => {
    menuRef.current?.openLastfmTokenSettings();
  }, []);

  const showLastfmAuthInvalidOverlay = useCallback(
    (code: ChartErrorCode | LastfmSearchErrorCode = 'auth_failed') => {
      const modalCode =
        code === 'not_configured' ? 'not_configured' : 'auth_failed';
      setLastfmAuthModalErrorCode(modalCode);
      setLastfmAuthModalOpen(true);
    },
    [],
  );

  const lastfmAuthHandlers = useMemo<LastfmAuthHandlers>(
    () => ({
      onOpenLastfmTokenSettings: openLastfmTokenSettings,
      ...(Platform.OS !== 'web'
        ? { onShowAuthInvalid: showLastfmAuthInvalidOverlay }
        : {}),
    }),
    [openLastfmTokenSettings, showLastfmAuthInvalidOverlay],
  );

  const closeLastfmAuthModal = useCallback(() => {
    setLastfmAuthModalOpen(false);
  }, []);

  const onLastfmAuthModalOpenSettings = useCallback(() => {
    setLastfmAuthModalOpen(false);
    openLastfmTokenSettings();
  }, [openLastfmTokenSettings]);

  const onSilentCaptured = useCallback(
    async (bearerToken: string) => {
      setSilentCaptureActive(false);
      if (!bearerToken) {
        setChartsBearerModalOpen(true);
        return;
      }
      await saveSpotifyChartsSession({ bearerToken });
      const resolve = chartsBearerRenewResolver.current;
      chartsBearerRenewResolver.current = null;
      resolve?.(true);
    },
    [],
  );

  const onSilentNeedsLogin = useCallback(() => {
    setSilentCaptureActive(false);
    setChartsBearerModalOpen(true);
  }, []);

  const closeChartsBearerModal = useCallback((ok: boolean) => {
    setChartsBearerModalOpen(false);
    setChartsBearerModalExpired(false);
    const resolve = chartsBearerRenewResolver.current;
    chartsBearerRenewResolver.current = null;
    resolve?.(ok);
  }, []);

  const onChartsBearerCapturedFromRenew = useCallback(
    async (payload: { bearerToken?: string }) => {
      const token = (payload.bearerToken ?? '').trim();
      if (!token) {
        closeChartsBearerModal(false);
        return;
      }
      await saveSpotifyChartsSession({ bearerToken: token });
      const resolve = chartsBearerRenewResolver.current;
      closeChartsBearerModal(resolve ? true : false);
      if (resolve) {
        resolve(true);
        chartsBearerRenewResolver.current = null;
      }
    },
    [closeChartsBearerModal],
  );

  useEffect(() => {
    if (Platform.OS !== 'web') void setupNrmMobileDownloadNotifications();
  }, []);

  useEffect(() => {

    if (Platform.OS !== 'android') return;

    const sub = BackHandler.addEventListener('hardwareBackPress', () => {

      if (isLastfmSearchView) {
        if (lastfmNavRef.current?.goBack()) return true;
        resetToYoutubeHome();
        return true;
      }

      if (isFullScreenFeature) {
        resetToYoutubeHome();
        return true;
      }

      // Last.fm 검색 → 유튜브 복귀
      if (mainView === 'youtube' && searchReturnView) {
        const snap = lastfmNavSnapshot;
        setMainView(searchReturnView);
        setLayoutPhase('browsing');
        setChartSearchQuery(undefined);
        setChartDownloadTrack(null);
        setChartDownloadSource(null);
        setSearchReturnView(null);
        setLastfmNavSnapshot(null);
        setLastfmNavRestore(snap);
        return true;
      }

      // 차트에서 검색으로 이동했다면 뒤로가기 시 해당 차트로 복귀
      if (mainView === 'youtube' && chartReturnView) {
        setMainView(chartReturnView);
        setLayoutPhase('browsing');
        setChartReturnView(null);
        setChartSearchQuery(undefined);
        setChartDownloadTrack(null);
        setChartDownloadSource(null);
        return true;
      }

      if (layoutPhase !== 'welcome') {

        resetToYoutubeHome();

        return true;

      }

      return false;

    });

    return () => sub.remove();

  }, [
    isFullScreenFeature,
    isLastfmSearchView,
    layoutPhase,
    resetToYoutubeHome,
    mainView,
    chartReturnView,
    searchReturnView,
    lastfmNavSnapshot,
  ]);

  useEffect(() => {
    if (isLastfmSearchView && lastfmNavRestore) {
      const id = setTimeout(() => setLastfmNavRestore(null), 0);
      return () => clearTimeout(id);
    }
  }, [isLastfmSearchView, lastfmNavRestore]);



  return (

    <View style={[styles.rootBg, { backgroundColor: rootBackground }]}>

      <StatusBar style={isDark ? 'light' : 'dark'} />

      <SafeAreaView

        style={[styles.safe, { backgroundColor: rootBackground }]}

        edges={['top', 'bottom']}>

        {isAppleMusicCharts ? (
          <NrmAppleMusicChartsHome
            isDark={isDark}
            paddingHorizontal={pad}
            onBackToHome={resetToYoutubeHome}
            onTrackPress={navigateToSearchFromChart}
          />
        ) : isSpotifyChartsOfficial ? (
          <NrmSpotifyChartsHome
            isDark={isDark}
            paddingHorizontal={pad}
            chartSource="official"
            onBackToHome={resetToYoutubeHome}
            onTrackPress={navigateToSearchFromChart}
          />
        ) : isSpotifyChartsCharts ? (
          <NrmSpotifyChartsHome
            isDark={isDark}
            paddingHorizontal={pad}
            chartSource="charts"
            onBackToHome={resetToYoutubeHome}
            onOpenChartsSession={openChartsSessionSettings}
            onRenewChartsBearer={renewChartsBearerViaWebView}
            onShowBearerExpired={showChartsBearerExpiredOverlay}
            onTrackPress={navigateToSearchFromChart}
          />
        ) : isLastfmCharts ? (
          <NrmLastfmChartsHome
            isDark={isDark}
            paddingHorizontal={pad}
            onBackToHome={resetToYoutubeHome}
            onTrackPress={(item) => navigateToSearchFromChart(item, 'lastfm')}
            lastfmAuth={lastfmAuthHandlers}
          />
        ) : isMelonCharts ? (
          <NrmMelonChartsHome
            isDark={isDark}
            paddingHorizontal={pad}
            onBackToHome={resetToYoutubeHome}
            onTrackPress={navigateToSearchFromChart}
          />
        ) : isPeriodLastfmCharts ? (
          <NrmPeriodChartsHome
            platform="lastfm"
            isDark={isDark}
            paddingHorizontal={pad}
            onBackToHome={resetToYoutubeHome}
            onTrackPress={(item) => navigateToSearchFromChart(item, 'lastfm')}
            lastfmAuth={lastfmAuthHandlers}
          />
        ) : isPeriodSpotifyCharts ? (
          <NrmPeriodChartsHome
            platform="spotify"
            isDark={isDark}
            paddingHorizontal={pad}
            onBackToHome={resetToYoutubeHome}
            onTrackPress={navigateToSearchFromChart}
            onOpenChartsSession={openChartsSessionSettings}
            onRenewChartsBearer={renewChartsBearerViaWebView}
            onShowBearerExpired={showChartsBearerExpiredOverlay}
          />
        ) : isGenreCharts ? (
          <NrmMelonGenreChartsHome
            isDark={isDark}
            paddingHorizontal={pad}
            onBackToHome={resetToYoutubeHome}
            onTrackPress={navigateToSearchFromChart}
          />
        ) : isSpotifySearchArtist ? (
          <NrmSpotifyArtistSearchHome
            key={`spotify-artist-${searchViewEpoch}`}
            isDark={isDark}
            paddingHorizontal={pad}
            onBackToHome={resetToYoutubeHome}
          />
        ) : isSpotifySearchAlbum ? (
          <NrmSpotifyAlbumSearchHome
            key={`spotify-album-${searchViewEpoch}`}
            isDark={isDark}
            paddingHorizontal={pad}
            onBackToHome={resetToYoutubeHome}
          />
        ) : isSpotifySearchTrack ? (
          <NrmSpotifyTrackSearchHome
            key={`spotify-track-${searchViewEpoch}`}
            isDark={isDark}
            paddingHorizontal={pad}
            onBackToHome={resetToYoutubeHome}
          />
        ) : isLastfmSearchView ? (
          <NrmLastfmSearchRouter
            key={`lastfm-${mainView}-${searchViewEpoch}`}
            ref={lastfmNavRef}
            initialKind={
              isLastfmSearchArtist
                ? 'artist'
                : isLastfmSearchAlbum
                  ? 'album'
                  : 'track'
            }
            restoredState={lastfmNavRestore}
            isDark={isDark}
            paddingHorizontal={pad}
            onBackToHome={resetToYoutubeHome}
            onNavigateYoutube={navigateToYoutubeFromLastfm}
            lastfmAuth={lastfmAuthHandlers}
          />
        ) : (

          <KeyboardAvoidingView

            style={styles.keyboardAvoid}

            behavior={Platform.OS === 'ios' ? 'padding' : undefined}

            enabled>

            <ScrollView

              style={styles.scroll}

              contentContainerStyle={[

                styles.scrollInner,

                {

                  flexGrow: 1,

                  justifyContent: isWelcome ? 'center' : 'flex-start',

                  paddingHorizontal: pad,

                  paddingBottom: nrmTokens.space.xl,

                  ...(Platform.OS === 'web' && isWelcome

                    ? { minHeight: winH }

                    : {}),

                },

              ]}

              keyboardShouldPersistTaps="always"

              keyboardDismissMode={

                Platform.OS === 'ios' ? 'on-drag' : 'none'

              }

              {...(Platform.OS === 'ios'

                ? { contentInsetAdjustmentBehavior: 'never' as const }

                : {})}>

              <View style={styles.centerColumn}>

                <View

                  style={[

                    styles.logoWrap,

                    isWelcome

                      ? styles.logoWrapWelcome

                      : [styles.logoWrapBrowsing, { paddingTop: logoPadTop }],

                  ]}>

                  <NrmLogo

                    tone={isDark ? 'dark' : 'light'}

                    onPress={onMainLogoPress}

                  />

                </View>

                <NrmYoutubeHome

                  key={homeEpoch}

                  isDark={isDark}

                  phase={layoutPhase}

                  onSearchCommitted={() => setLayoutPhase('browsing')}

                  initialQuery={chartSearchQuery}
                  chartDownloadTrack={chartDownloadTrack}
                  chartDownloadSource={chartDownloadSource}
                  downloadMetadataAuth={{
                    ...lastfmAuthHandlers,
                    onOpenSpotifyTokenSettings: () =>
                      menuRef.current?.openSpotifyTokenSettings(),
                  }}

                />

              </View>

            </ScrollView>

          </KeyboardAvoidingView>

        )}

        <NrmAppMenu
          ref={menuRef}
          isDark={isDark}

          paddingHorizontal={pad}

          onNavigateAppleMusicCharts={openAppleMusicCharts}
          onNavigateSpotifyChartsOfficial={openSpotifyChartsOfficial}
          onNavigateSpotifyChartsCharts={openSpotifyChartsCharts}
          onNavigateLastfmCharts={openLastfmCharts}
          onNavigateMelonCharts={openMelonCharts}
          onNavigatePeriodLastfmCharts={openPeriodLastfmCharts}
          onNavigatePeriodSpotifyCharts={openPeriodSpotifyCharts}
          onNavigateGenreCharts={openGenreCharts}
          onNavigateSpotifyArtistSearch={openSpotifyArtistSearch}
          onNavigateSpotifyAlbumSearch={openSpotifyAlbumSearch}
          onNavigateSpotifyTrackSearch={openSpotifyTrackSearch}
          onNavigateLastfmArtistSearch={openLastfmArtistSearch}
          onNavigateLastfmAlbumSearch={openLastfmAlbumSearch}
          onNavigateLastfmTrackSearch={openLastfmTrackSearch}
          onRequestChartsBearerWebView={renewChartsBearerViaWebView}
          onShowLastfmAuthInvalid={showLastfmAuthInvalidOverlay}
        />

        {easterVisible ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.easterEggOverlay,
              {
                opacity: easterOpacity,
                backgroundColor: isDark
                  ? 'rgba(18,18,20,0.84)'
                  : 'rgba(255,255,255,0.84)',
              },
            ]}>
            <Text
              style={[
                styles.easterEggText,
                { color: isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink },
              ]}>
              Made by hsyoon
            </Text>
          </Animated.View>
        ) : null}

        {Platform.OS !== 'web' ? (
          <>
            {Platform.OS === 'android' ? (
              <NrmSpotifyChartsSilentCapture
                active={silentCaptureActive}
                onCaptured={(token) => void onSilentCaptured(token)}
                onNeedsLogin={onSilentNeedsLogin}
              />
            ) : null}
            <NrmSpotifyChartsLoginModal
              visible={chartsBearerModalOpen}
              bearerExpired={chartsBearerModalExpired}
              titleColor={titleColor}
              bodyColor={bodyColor}
              onClose={() => closeChartsBearerModal(false)}
              onSessionCaptured={(payload) => void onChartsBearerCapturedFromRenew(payload)}
            />
            <NrmLastfmApiAuthModal
              visible={lastfmAuthModalOpen}
              isDark={isDark}
              titleColor={titleColor}
              bodyColor={bodyColor}
              errorCode={lastfmAuthModalErrorCode}
              onClose={closeLastfmAuthModal}
              onOpenSettings={onLastfmAuthModalOpenSettings}
            />
          </>
        ) : null}

      </SafeAreaView>

    </View>

  );

}



const styles = StyleSheet.create({

  rootBg: {

    flex: 1,

  },

  safe: {

    flex: 1,

    position: 'relative',

  },

  keyboardAvoid: {

    flex: 1,

  },

  scroll: {

    flex: 1,

  },

  scrollInner: {

    alignItems: 'center',

    width: '100%',

  },

  centerColumn: {

    width: '100%',

    maxWidth: nrmTokens.layout.maxContentWidth,

  },
  easterEggOverlay: {
    position: 'absolute',
    left: nrmTokens.space.xl,
    right: nrmTokens.space.xl,
    top: '42%',
    borderRadius: nrmTokens.radius.lg,
    paddingVertical: nrmTokens.space.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  easterEggText: {
    fontSize: nrmTokens.font.lead,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  logoWrap: {

    width: '100%',

    maxWidth: nrmTokens.layout.homeSearchClusterMaxWidth,

    alignSelf: 'center',

    alignItems: 'center',

  },

  logoWrapWelcome: {

    marginBottom: nrmTokens.space.xl,

  },

  logoWrapBrowsing: {

    paddingBottom: nrmTokens.space.md,

  },

});


