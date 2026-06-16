import { StatusBar } from 'expo-status-bar';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {

  BackHandler,

  KeyboardAvoidingView,

  Platform,

  StyleSheet,

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
  type LastfmYoutubeNavigateParams,
} from '@/components/nrm/search/NrmLastfmSearchRouter';
import {
  NrmMelonSearchRouter,
  type MelonSearchKind,
  type MelonSearchNavHandle,
  type MelonYoutubeNavigateParams,
} from '@/components/nrm/search/NrmMelonSearchRouter';
import { melonFieldsToChartTrack } from '@/lib/nrmMelonDownloadMetadata';
import { lastfmFieldsToChartTrack } from '@/lib/nrmLastfmDownloadMetadata';
import { NrmSpotifyAlbumSearchHome } from '@/components/nrm/search/NrmSpotifyAlbumSearchHome';
import { NrmSpotifyArtistSearchHome } from '@/components/nrm/search/NrmSpotifyArtistSearchHome';
import { NrmSpotifyTrackSearchHome } from '@/components/nrm/search/NrmSpotifyTrackSearchHome';

import { NrmAppMenu, type NrmAppMenuHandle } from '@/components/nrm/NrmAppMenu';
import { setupNrmMobileDownloadNotifications } from '@/lib/nrmMobileDownloadNotifications';
import { nrmHasActiveDownloadOrLyricsWork } from '@/lib/nrmBackgroundWork';
import { confirmUser } from '@/lib/nrmUserNotify';

import { NrmLogo } from '@/components/nrm/NrmLogo';

import { NrmMusicQuotePanel } from '@/components/nrm/NrmMusicQuotePanel';
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
  | 'lastfmSearchTrack'
  | 'melonSearchArtist'
  | 'melonSearchAlbum'
  | 'melonSearchTrack';

type YoutubeOverlayState = {
  searchQuery: string;
  downloadTrack: ChartTrackItem | null;
  downloadSource: 'chart' | 'lastfm' | 'melon' | null;
};

async function formatYoutubeDisplayQuery(artist?: string | null, title?: string | null): Promise<string> {
  const a = (artist ?? '').trim();
  const t = (title ?? '').trim();
  if (!a && !t) return '';
  if (!a) return t;
  if (!t) return a;
  try {
    const { loadDownloadFileNameFormat } = await import('@/lib/nrmDownloadSettings');
    const { formatDownloadFileStem } = await import('@/lib/nrmYoutubeDownloadMeta');
    const format = await loadDownloadFileNameFormat();
    return formatDownloadFileStem(a, t, format);
  } catch {
    return `${a} - ${t}`;
  }
}



export default function HomeScreen() {

  const { isDark } = useNrmUiAppearance();

  const { width, height: winH } = useWindowDimensions();

  const [mainView, setMainView] = useState<MainView>('youtube');

  const [layoutPhase, setLayoutPhase] = useState<'welcome' | 'browsing'>(

    'welcome',

  );

  const [homeEpoch, setHomeEpoch] = useState(0);
  const [quoteRefreshKey, setQuoteRefreshKey] = useState(0);
  const [searchViewEpoch, setSearchViewEpoch] = useState(0);
  /** 차트·검색 위에 띄우는 유튜브 검색 (원 화면은 언마운트하지 않음 → 스크롤·선택 유지) */
  const [youtubeOverlay, setYoutubeOverlay] = useState<YoutubeOverlayState | null>(null);
  const ytOverlayHistoryActiveRef = useRef(false);
  const lastfmNavRef = useRef<LastfmSearchNavHandle>(null);
  const melonNavRef = useRef<MelonSearchNavHandle>(null);
  const [chartsBearerModalOpen, setChartsBearerModalOpen] = useState(false);
  const [chartsBearerModalExpired, setChartsBearerModalExpired] = useState(false);
  const [silentCaptureActive, setSilentCaptureActive] = useState(false);
  const [lastfmAuthModalOpen, setLastfmAuthModalOpen] = useState(false);
  const [lastfmAuthModalErrorCode, setLastfmAuthModalErrorCode] = useState<
    ChartErrorCode | LastfmSearchErrorCode
  >('auth_failed');
  const chartsBearerRenewResolver = useRef<((ok: boolean) => void) | null>(null);
  const menuRef = useRef<NrmAppMenuHandle>(null);
  const exitPromptOpenRef = useRef(false);
  const titleColor = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
  const bodyColor = isDark ? nrmTokens.color.textMuted : nrmTokens.color.inkMuted80;



  const pad = width >= 900 ? nrmTokens.space.xxl : nrmTokens.space.lg;

  const logoPadTop = Math.max(0, winH * LOGO_TOP_FRAC);

  const rootBackground = getNrmRootBackgroundColor(isDark);

  const bumpQuoteRefresh = useCallback(() => {
    setQuoteRefreshKey((k) => k + 1);
  }, []);

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
  const isMelonSearchArtist = mainView === 'melonSearchArtist';
  const isMelonSearchAlbum = mainView === 'melonSearchAlbum';
  const isMelonSearchTrack = mainView === 'melonSearchTrack';
  const isMelonSearchView =
    isMelonSearchArtist || isMelonSearchAlbum || isMelonSearchTrack;
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
    isChartsView || isSpotifySearchView || isLastfmSearchView || isMelonSearchView;

  const showYoutubeOverlay = youtubeOverlay !== null;
  const showFeatureFullScreen = isFullScreenFeature;
  const showYoutubeHome = mainView === 'youtube' && !showFeatureFullScreen;

  const openYoutubeOverlay = useCallback((payload: YoutubeOverlayState) => {
    setYoutubeOverlay(payload);
    setLayoutPhase('browsing');
    setHomeEpoch((v) => v + 1);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.history.pushState({ nrmYoutubeOverlay: true }, '');
      ytOverlayHistoryActiveRef.current = true;
    }
  }, []);

  const dismissYoutubeOverlay = useCallback((fromPopstate = false) => {
    setYoutubeOverlay(null);
    if (
      Platform.OS === 'web' &&
      !fromPopstate &&
      ytOverlayHistoryActiveRef.current &&
      typeof window !== 'undefined'
    ) {
      ytOverlayHistoryActiveRef.current = false;
      window.history.back();
    } else {
      ytOverlayHistoryActiveRef.current = false;
    }
  }, []);

  const resetToYoutubeHome = useCallback(() => {
    dismissYoutubeOverlay();
    setMainView('youtube');
    setLayoutPhase('welcome');
    setHomeEpoch((v) => v + 1);
    bumpQuoteRefresh();
  }, [dismissYoutubeOverlay, bumpQuoteRefresh]);

  /** 차트·검색 트랙 클릭: 유튜브 오버레이 (원 플랫폼 화면은 마운트 유지) */
  const navigateToSearchFromChart = useCallback(
    async (item: ChartTrackItem, source: 'chart' | 'lastfm' | 'melon' = 'chart') => {
      const q = await formatYoutubeDisplayQuery(item.artists, item.title);
      if (!q) return;
      openYoutubeOverlay({
        searchQuery: q,
        downloadTrack: item,
        downloadSource: source,
      });
    },
    [openYoutubeOverlay],
  );



  const onMainLogoPress = useCallback(() => {
    resetToYoutubeHome();
  }, [resetToYoutubeHome]);



  const openAppleMusicCharts = useCallback(() => {
    setYoutubeOverlay(null);
    setMainView('appleMusicCharts');
    setLayoutPhase('browsing');
  }, []);

  const openSpotifyChartsOfficial = useCallback(() => {
    setYoutubeOverlay(null);
    setMainView('spotifyChartsOfficial');
    setLayoutPhase('browsing');
  }, []);

  const openSpotifyChartsCharts = useCallback(() => {
    setYoutubeOverlay(null);
    setMainView('spotifyChartsCharts');
    setLayoutPhase('browsing');
  }, []);

  const openLastfmCharts = useCallback(() => {
    setYoutubeOverlay(null);
    setMainView('lastfmCharts');
    setLayoutPhase('browsing');
  }, []);

  const openMelonCharts = useCallback(() => {
    setYoutubeOverlay(null);
    setMainView('melonCharts');
    setLayoutPhase('browsing');
  }, []);

  const openPeriodLastfmCharts = useCallback(() => {
    setYoutubeOverlay(null);
    setMainView('periodLastfmCharts');
    setLayoutPhase('browsing');
  }, []);

  const openPeriodSpotifyCharts = useCallback(() => {
    setYoutubeOverlay(null);
    setMainView('periodSpotifyCharts');
    setLayoutPhase('browsing');
  }, []);

  const openGenreCharts = useCallback(() => {
    setYoutubeOverlay(null);
    setMainView('genreCharts');
    setLayoutPhase('browsing');
  }, []);

  const openSpotifyArtistSearch = useCallback(() => {
    setSearchViewEpoch((v) => v + 1);
    setYoutubeOverlay(null);
    setMainView('spotifySearchArtist');
    setLayoutPhase('browsing');
  }, []);

  const openSpotifyAlbumSearch = useCallback(() => {
    setSearchViewEpoch((v) => v + 1);
    setYoutubeOverlay(null);
    setMainView('spotifySearchAlbum');
    setLayoutPhase('browsing');
  }, []);

  const openSpotifyTrackSearch = useCallback(() => {
    setSearchViewEpoch((v) => v + 1);
    setYoutubeOverlay(null);
    setMainView('spotifySearchTrack');
    setLayoutPhase('browsing');
  }, []);

  const openLastfmSearch = useCallback((kind: LastfmSearchKind) => {
    setSearchViewEpoch((v) => v + 1);
    setYoutubeOverlay(null);
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
    async (params: LastfmYoutubeNavigateParams) => {
      const artist = params.artist.trim();
      const title = params.title.trim();
      if (!artist && !title) return;
      const displayQ = await formatYoutubeDisplayQuery(artist, title);
      openYoutubeOverlay({
        searchQuery: displayQ,
        downloadTrack: lastfmFieldsToChartTrack({
          artist,
          title,
          mbid: params.mbid,
          album: params.album,
          genre: params.genre,
          releaseDate: params.releaseDate,
          imageUrl: params.imageUrl,
        }),
        downloadSource: 'lastfm',
      });
    },
    [openYoutubeOverlay],
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

  const openMelonSearch = useCallback((kind: MelonSearchKind) => {
    setSearchViewEpoch((v) => v + 1);
    setYoutubeOverlay(null);
    const view: MainView =
      kind === 'artist'
        ? 'melonSearchArtist'
        : kind === 'album'
          ? 'melonSearchAlbum'
          : 'melonSearchTrack';
    setMainView(view);
    setLayoutPhase('browsing');
  }, []);

  const openMelonArtistSearch = useCallback(
    () => openMelonSearch('artist'),
    [openMelonSearch],
  );
  const openMelonAlbumSearch = useCallback(
    () => openMelonSearch('album'),
    [openMelonSearch],
  );
  const openMelonTrackSearch = useCallback(
    () => openMelonSearch('track'),
    [openMelonSearch],
  );

  const navigateToYoutubeFromMelon = useCallback(
    async (params: MelonYoutubeNavigateParams) => {
      const artist = params.artist.trim();
      const title = params.title.trim();
      if (!artist && !title) return;
      const displayQ = await formatYoutubeDisplayQuery(artist, title);
      openYoutubeOverlay({
        searchQuery: displayQ,
        downloadTrack: melonFieldsToChartTrack({
          artist,
          title,
          songId: params.songId,
          album: params.album,
          genre: params.genre,
          releaseDate: params.releaseDate,
          imageUrl: params.imageUrl,
        }),
        downloadSource: 'melon',
      });
    },
    [openYoutubeOverlay],
  );

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
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onPopState = () => {
      if (youtubeOverlay) {
        ytOverlayHistoryActiveRef.current = false;
        setYoutubeOverlay(null);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [youtubeOverlay]);

  useEffect(() => {

    if (Platform.OS !== 'android') return;

    const sub = BackHandler.addEventListener('hardwareBackPress', () => {

      if (youtubeOverlay) {
        dismissYoutubeOverlay();
        return true;
      }

      if (isLastfmSearchView) {
        if (lastfmNavRef.current?.goBack()) return true;
        resetToYoutubeHome();
        return true;
      }

      if (isMelonSearchView) {
        if (melonNavRef.current?.goBack()) return true;
        resetToYoutubeHome();
        return true;
      }

      if (isFullScreenFeature) {
        resetToYoutubeHome();
        return true;
      }

      if (layoutPhase !== 'welcome') {

        resetToYoutubeHome();

        return true;

      }

      if (exitPromptOpenRef.current) return true;

      void (async () => {
        const active = await nrmHasActiveDownloadOrLyricsWork();
        if (!active) {
          BackHandler.exitApp();
          return;
        }
        exitPromptOpenRef.current = true;
        const ok = await confirmUser('NullReferenceMusic을 종료할까요?', {
          cancelLabel: '취소',
          confirmLabel: '종료',
        });
        exitPromptOpenRef.current = false;
        if (ok) BackHandler.exitApp();
      })();

      return true;

    });

    return () => sub.remove();

  }, [
    dismissYoutubeOverlay,
    isFullScreenFeature,
    isLastfmSearchView,
    isMelonSearchView,
    layoutPhase,
    resetToYoutubeHome,
    youtubeOverlay,
  ]);



  const renderFeaturePanel = (view: MainView) => {
    switch (view) {
      case 'appleMusicCharts':
        return (
          <NrmAppleMusicChartsHome
            isDark={isDark}
            paddingHorizontal={pad}
            onBackToHome={resetToYoutubeHome}
            onTrackPress={navigateToSearchFromChart}
          />
        );
      case 'spotifyChartsOfficial':
        return (
          <NrmSpotifyChartsHome
            isDark={isDark}
            paddingHorizontal={pad}
            chartSource="official"
            onBackToHome={resetToYoutubeHome}
            onTrackPress={navigateToSearchFromChart}
          />
        );
      case 'spotifyChartsCharts':
        return (
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
        );
      case 'lastfmCharts':
        return (
          <NrmLastfmChartsHome
            isDark={isDark}
            paddingHorizontal={pad}
            onBackToHome={resetToYoutubeHome}
            onTrackPress={(item) => navigateToSearchFromChart(item, 'lastfm')}
            lastfmAuth={lastfmAuthHandlers}
          />
        );
      case 'melonCharts':
        return (
          <NrmMelonChartsHome
            isDark={isDark}
            paddingHorizontal={pad}
            onBackToHome={resetToYoutubeHome}
            onTrackPress={(item) => navigateToSearchFromChart(item, 'melon')}
          />
        );
      case 'periodLastfmCharts':
        return (
          <NrmPeriodChartsHome
            platform="lastfm"
            isDark={isDark}
            paddingHorizontal={pad}
            onBackToHome={resetToYoutubeHome}
            onTrackPress={(item) => navigateToSearchFromChart(item, 'lastfm')}
            lastfmAuth={lastfmAuthHandlers}
          />
        );
      case 'periodSpotifyCharts':
        return (
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
        );
      case 'genreCharts':
        return (
          <NrmMelonGenreChartsHome
            isDark={isDark}
            paddingHorizontal={pad}
            onBackToHome={resetToYoutubeHome}
            onTrackPress={(item) => navigateToSearchFromChart(item, 'melon')}
          />
        );
      case 'spotifySearchArtist':
        return (
          <NrmSpotifyArtistSearchHome
            key={`spotify-artist-${searchViewEpoch}`}
            isDark={isDark}
            paddingHorizontal={pad}
            onBackToHome={resetToYoutubeHome}
          />
        );
      case 'spotifySearchAlbum':
        return (
          <NrmSpotifyAlbumSearchHome
            key={`spotify-album-${searchViewEpoch}`}
            isDark={isDark}
            paddingHorizontal={pad}
            onBackToHome={resetToYoutubeHome}
          />
        );
      case 'spotifySearchTrack':
        return (
          <NrmSpotifyTrackSearchHome
            key={`spotify-track-${searchViewEpoch}`}
            isDark={isDark}
            paddingHorizontal={pad}
            onBackToHome={resetToYoutubeHome}
          />
        );
      case 'lastfmSearchArtist':
      case 'lastfmSearchAlbum':
      case 'lastfmSearchTrack':
        return (
          <NrmLastfmSearchRouter
            key={`lastfm-${view}-${searchViewEpoch}`}
            ref={lastfmNavRef}
            initialKind={
              view === 'lastfmSearchArtist'
                ? 'artist'
                : view === 'lastfmSearchAlbum'
                  ? 'album'
                  : 'track'
            }
            isDark={isDark}
            paddingHorizontal={pad}
            onBackToHome={resetToYoutubeHome}
            onNavigateYoutube={navigateToYoutubeFromLastfm}
            lastfmAuth={lastfmAuthHandlers}
          />
        );
      case 'melonSearchArtist':
      case 'melonSearchAlbum':
      case 'melonSearchTrack':
        return (
          <NrmMelonSearchRouter
            key={`melon-${view}-${searchViewEpoch}`}
            ref={melonNavRef}
            initialKind={
              view === 'melonSearchArtist'
                ? 'artist'
                : view === 'melonSearchAlbum'
                  ? 'album'
                  : 'track'
            }
            isDark={isDark}
            paddingHorizontal={pad}
            onBackToHome={resetToYoutubeHome}
            onNavigateYoutube={navigateToYoutubeFromMelon}
          />
        );
      default:
        return null;
    }
  };

  const renderYoutubePanel = (overlay: YoutubeOverlayState | null) => {
    const youtubeBrowsing = !!overlay || layoutPhase === 'browsing';
    const showWelcomeQuotes = !youtubeBrowsing;

    const logoBlock = (
      <View
        style={[
          styles.logoWrap,
          styles.logoWrapBrowsing,
          { paddingTop: logoPadTop },
        ]}>
        <NrmLogo tone={isDark ? 'dark' : 'light'} onPress={onMainLogoPress} />
      </View>
    );

    const youtubeHome = (
      <NrmYoutubeHome
        key={homeEpoch}
        isDark={isDark}
        phase={overlay ? 'browsing' : layoutPhase}
        fillHeight={youtubeBrowsing}
        onSearchCommitted={() => setLayoutPhase('browsing')}
        initialQuery={overlay?.searchQuery}
        chartDownloadTrack={overlay?.downloadTrack ?? null}
        chartDownloadSource={overlay?.downloadSource ?? null}
        downloadMetadataAuth={{
          ...lastfmAuthHandlers,
          onOpenSpotifyTokenSettings: () =>
            menuRef.current?.openSpotifyTokenSettings(),
        }}
      />
    );

    return (
      <KeyboardAvoidingView
        style={[
          styles.keyboardAvoid,
          youtubeBrowsing && styles.youtubeBrowsingRoot,
          !youtubeBrowsing && styles.youtubeWelcomeRoot,
        ]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        enabled>
        <View
          style={[
            styles.centerColumn,
            youtubeBrowsing ? styles.youtubeBrowsingColumn : styles.youtubeWelcomeColumn,
            { paddingHorizontal: pad },
          ]}>
          {logoBlock}
          <View
            style={
              youtubeBrowsing ? styles.youtubeHomeShell : styles.youtubeWelcomeBody
            }>
            {youtubeHome}
            {showWelcomeQuotes ? (
              <NrmMusicQuotePanel
                isDark={isDark}
                refreshKey={quoteRefreshKey}
              />
            ) : null}
          </View>
        </View>
      </KeyboardAvoidingView>
    );
  };



  return (

    <View style={[styles.rootBg, { backgroundColor: rootBackground }]}>

      <StatusBar style={isDark ? 'light' : 'dark'} />

      <SafeAreaView

        style={[styles.safe, { backgroundColor: rootBackground }]}

        edges={['top', 'bottom']}>

        {showFeatureFullScreen ? (
          <View
            style={[
              styles.stackLayer,
              showYoutubeOverlay && styles.stackLayerBehind,
              showYoutubeOverlay && { backgroundColor: rootBackground },
            ]}
            pointerEvents={showYoutubeOverlay ? 'none' : 'auto'}>
            {/* 오버레이 활성 시 차트 컨텐츠를 숨겨 로고 중복 방지 */}
            <View
              style={[
                styles.featurePanelFill,
                showYoutubeOverlay ? styles.hiddenContent : undefined,
              ]}>
              {renderFeaturePanel(mainView)}
            </View>
          </View>
        ) : null}

        {showYoutubeOverlay ? (
          <View style={[styles.stackLayer, styles.stackLayerFront, { backgroundColor: rootBackground }]}>
            {renderYoutubePanel(youtubeOverlay)}
          </View>
        ) : showYoutubeHome ? (
          renderYoutubePanel(null)
        ) : null}

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
          onNavigateMelonArtistSearch={openMelonArtistSearch}
          onNavigateMelonAlbumSearch={openMelonAlbumSearch}
          onNavigateMelonTrackSearch={openMelonTrackSearch}
          onRequestChartsBearerWebView={renewChartsBearerViaWebView}
          onShowLastfmAuthInvalid={showLastfmAuthInvalidOverlay}
        />

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

  stackLayer: {
    flex: 1,
  },

  stackLayerFront: {
    zIndex: 1,
    elevation: 2,
  },

  stackLayerBehind: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
    elevation: 0,
  },

  featurePanelFill: {
    flex: 1,
  },

  hiddenContent: {
    opacity: 0,
  },

  keyboardAvoid: {

    flex: 1,

  },

  youtubeBrowsingRoot: {
    flex: 1,
    minHeight: 0,
  },

  youtubeWelcomeRoot: {
    flex: 1,
    minHeight: 0,
  },

  youtubeBrowsingColumn: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    maxWidth: nrmTokens.layout.maxContentWidth,
    alignSelf: 'center',
  },

  youtubeWelcomeColumn: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    maxWidth: nrmTokens.layout.maxContentWidth,
    alignSelf: 'center',
  },

  youtubeWelcomeBody: {
    flex: 1,
    minHeight: 0,
    width: '100%',
  },

  youtubeHomeShell: {
    flex: 1,
    minHeight: 0,
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

  logoWrapBrowsing: {

    paddingBottom: nrmTokens.space.md,

  },

});


