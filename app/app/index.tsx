import { StatusBar } from 'expo-status-bar';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import {

  BackHandler,

  KeyboardAvoidingView,

  Platform,

  StyleSheet,

  Text,

  useWindowDimensions,

  View,

} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';



import { NrmFeatureScreenLogoHeader } from '@/components/nrm/NrmFeatureScreenLogoHeader';
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
import {
  NrmAppNotificationDrawer,
  type NrmAppNotificationDrawerHandle,
} from '@/components/nrm/NrmAppNotificationDrawer';
import { NrmAppTopBar } from '@/components/nrm/NrmAppTopBar';
import { NrmHomeBottomTabBar, type NrmHomeTab } from '@/components/nrm/NrmHomeBottomTabBar';
import { NrmHomeDiscoverScreen } from '@/components/nrm/NrmHomeDiscoverScreen';
import { NrmHomeHistoryScreen } from '@/components/nrm/NrmHomeHistoryScreen';
import { NrmTrackMetadataSettingsHome } from '@/components/nrm/NrmTrackMetadataSettingsHome';
import { nrmHasActiveDownloadOrLyricsWork } from '@/lib/nrmBackgroundWork';
import { confirmUser } from '@/lib/nrmUserNotify';
import { formatNrmAppExitConfirmMessage, useNrmMainLogoDisplayName } from '@/lib/nrmMainLogoDisplayNameSettings';

import { NrmHomeChartCarousel, homeChartStageMetrics } from '@/components/nrm/NrmHomeChartCarousel';
import { homeChartPodiumTier } from '@/components/nrm/NrmHomeChartRankCrown';
import { NrmMusicQuotePanel } from '@/components/nrm/NrmMusicQuotePanel';
import { NrmYoutubeHome } from '@/components/nrm/NrmYoutubeHome';

import { nrmTokens } from '@/constants/nrmTokens';

import { useNrmUiAppearance } from '@/context/NrmUiAppearanceContext';

import { getNrmRootBackgroundColor } from '@/lib/nrmUiAppearanceColors';
import {
  fetchHomeChartTop20,
  homeChartDownloadSource,
  invalidateHomeChartCache,
  peekHomeChartCache,
  registerHomeChartSpotifyAuthHandlers,
} from '@/lib/nrmHomeChartClient';
import {
  DEFAULT_MAIN_PAGE_CHART_SOURCE,
  loadMainPageChartSource,
  registerMainPageChartSourceListener,
  type NrmMainPageChartSource,
} from '@/lib/nrmMainPageChartSettings';
import {
  DEFAULT_MAIN_PAGE_MODE,
  loadMainPageMode,
  registerMainPageModeListener,
  type NrmMainPageMode,
} from '@/lib/nrmMainPageSettings';
import { saveSpotifyChartsSession } from '@/lib/nrmSpotifyChartsSession';
import { useNrmAlarmFeed } from '@/lib/nrmAlarmFeed';
import type { ChartErrorCode } from '@/lib/nrmChartErrors';
import type { ChartTrackItem } from '@/lib/nrmChartsTypes';
import type { LastfmAuthHandlers } from '@/lib/nrmLastfmAuthFlow';
import type { LastfmSearchErrorCode } from '@/lib/nrmLastfmSearchTypes';




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

type HomeChartState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; items: ChartTrackItem[]; chartSource: NrmMainPageChartSource }
  | { status: 'failed' };

const HOME_CHART_LOAD_ERROR_MESSAGE =
  '트랙 정보를 가져올 수 없습니다.\n나중에 다시 시도하세요.';

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
  const mainLogoDisplayName = useNrmMainLogoDisplayName();

  const { width } = useWindowDimensions();

  const [mainView, setMainView] = useState<MainView>('youtube');

  const [layoutPhase, setLayoutPhase] = useState<'welcome' | 'browsing'>(

    'welcome',

  );

  const [homeEpoch, setHomeEpoch] = useState(0);
  const [quoteRefreshKey, setQuoteRefreshKey] = useState(0);
  const [homeChartEpoch, setHomeChartEpoch] = useState(0);
  const [homeChartIndex, setHomeChartIndex] = useState(0);
  const [mainPageMode, setMainPageMode] = useState<NrmMainPageMode>(DEFAULT_MAIN_PAGE_MODE);
  const [mainPageChartSource, setMainPageChartSource] = useState<NrmMainPageChartSource>(
    DEFAULT_MAIN_PAGE_CHART_SOURCE,
  );
  const [homeChartState, setHomeChartState] = useState<HomeChartState>({ status: 'idle' });
  const [searchViewEpoch, setSearchViewEpoch] = useState(0);
  /** 차트·검색 위에 띄우는 유튜브 검색 (원 화면은 언마운트하지 않음 → 스크롤·선택 유지) */
  const [youtubeOverlay, setYoutubeOverlay] = useState<YoutubeOverlayState | null>(null);
  const [homeTab, setHomeTab] = useState<NrmHomeTab>('home');
  const [notificationOpen, setNotificationOpen] = useState(false);
  const homeTabRef = useRef(homeTab);
  homeTabRef.current = homeTab;
  const ytOverlayHistoryActiveRef = useRef(false);
  const mainViewRef = useRef(mainView);
  mainViewRef.current = mainView;
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
  const renewChartsBearerRef = useRef<(() => Promise<boolean>) | null>(null);

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

  renewChartsBearerRef.current = renewChartsBearerViaWebView;

  useLayoutEffect(() => {
    registerHomeChartSpotifyAuthHandlers({
      onRenewChartsBearer: () =>
        renewChartsBearerRef.current?.() ?? Promise.resolve(false),
    });
    return () => registerHomeChartSpotifyAuthHandlers(null);
  }, []);

  const menuRef = useRef<NrmAppMenuHandle>(null);
  const notificationRef = useRef<NrmAppNotificationDrawerHandle>(null);
  const exitPromptOpenRef = useRef(false);
  const alarmFeed = useNrmAlarmFeed();
  const titleColor = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
  const bodyColor = isDark ? nrmTokens.color.textMuted : nrmTokens.color.inkMuted80;



  const pad = width >= 900 ? nrmTokens.space.xxl : nrmTokens.space.lg;

  const bumpQuoteRefresh = useCallback(() => {
    setQuoteRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    void loadMainPageMode().then(setMainPageMode);
    registerMainPageModeListener(setMainPageMode);
    return () => registerMainPageModeListener(null);
  }, []);

  useEffect(() => {
    void loadMainPageChartSource().then(setMainPageChartSource);
    registerMainPageChartSourceListener((source) => {
      invalidateHomeChartCache();
      setMainPageChartSource(source);
      setHomeChartEpoch((v) => v + 1);
    });
    return () => registerMainPageChartSourceListener(null);
  }, []);

  const homeChartReadySource =
    homeChartState.status === 'ready' ? homeChartState.chartSource : null;

  useEffect(() => {
    if (homeChartReadySource) {
      setHomeChartIndex(0);
    }
  }, [homeChartReadySource]);

  useEffect(() => {
    if (mainPageMode !== 'charts' || layoutPhase !== 'welcome' || youtubeOverlay !== null || homeTab !== 'home') {
      return;
    }
    const ac = new AbortController();
    const epoch = homeChartEpoch;
    const chartSource = mainPageChartSource;
    const cached = peekHomeChartCache(chartSource, epoch);
    if (cached?.ok) {
      setHomeChartState({
        status: 'ready',
        items: cached.items,
        chartSource: cached.chartSource,
      });
      return;
    }
    setHomeChartState({ status: 'loading' });
    void fetchHomeChartTop20(chartSource, ac.signal, epoch).then((out) => {
      if (ac.signal.aborted) return;
      if (out.ok) {
        setHomeChartState({
          status: 'ready',
          items: out.items,
          chartSource: out.chartSource,
        });
      } else {
        setHomeChartState({ status: 'failed' });
      }
    });
    return () => ac.abort();
  }, [homeTab, mainPageMode, mainPageChartSource, layoutPhase, youtubeOverlay, homeChartEpoch]);

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

  const isChartsHomeBackground =
    isDark &&
    showYoutubeHome &&
    homeTab === 'home' &&
    layoutPhase === 'welcome' &&
    !showYoutubeOverlay &&
    mainPageMode === 'charts';

  const rootBackground = getNrmRootBackgroundColor(isDark, {
    chartsHome: isChartsHomeBackground,
  });

  const homeChartMetrics = homeChartStageMetrics(width);
  const homeChartContentWidth = width - 2 * pad;
  const homeChartStageLeft =
    pad + Math.max(0, (homeChartContentWidth - homeChartMetrics.stageWidth) / 2);
  const homeChartLeftNavRight = homeChartStageLeft + homeChartMetrics.navBtnSize;
  const showHomeWelcomeChart =
    showYoutubeHome &&
    homeTab === 'home' &&
    layoutPhase !== 'browsing' &&
    !showYoutubeOverlay &&
    mainPageMode === 'charts' &&
    homeChartState.status !== 'failed';

  const homePodiumTier = useMemo(() => {
    if (homeTab !== 'home' || homeChartState.status !== 'ready') return null;
    const item = homeChartState.items[homeChartIndex];
    if (!item) return null;
    const rank = item.rank > 0 ? item.rank : homeChartIndex + 1;
    return homeChartPodiumTier(rank);
  }, [homeChartIndex, homeChartState, homeTab]);

  const showHomeChrome = showYoutubeHome && !showFeatureFullScreen;
  const showWelcomeFixedTopBar =
    showHomeChrome &&
    homeTab === 'home' &&
    layoutPhase === 'welcome' &&
    !youtubeOverlay;
  const showBottomTabBar =
    showHomeChrome && layoutPhase === 'welcome' && youtubeOverlay === null;

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
    if (mainViewRef.current === 'youtube') {
      setLayoutPhase('welcome');
      setHomeEpoch((v) => v + 1);
    }
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
    setHomeTab('home');
    setHomeEpoch((v) => v + 1);
    setSearchViewEpoch((v) => v + 1);
    setHomeChartIndex(0);
    bumpQuoteRefresh();
  }, [dismissYoutubeOverlay, bumpQuoteRefresh]);

  const onHomeTabChange = useCallback(
    (tab: NrmHomeTab) => {
      if (tab === 'home') {
        resetToYoutubeHome();
        return;
      }
      setHomeTab(tab);
      setYoutubeOverlay(null);
      if (tab === 'search') {
        setLayoutPhase('welcome');
        setHomeEpoch((v) => v + 1);
      }
    },
    [resetToYoutubeHome],
  );

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

  const navigateFromHomeChart = useCallback(
    (item: ChartTrackItem, chartSource: NrmMainPageChartSource) => {
      void navigateToSearchFromChart(item, homeChartDownloadSource(chartSource));
    },
    [navigateToSearchFromChart],
  );



  const onMainLogoPress = resetToYoutubeHome;



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
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onPopState = () => {
      if (youtubeOverlay) {
        dismissYoutubeOverlay(true);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [dismissYoutubeOverlay, youtubeOverlay]);

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

      if (showYoutubeHome && homeTabRef.current !== 'home') {
        setHomeTab('home');
        setLayoutPhase('welcome');
        setYoutubeOverlay(null);
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
        const ok = await confirmUser(formatNrmAppExitConfirmMessage(mainLogoDisplayName), {
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
    mainLogoDisplayName,
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
    const showSearchUi = homeTab === 'search' || !!overlay;
    const youtubeBrowsing = !!overlay || (showSearchUi && layoutPhase === 'browsing');
    const chartLoadFailed =
      mainPageMode === 'charts' && homeChartState.status === 'failed';
    const useCenteredSearchWelcome = showSearchUi && !youtubeBrowsing;
    const showWelcomeQuote =
      homeTab === 'home' && !youtubeBrowsing && mainPageMode === 'quotation';
    const showWelcomeChart =
      homeTab === 'home' &&
      !youtubeBrowsing &&
      mainPageMode === 'charts' &&
      !chartLoadFailed;

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
        scrollTopChrome={
          overlay || homeTab === 'search' ? (
            <NrmFeatureScreenLogoHeader
              isDark={isDark}
              onPressHome={resetToYoutubeHome}
              compact
            />
          ) : undefined
        }
        downloadMetadataAuth={{
          ...lastfmAuthHandlers,
          onOpenSpotifyTokenSettings: () =>
            menuRef.current?.openSpotifyTokenSettings(),
        }}
        onAdminGateComplete={() => {
          setHomeTab('home');
          setLayoutPhase('welcome');
        }}
      />
    );

    let bodyContent = null;
    if (showSearchUi) {
      bodyContent = youtubeHome;
    } else if (homeTab === 'library') {
      bodyContent = (
        <NrmTrackMetadataSettingsHome
          isDark={isDark}
          titleColor={titleColor}
          bodyColor={bodyColor}
          onBack={() => onHomeTabChange('home')}
          hideBack
        />
      );
    } else if (homeTab === 'discover') {
      bodyContent = (
        <NrmHomeDiscoverScreen
          isDark={isDark}
          paddingHorizontal={pad}
          lastfmAuth={lastfmAuthHandlers}
          onNavigateYoutube={navigateToYoutubeFromLastfm}
        />
      );
    } else if (homeTab === 'history') {
      bodyContent = <NrmHomeHistoryScreen isDark={isDark} />;
    } else if (showWelcomeQuote) {
      bodyContent = (
        <NrmMusicQuotePanel isDark={isDark} refreshKey={quoteRefreshKey} />
      );
    } else if (chartLoadFailed) {
      bodyContent = (
        <View style={styles.homeChartErrorShell}>
          <Text style={[styles.homeChartErrorText, { color: bodyColor }]}>
            {HOME_CHART_LOAD_ERROR_MESSAGE}
          </Text>
        </View>
      );
    } else if (showWelcomeChart) {
      bodyContent = (
        <View style={styles.homeChartShell}>
          <NrmHomeChartCarousel
            key={`home-chart-${homeChartState.status === 'ready' ? homeChartState.chartSource : mainPageChartSource}`}
            isDark={isDark}
            items={homeChartState.status === 'ready' ? homeChartState.items : []}
            loading={
              homeChartState.status === 'loading' || homeChartState.status === 'idle'
            }
            initialIndex={homeChartIndex}
            onIndexChange={setHomeChartIndex}
            onTrackPress={(item) => {
              const chartSource =
                homeChartState.status === 'ready'
                  ? homeChartState.chartSource
                  : mainPageChartSource;
              navigateFromHomeChart(item, chartSource);
            }}
          />
        </View>
      );
    }

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
            youtubeBrowsing
              ? styles.youtubeBrowsingColumn
              : useCenteredSearchWelcome
                ? styles.youtubeWelcomeColumnCentered
                : styles.youtubeWelcomeColumn,
            { paddingHorizontal: pad },
          ]}>
          <View
            style={
              youtubeBrowsing
                ? styles.youtubeHomeShell
                : useCenteredSearchWelcome
                  ? styles.youtubeWelcomeBodyCentered
                  : styles.youtubeWelcomeBody
            }>
            {bodyContent}
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
        edges={showBottomTabBar ? ['top'] : ['top', 'bottom']}>

        {showWelcomeFixedTopBar ? (
          <NrmAppTopBar
            isDark={isDark}
            onMenuPress={() => menuRef.current?.openMenu()}
            onNotificationPress={() => notificationRef.current?.open()}
            onLogoPress={onMainLogoPress}
            podiumTier={homePodiumTier}
            unreadAlarmCount={alarmFeed.unreadCount}
          />
        ) : null}

        <View style={styles.mainBody}>
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
        </View>

        {showBottomTabBar ? (
          <NrmHomeBottomTabBar
            isDark={isDark}
            active={homeTab}
            onChange={onHomeTabChange}
            backgroundColor={rootBackground}
          />
        ) : null}

        <NrmAppNotificationDrawer
          ref={notificationRef}
          isDark={isDark}
          open={notificationOpen}
          onOpenChange={setNotificationOpen}
          feed={alarmFeed}
        />

        <NrmAppMenu
          ref={menuRef}
          isDark={isDark}
          paddingHorizontal={pad}
          hideMenuFab
          onLogoPressHome={resetToYoutubeHome}
          leftEdgeSwipeReserve={showHomeWelcomeChart ? homeChartLeftNavRight : undefined}

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
    overflow: 'visible',
  },

  mainBody: {
    flex: 1,
    minHeight: 0,
    overflow: 'visible',
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
    overflow: 'visible',
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
    overflow: 'visible',
  },

  youtubeWelcomeColumnCentered: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    maxWidth: nrmTokens.layout.maxContentWidth,
    alignSelf: 'center',
    justifyContent: 'center',
  },

  youtubeWelcomeBody: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    overflow: 'visible',
  },

  homeChartShell: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    justifyContent: 'flex-start',
    overflow: 'visible',
  },

  homeChartErrorShell: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: nrmTokens.space.xxl,
    paddingHorizontal: nrmTokens.space.lg,
  },

  homeChartErrorText: {
    fontSize: nrmTokens.font.body,
    lineHeight: 24,
    textAlign: 'center',
    maxWidth: 320,
  },

  youtubeWelcomeBodyCentered: {
    width: '100%',
    maxWidth: nrmTokens.layout.homeSearchClusterMaxWidth,
    alignSelf: 'center',
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

  logoWrapCentered: {
    paddingBottom: nrmTokens.space.lg,
  },

});


