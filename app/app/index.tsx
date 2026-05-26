import { StatusBar } from 'expo-status-bar';

import { useCallback, useEffect, useRef, useState } from 'react';

import {

  BackHandler,

  KeyboardAvoidingView,

  Platform,

  ScrollView,

  StyleSheet,

  useWindowDimensions,

  View,

} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';



import { NrmAppleMusicChartsHome } from '@/components/nrm/charts/NrmAppleMusicChartsHome';
import { NrmGenreChartsPlaceholder } from '@/components/nrm/charts/NrmGenreChartsPlaceholder';
import { NrmLastfmChartsHome } from '@/components/nrm/charts/NrmLastfmChartsHome';
import { NrmPeriodChartsHome } from '@/components/nrm/charts/NrmPeriodChartsHome';
import { NrmSpotifyChartsHome } from '@/components/nrm/charts/NrmSpotifyChartsHome';
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
import type { ChartTrackItem } from '@/lib/nrmChartsTypes';



const LOGO_TOP_FRAC = 0.1;



type MainView =
  | 'youtube'
  | 'appleMusicCharts'
  | 'spotifyChartsOfficial'
  | 'spotifyChartsCharts'
  | 'lastfmCharts'
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



export default function HomeScreen() {

  const { isDark } = useNrmUiAppearance();

  const { width, height: winH } = useWindowDimensions();

  const [mainView, setMainView] = useState<MainView>('youtube');

  const [layoutPhase, setLayoutPhase] = useState<'welcome' | 'browsing'>(

    'welcome',

  );

  const [homeEpoch, setHomeEpoch] = useState(0);
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
  const [silentCaptureActive, setSilentCaptureActive] = useState(false);
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
    (item: ChartTrackItem) => {
      const q =
        item.artists && item.title
          ? `${item.artists} - ${item.title}`
          : item.title || item.artists;
      if (!q) return;
      setChartReturnView(mainView as ChartView);
      setChartSearchQuery(q);
      setChartDownloadTrack(item);
      setChartDownloadSource('chart');
      setMainView('youtube');
      setLayoutPhase('browsing');
      setHomeEpoch((v) => v + 1);
    },
    [mainView],
  );



  const onMainLogoPress = useCallback(() => {

    resetToYoutubeHome();

  }, [resetToYoutubeHome]);



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
    setMainView('spotifySearchArtist');
    setLayoutPhase('browsing');
  }, []);

  const openSpotifyAlbumSearch = useCallback(() => {
    setMainView('spotifySearchAlbum');
    setLayoutPhase('browsing');
  }, []);

  const openSpotifyTrackSearch = useCallback(() => {
    setMainView('spotifySearchTrack');
    setLayoutPhase('browsing');
  }, []);

  const openLastfmSearch = useCallback((kind: LastfmSearchKind) => {
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
      const displayQ =
        artist && title ? `${artist} - ${title}` : title || artist;
      setSearchReturnView(mainView);
      setLastfmNavSnapshot(lastfmNavRef.current?.captureState() ?? null);
      setChartSearchQuery(displayQ);
      setChartDownloadTrack(lastfmFieldsToChartTrack(params));
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
    if (Platform.OS !== 'android') {
      return Promise.resolve(false);
    }
    return new Promise((resolve) => {
      chartsBearerRenewResolver.current = resolve;
      setSilentCaptureActive(true);
    });
  }, []);

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
      closeChartsBearerModal(true);
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
            onTrackPress={navigateToSearchFromChart}
          />
        ) : isLastfmCharts ? (
          <NrmLastfmChartsHome
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
            onTrackPress={navigateToSearchFromChart}
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
          />
        ) : isGenreCharts ? (
          <NrmGenreChartsPlaceholder
            isDark={isDark}
            paddingHorizontal={pad}
            onBackToHome={resetToYoutubeHome}
          />
        ) : isSpotifySearchArtist ? (
          <NrmSpotifyArtistSearchHome
            isDark={isDark}
            paddingHorizontal={pad}
            onBackToHome={resetToYoutubeHome}
          />
        ) : isSpotifySearchAlbum ? (
          <NrmSpotifyAlbumSearchHome
            isDark={isDark}
            paddingHorizontal={pad}
            onBackToHome={resetToYoutubeHome}
          />
        ) : isSpotifySearchTrack ? (
          <NrmSpotifyTrackSearchHome
            isDark={isDark}
            paddingHorizontal={pad}
            onBackToHome={resetToYoutubeHome}
          />
        ) : isLastfmSearchView ? (
          <NrmLastfmSearchRouter
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
        />

        {Platform.OS === 'android' ? (
          <>
            <NrmSpotifyChartsSilentCapture
              active={silentCaptureActive}
              onCaptured={(token) => void onSilentCaptured(token)}
              onNeedsLogin={onSilentNeedsLogin}
            />
            <NrmSpotifyChartsLoginModal
              visible={chartsBearerModalOpen}
              titleColor={titleColor}
              bodyColor={bodyColor}
              onClose={() => closeChartsBearerModal(false)}
              onSessionCaptured={(payload) => void onChartsBearerCapturedFromRenew(payload)}
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


