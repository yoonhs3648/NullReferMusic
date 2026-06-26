import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NrmMenuNotifyHost } from '@/components/nrm/NrmMenuNotifyHost';
import { NrmMenuChartPanels } from '@/components/nrm/charts/NrmMenuChartPanels';
import { NrmMenuPeriodChartPanels } from '@/components/nrm/charts/NrmMenuPeriodChartPanels';
import { NrmMenuSearchPanels } from '@/components/nrm/search/NrmMenuSearchPanels';
import { NrmAppDrawerShell } from '@/components/nrm/NrmAppDrawerShell';
import { NrmLogo } from '@/components/nrm/NrmLogo';
import { NrmDownloadSettingsPanel } from '@/components/nrm/settings/NrmDownloadSettingsPanel';
import {
  registerOpenDownloadSettingsListener,
  registerOpenLyricsEmbedSettingsListener,
} from '@/lib/nrmDownloadNavEvents';
import { NrmGenreTagSettingsPanel } from '@/components/nrm/settings/NrmGenreTagSettingsPanel';
import { NrmWeeklySnapshotSettingsPanel } from '@/components/nrm/settings/NrmWeeklySnapshotSettingsPanel';
import { NrmLastfmApiManagePanel } from '@/components/nrm/settings/NrmLastfmApiManagePanel';
import { NrmSpotifyApiManagePanel } from '@/components/nrm/settings/NrmSpotifyApiManagePanel';
import { NrmDeepLApiManagePanel } from '@/components/nrm/settings/NrmDeepLApiManagePanel';
import { NrmTranslationSettingsPanel } from '@/components/nrm/settings/NrmTranslationSettingsPanel';
import { NrmLyricsOrderSettingsPanel } from '@/components/nrm/settings/NrmLyricsOrderSettingsPanel';
import { NrmAlignLyricsLangDetectionPanel } from '@/components/nrm/settings/NrmAlignLyricsLangDetectionPanel';
import { NrmMelonAdultAuthPanel } from '@/components/nrm/settings/NrmMelonAdultAuthPanel';
import { NrmAdminAlarmRegisterPanel } from '@/components/nrm/settings/NrmAdminAlarmRegisterPanel';
import { NrmAdminUserBanListPanel } from '@/components/nrm/settings/NrmAdminUserBanListPanel';
import { NrmAdminUserBanRegisterPanel } from '@/components/nrm/settings/NrmAdminUserBanRegisterPanel';
import { NrmAdminInquiryListPanel } from '@/components/nrm/settings/NrmAdminInquiryListPanel';
import { NrmAdminDeviceResetPanel } from '@/components/nrm/settings/NrmAdminDeviceResetPanel';
import { NrmAdminUserListPanel } from '@/components/nrm/settings/NrmAdminUserListPanel';
import { NrmInquiryQaPanel } from '@/components/nrm/settings/NrmInquiryQaPanel';
import { NrmActivityHistorySettingsPanel } from '@/components/nrm/settings/NrmActivityHistorySettingsPanel';
import { NrmMainLogoDisplayNameSettingsPanel } from '@/components/nrm/settings/NrmMainLogoDisplayNameSettingsPanel';
import { NrmSettingsOptionPicker } from '@/components/nrm/settings/NrmSettingsOptionPicker';
import { NrmFileLoggingSettingsPanel } from '@/components/nrm/settings/NrmFileLoggingSettingsPanel';
import { NrmHamburgerIcon } from '@/components/nrm/NrmHamburgerIcon';
import { NrmMainPageSettingsPanel } from '@/components/nrm/settings/NrmMainPageSettingsPanel';
import { hasLastfmCredentials } from '@/lib/nrmLastfmApiSettings';
import {
  ensureLastfmChartAccess,
  ensureSearchApiAccess,
  ensureSpotifyChartsSessionAccess,
  ensureSpotifyOfficialChartAccess,
  ensureSpotifySearchApiAccess,
} from '@/lib/nrmChartTokenGate';
import {
  isChartMenuPanel,
  type ChartMenuPanel,
} from '@/lib/nrmChartsPlatforms';
import { isPeriodChartMenuPanel } from '@/lib/nrmChartsMenu';
import {
  isSearchMenuPanel,
  type SearchKind,
  type SearchMenuPanel,
  type SearchPlatformId,
} from '@/lib/nrmSearchMenu';
import { nrmTokens } from '@/constants/nrmTokens';
import { useNrmUiAppearance } from '@/context/NrmUiAppearanceContext';
import {
  getNrmModalScrimColor,
  getNrmRootBackgroundColor,
} from '@/lib/nrmUiAppearanceColors';
import {
  getNrmAppCopyrightNotice,
  getNrmAppVersionLabel,
  getNrmVersionInfoAdminLine,
  getNrmVersionInfoCustomizingLine,
  shouldShowVersionInfoSerialNumber,
  NRM_APP_AUTHOR_DISPLAY,
} from '@/lib/nrmAppInfo';
import { getNrmAppSerialNo } from '@/lib/nrmAppSerialNo';
import {
  openMenuPanelStack,
  peekMenuPanel,
  popMenuPanel,
  pushMenuPanel,
  resetMenuPanelStack,
} from '@/lib/nrmMenuPanelStack';
import {
  isAdminSessionActive,
  registerAdminSessionListener,
} from '@/lib/nrmAdminSession';
import {
  getYoutubeSearchSuffixMode,
  listYoutubeSearchSuffixModes,
  NRM_YOUTUBE_SEARCH_SUFFIX_LABELS,
  setYoutubeSearchSuffixMode,
  type NrmYoutubeSearchSuffixMode,
} from '@/lib/nrmYoutubeSearchSettings';

type Props = {
  isDark: boolean;
  paddingHorizontal: number;
  onNavigateAppleMusicCharts?: () => void;
  onNavigateSpotifyChartsOfficial?: () => void;
  onNavigateSpotifyChartsCharts?: () => void;
  onNavigateLastfmCharts?: () => void;
  onNavigateMelonCharts?: () => void;
  onNavigatePeriodLastfmCharts?: () => void;
  onNavigatePeriodSpotifyCharts?: () => void;
  onNavigateGenreCharts?: () => void;
  onNavigateSpotifyArtistSearch?: () => void;
  onNavigateSpotifyAlbumSearch?: () => void;
  onNavigateSpotifyTrackSearch?: () => void;
  onNavigateLastfmArtistSearch?: () => void;
  onNavigateLastfmAlbumSearch?: () => void;
  onNavigateLastfmTrackSearch?: () => void;
  onNavigateMelonArtistSearch?: () => void;
  onNavigateMelonAlbumSearch?: () => void;
  onNavigateMelonTrackSearch?: () => void;
  /** Android — Bearer 없을 때 charts.spotify.com WebView 로그인 모달 호출 */
  onRequestChartsBearerWebView?: () => Promise<boolean>;
  /** 앱 — Last.fm API Key 미설정·오류 오버레이 */
  onShowLastfmAuthInvalid?: (code?: 'auth_failed' | 'not_configured') => void;
  /** 메인 차트 좌측 네비 버튼 영역 — 스와이프 캡처에서 제외 (px, 화면 왼쪽 기준) */
  leftEdgeSwipeReserve?: number;
  /** 상단 바에서 메뉴 버튼을 렌더할 때 내장 FAB 숨김 */
  hideMenuFab?: boolean;
  /** 메뉴 상단 로고 탭 — 메인 홈 복귀 */
  onLogoPressHome?: () => void;
};

export type NrmAppMenuHandle = {
  openMenu: () => void;
  openChartsSession: () => void;
  openLastfmTokenSettings: () => void;
  openSpotifyTokenSettings: () => void;
};

const EDGE_HIT_WIDTH = 32;
/** 좌측 가장자리 스와이프 인식 폭 — 넓으면 차트 필터(일간·Korea) 탭이 막힘 */
const MOBILE_SWIPE_EDGE_WIDTH = 24;
const EDGE_SWIPE_OPEN_PX = 44;
const IS_NATIVE_MOBILE = Platform.OS === 'ios' || Platform.OS === 'android';

type Panel =
  | 'root'
  | 'settings'
  | 'appSettings'
  | 'searchSettings'
  | 'translationSettings'
  | 'screenSettings'
  | 'spotifyApiManage'
  | 'lastfmApiManage'
  | 'deeplApiManage'
  | 'lyricsOrderSettings'
  | 'alignLyricsLangDetectionSettings'
  | 'genreTagSettings'
  | 'weeklySnapshotSettings'
  | 'lyricsManage'
  | 'melonAdultAuth'
  | 'downloadManage'
  | 'downloadPathSettings'
  | 'downloadExtensionSettings'
  | 'downloadQualitySettings'
  | 'downloadVbrSettings'
  | 'downloadLosslessSettings'
  | 'downloadFilenameSettings'
  | 'downloadMetadataSettings'
  | 'downloadLyricsEmbedSettings'
  | 'downloadLyricsSyncerSettings'
  | 'downloadLyricsOutputSettings'
  | 'mainPageSettings'
  | 'historyManagementSettings'
  | 'mainLogoDisplayNameSettings'
  | 'fileLoggingSettings'
  | 'inquirySettings'
  | 'adminPage'
  | 'adminAlarmRegister'
  | 'adminUserBanList'
  | 'adminUserBanRegister'
  | 'adminInquiryList'
  | 'adminUserList'
  | 'adminDeviceReset'
  | ChartMenuPanel
  | 'periodCharts'
  | SearchMenuPanel;

export const NrmAppMenu = forwardRef<NrmAppMenuHandle, Props>(function NrmAppMenu(
  {
    isDark,
    paddingHorizontal,
    onNavigateAppleMusicCharts,
    onNavigateSpotifyChartsOfficial,
    onNavigateSpotifyChartsCharts,
    onNavigateLastfmCharts,
    onNavigateMelonCharts,
    onNavigatePeriodLastfmCharts,
    onNavigatePeriodSpotifyCharts,
    onNavigateGenreCharts,
    onNavigateSpotifyArtistSearch,
    onNavigateSpotifyAlbumSearch,
    onNavigateSpotifyTrackSearch,
    onNavigateLastfmArtistSearch,
    onNavigateLastfmAlbumSearch,
    onNavigateLastfmTrackSearch,
    onNavigateMelonArtistSearch,
    onNavigateMelonAlbumSearch,
    onNavigateMelonTrackSearch,
    onRequestChartsBearerWebView,
    onShowLastfmAuthInvalid,
    leftEdgeSwipeReserve,
    hideMenuFab = false,
    onLogoPressHome,
  },
  ref,
) {
  const { setAppearanceMode } = useNrmUiAppearance();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const drawerW = Math.max(280, Math.min(380, Math.round(windowWidth * 0.88) || 320));
  const drawerWRef = useRef(drawerW);
  drawerWRef.current = drawerW;
  const translateX = useRef(new Animated.Value(-320)).current;
  const spotifyBackHandlerRef = useRef<(() => boolean) | null>(null);
  const spotifyDrawerDismissRef = useRef<(() => void) | null>(null);
  const [spotifyFocusChartsSession, setSpotifyFocusChartsSession] = useState(false);
  const lastfmBackHandlerRef = useRef<(() => boolean) | null>(null);
  const lastfmDrawerDismissRef = useRef<(() => void) | null>(null);
  const deeplBackHandlerRef = useRef<(() => boolean) | null>(null);
  const deeplDrawerDismissRef = useRef<(() => void) | null>(null);
  const lyricsOrderBackHandlerRef = useRef<(() => boolean) | null>(null);
  const lyricsOrderDrawerDismissRef = useRef<(() => void) | null>(null);
  const mainLogoDisplayNameBackHandlerRef = useRef<(() => boolean) | null>(null);
  const mainLogoDisplayNameDrawerDismissRef = useRef<(() => void) | null>(null);
  const melonAdultBackHandlerRef = useRef<(() => boolean) | null>(null);
  const melonAdultDrawerDismissRef = useRef<(() => void) | null>(null);

  // register* 콜백 — useCallback으로 참조 안정화 (자식 panel useEffect 재실행 방지)
  const registerSpotifyBackHandler = useCallback((h: (() => boolean) | null) => { spotifyBackHandlerRef.current = h; }, []);
  const registerSpotifyDrawerDismiss = useCallback((h: (() => void) | null) => { spotifyDrawerDismissRef.current = h; }, []);
  const registerLastfmBackHandler = useCallback((h: (() => boolean) | null) => { lastfmBackHandlerRef.current = h; }, []);
  const registerLastfmDrawerDismiss = useCallback((h: (() => void) | null) => { lastfmDrawerDismissRef.current = h; }, []);
  const registerDeepLBackHandler = useCallback((h: (() => boolean) | null) => { deeplBackHandlerRef.current = h; }, []);
  const registerDeepLDrawerDismiss = useCallback((h: (() => void) | null) => { deeplDrawerDismissRef.current = h; }, []);
  const registerLyricsOrderBackHandler = useCallback((h: (() => boolean) | null) => { lyricsOrderBackHandlerRef.current = h; }, []);
  const registerLyricsOrderDrawerDismiss = useCallback((h: (() => void) | null) => { lyricsOrderDrawerDismissRef.current = h; }, []);
  const registerMainLogoDisplayNameBackHandler = useCallback((h: (() => boolean) | null) => { mainLogoDisplayNameBackHandlerRef.current = h; }, []);
  const registerMainLogoDisplayNameDrawerDismiss = useCallback((h: (() => void) | null) => { mainLogoDisplayNameDrawerDismissRef.current = h; }, []);
  const registerMelonAdultBackHandler = useCallback((h: (() => boolean) | null) => { melonAdultBackHandlerRef.current = h; }, []);
  const registerMelonAdultDrawerDismiss = useCallback((h: (() => void) | null) => { melonAdultDrawerDismissRef.current = h; }, []);

  const [open, setOpen] = useState(false);
  const [panelStack, setPanelStack] = useState<Panel[]>(() =>
    resetMenuPanelStack<Panel>('root'),
  );
  const panel = peekMenuPanel(panelStack);
  const [versionOverlayOpen, setVersionOverlayOpen] = useState(false);
  const [adminSessionActive, setAdminSessionActive] = useState(false);
  const [appSerialNo, setAppSerialNo] = useState('');
  const hasAppSerialNo = appSerialNo.trim().length > 0;

  const resetMenuPanels = useCallback((next: Panel = 'root') => {
    setPanelStack(resetMenuPanelStack(next));
  }, []);

  const pushPanel = useCallback((next: Panel) => {
    setPanelStack((stack) => pushMenuPanel(stack, next));
  }, []);

  const popPanel = useCallback(() => {
    setPanelStack((stack) => popMenuPanel(stack));
  }, []);

  const goBackToRoot = useCallback(() => {
    resetMenuPanels('root');
  }, [resetMenuPanels]);
  const [suffixMode, setSuffixMode] =
    useState<NrmYoutubeSearchSuffixMode>('default');
  const [lastfmEntryScreen, setLastfmEntryScreen] = useState<
    'manage' | 'issue'
  >('issue');

  useEffect(() => {
    void isAdminSessionActive().then(setAdminSessionActive);
    registerAdminSessionListener(setAdminSessionActive);
    return () => registerAdminSessionListener(null);
  }, []);

  useEffect(() => {
    void getNrmAppSerialNo().then(setAppSerialNo);
  }, []);

  useEffect(() => {
    if (!open) return;
    void getNrmAppSerialNo().then(setAppSerialNo);
  }, [open]);

  useEffect(() => {
    if (!versionOverlayOpen) return;
    void getNrmAppSerialNo().then(setAppSerialNo);
  }, [versionOverlayOpen]);

  useEffect(() => {
    if (panel !== 'searchSettings') return;
    let cancelled = false;
    void getYoutubeSearchSuffixMode().then((m) => {
      if (!cancelled) setSuffixMode(m);
    });
    return () => {
      cancelled = true;
    };
  }, [panel]);

  const openMenu = useCallback(() => {
    // setOpen 전에 미리 위치 설정 → 첫 렌더에서 빈 화면 방지
    translateX.setValue(-drawerWRef.current);
    resetMenuPanels('root');
    setVersionOverlayOpen(false);
    setOpen(true);
  }, [resetMenuPanels, translateX]);

  const dismissDrawer = useCallback(() => {
    setVersionOverlayOpen(false);
    Animated.timing(translateX, {
      toValue: -drawerW,
      duration: 220,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setOpen(false);
        resetMenuPanels('root');
      }
    });
  }, [drawerW, resetMenuPanels, translateX]);

  useEffect(() => {
    if (!open) setVersionOverlayOpen(false);
  }, [open]);

  const closeMenuAndGoHome = useCallback(() => {
    onLogoPressHome?.();
    setOpen(false);
    resetMenuPanels('root');
    translateX.setValue(-drawerW);
  }, [drawerW, onLogoPressHome, resetMenuPanels, translateX]);

  const closeMenuAndNavigateAppleMusicCharts = useCallback(() => {
    onNavigateAppleMusicCharts?.();
    setOpen(false);
    resetMenuPanels('root');
    translateX.setValue(-drawerW);
  }, [drawerW, onNavigateAppleMusicCharts, resetMenuPanels, translateX]);

  const openSpotifyTokenSettings = useCallback(() => {
    setSpotifyFocusChartsSession(false);
    translateX.setValue(0);  // 첫 렌더부터 올바른 위치 (애니메이션 없이 즉시)
    setOpen(true);
    setPanelStack(openMenuPanelStack<Panel>([], 'spotifyApiManage'));
  }, [translateX]);

  const openSpotifyChartsSessionSettings = useCallback(() => {
    setSpotifyFocusChartsSession(true);
    translateX.setValue(0);
    setOpen(true);
    setPanelStack(openMenuPanelStack<Panel>([], 'spotifyApiManage'));
  }, [translateX]);

  const openLastfmApiManage = useCallback(async () => {
    const registered = await hasLastfmCredentials();
    setLastfmEntryScreen(registered ? 'manage' : 'issue');
    translateX.setValue(0);
    setOpen(true);
    setPanelStack((stack) =>
      openMenuPanelStack(stack, 'lastfmApiManage'),
    );
  }, [translateX]);

  const openLastfmTokenSettings = openLastfmApiManage;

  const lastfmGateHandlers = useMemo(
    () => ({
      onOpenLastfmTokenSettings: openLastfmTokenSettings,
      ...(onShowLastfmAuthInvalid
        ? { onShowAuthInvalid: onShowLastfmAuthInvalid }
        : {}),
    }),
    [onShowLastfmAuthInvalid, openLastfmTokenSettings],
  );

  useImperativeHandle(
    ref,
    () => ({
      openMenu,
      openChartsSession: openSpotifyChartsSessionSettings,
      openLastfmTokenSettings,
      openSpotifyTokenSettings,
    }),
    [openMenu, openLastfmTokenSettings, openSpotifyChartsSessionSettings, openSpotifyTokenSettings],
  );

  const openDownloadSettingsFromGlobal = useCallback(() => {
    translateX.setValue(0);
    setOpen(true);
    setPanelStack(['root', 'downloadPathSettings']);
  }, [translateX]);

  const openLyricsEmbedSettingsFromGlobal = useCallback(() => {
    translateX.setValue(0);
    setOpen(true);
    setPanelStack(['root', 'downloadLyricsEmbedSettings']);
  }, [translateX]);

  useEffect(() => {
    registerOpenDownloadSettingsListener(openDownloadSettingsFromGlobal);
    return () => {
      registerOpenDownloadSettingsListener(null);
    };
  }, [openDownloadSettingsFromGlobal]);

  useEffect(() => {
    registerOpenLyricsEmbedSettingsListener(openLyricsEmbedSettingsFromGlobal);
    return () => {
      registerOpenLyricsEmbedSettingsListener(null);
    };
  }, [openLyricsEmbedSettingsFromGlobal]);

  const closeMenuAndNavigateSpotifyChartsOfficial = useCallback(async () => {
    const ok = await ensureSpotifyOfficialChartAccess(openSpotifyTokenSettings);
    if (!ok) return;
    onNavigateSpotifyChartsOfficial?.();
    setOpen(false);
    resetMenuPanels('root');
    translateX.setValue(-drawerW);
  }, [
    drawerW,
    onNavigateSpotifyChartsOfficial,
    openSpotifyTokenSettings,
    translateX,
  ]);

  const closeMenuAndNavigateSpotifyChartsCharts = useCallback(async () => {
    const ok = await ensureSpotifyChartsSessionAccess(
      openSpotifyChartsSessionSettings,
      onRequestChartsBearerWebView,
    );
    if (!ok) return;
    onNavigateSpotifyChartsCharts?.();
    setOpen(false);
    resetMenuPanels('root');
    translateX.setValue(-drawerW);
  }, [
    drawerW,
    onNavigateSpotifyChartsCharts,
    onRequestChartsBearerWebView,
    openSpotifyChartsSessionSettings,
    translateX,
  ]);

  const closeMenuAndNavigateLastfmCharts = useCallback(async () => {
    const ok = await ensureLastfmChartAccess(lastfmGateHandlers);
    if (!ok) return;
    onNavigateLastfmCharts?.();
    setOpen(false);
    resetMenuPanels('root');
    translateX.setValue(-drawerW);
  }, [drawerW, lastfmGateHandlers, onNavigateLastfmCharts, translateX]);

  const closeMenuAndNavigatePeriodLastfmCharts = useCallback(async () => {
    const ok = await ensureLastfmChartAccess(lastfmGateHandlers);
    if (!ok) return;
    onNavigatePeriodLastfmCharts?.();
    setOpen(false);
    resetMenuPanels('root');
    translateX.setValue(-drawerW);
  }, [
    drawerW,
    lastfmGateHandlers,
    onNavigatePeriodLastfmCharts,
    translateX,
  ]);

  const closeMenuAndNavigatePeriodSpotifyCharts = useCallback(async () => {
    const ok = await ensureSpotifyChartsSessionAccess(
      openSpotifyChartsSessionSettings,
      onRequestChartsBearerWebView,
    );
    if (!ok) return;
    onNavigatePeriodSpotifyCharts?.();
    setOpen(false);
    resetMenuPanels('root');
    translateX.setValue(-drawerW);
  }, [
    drawerW,
    onNavigatePeriodSpotifyCharts,
    onRequestChartsBearerWebView,
    openSpotifyChartsSessionSettings,
    translateX,
  ]);

  const closeMenuAndNavigateMelonCharts = useCallback(() => {
    onNavigateMelonCharts?.();
    setOpen(false);
    resetMenuPanels('root');
    translateX.setValue(-drawerW);
  }, [drawerW, onNavigateMelonCharts, translateX]);

  const closeMenuAndNavigateGenreCharts = useCallback(() => {
    onNavigateGenreCharts?.();
    setOpen(false);
    resetMenuPanels('root');
    translateX.setValue(-drawerW);
  }, [drawerW, onNavigateGenreCharts, translateX]);

  const closeMenuAndNavigateSpotifySearch = useCallback(
    async (kind: SearchKind) => {
      const ok = await ensureSpotifySearchApiAccess(openSpotifyTokenSettings);
      if (!ok) return;
      if (kind === 'artist') onNavigateSpotifyArtistSearch?.();
      else if (kind === 'album') onNavigateSpotifyAlbumSearch?.();
      else onNavigateSpotifyTrackSearch?.();
      setOpen(false);
      resetMenuPanels('root');
      translateX.setValue(-drawerW);
    },
    [
      drawerW,
      onNavigateSpotifyAlbumSearch,
      onNavigateSpotifyArtistSearch,
      onNavigateSpotifyTrackSearch,
      openSpotifyTokenSettings,
      translateX,
    ],
  );

  const closeMenuAndNavigateLastfmSearch = useCallback(
    async (kind: SearchKind) => {
      const ok = await ensureSearchApiAccess(lastfmGateHandlers);
      if (!ok) return;
      if (kind === 'artist') onNavigateLastfmArtistSearch?.();
      else if (kind === 'album') onNavigateLastfmAlbumSearch?.();
      else onNavigateLastfmTrackSearch?.();
      setOpen(false);
      resetMenuPanels('root');
      translateX.setValue(-drawerW);
    },
    [
      drawerW,
      onNavigateLastfmAlbumSearch,
      onNavigateLastfmArtistSearch,
      onNavigateLastfmTrackSearch,
      lastfmGateHandlers,
      translateX,
    ],
  );

  const closeMenuAndNavigateMelonSearch = useCallback(
    (kind: SearchKind) => {
      if (kind === 'artist') onNavigateMelonArtistSearch?.();
      else if (kind === 'album') onNavigateMelonAlbumSearch?.();
      else onNavigateMelonTrackSearch?.();
      setOpen(false);
      resetMenuPanels('root');
      translateX.setValue(-drawerW);
    },
    [
      drawerW,
      onNavigateMelonAlbumSearch,
      onNavigateMelonArtistSearch,
      onNavigateMelonTrackSearch,
      translateX,
    ],
  );

  /** Android 하드웨어 뒤로·Modal 닫기: 내부 서브화면 우선, 아니면 스택 pop, 루트면 드로어 닫기 */
  const goBackInMenu = useCallback(() => {
    if (panel === 'spotifyApiManage' && spotifyBackHandlerRef.current?.()) {
      return;
    }
    if (panel === 'lastfmApiManage' && lastfmBackHandlerRef.current?.()) {
      return;
    }
    if (panel === 'deeplApiManage' && deeplBackHandlerRef.current?.()) {
      return;
    }
    if (panel === 'lyricsOrderSettings' && lyricsOrderBackHandlerRef.current?.()) {
      return;
    }
    if (panel === 'mainLogoDisplayNameSettings' && mainLogoDisplayNameBackHandlerRef.current?.()) {
      return;
    }
    if (panel === 'melonAdultAuth' && melonAdultBackHandlerRef.current?.()) {
      return;
    }

    if (panel === 'root' || panelStack.length <= 1) {
      dismissDrawer();
      return;
    }
    popPanel();
  }, [dismissDrawer, panel, panelStack.length, popPanel]);

  useEffect(() => {
    if (panel !== 'spotifyApiManage') {
      spotifyBackHandlerRef.current = null;
      spotifyDrawerDismissRef.current = null;
    }
    if (panel !== 'lastfmApiManage') {
      lastfmBackHandlerRef.current = null;
      lastfmDrawerDismissRef.current = null;
    }
    if (panel !== 'deeplApiManage') {
      deeplBackHandlerRef.current = null;
      deeplDrawerDismissRef.current = null;
    }
    if (panel !== 'lyricsOrderSettings') {
      lyricsOrderBackHandlerRef.current = null;
      lyricsOrderDrawerDismissRef.current = null;
    }
    if (panel !== 'mainLogoDisplayNameSettings') {
      mainLogoDisplayNameBackHandlerRef.current = null;
      mainLogoDisplayNameDrawerDismissRef.current = null;
    }
    if (panel !== 'melonAdultAuth') {
      melonAdultBackHandlerRef.current = null;
      melonAdultDrawerDismissRef.current = null;
    }
  }, [panel]);

  const requestDrawerDismiss = useCallback(() => {
    if (panel === 'spotifyApiManage' && spotifyDrawerDismissRef.current) {
      spotifyDrawerDismissRef.current();
      return;
    }
    if (panel === 'lastfmApiManage' && lastfmDrawerDismissRef.current) {
      lastfmDrawerDismissRef.current();
      return;
    }
    if (panel === 'deeplApiManage' && deeplDrawerDismissRef.current) {
      deeplDrawerDismissRef.current();
      return;
    }
    if (panel === 'lyricsOrderSettings' && lyricsOrderDrawerDismissRef.current) {
      lyricsOrderDrawerDismissRef.current();
      return;
    }
    if (panel === 'mainLogoDisplayNameSettings' && mainLogoDisplayNameDrawerDismissRef.current) {
      mainLogoDisplayNameDrawerDismissRef.current();
      return;
    }
    if (panel === 'melonAdultAuth' && melonAdultDrawerDismissRef.current) {
      melonAdultDrawerDismissRef.current();
      return;
    }
    dismissDrawer();
  }, [dismissDrawer, panel]);

  // open이 false→true 전환 시 슬라이드인 (openMenu에서 이미 -drawerW 설정됨)
  useEffect(() => {
    if (!open) return;
    Animated.timing(translateX, {
      toValue: 0,
      duration: 240,
      useNativeDriver: true,
    }).start();
  }, [open, translateX]);

  // 메뉴가 열린 상태에서 화면 폭 변경 시에만 위치 재조정
  // open은 ref로 읽어 이 effect가 open 전환 시엔 실행되지 않도록 함
  useEffect(() => {
    if (!open) return;
    translateX.setValue(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawerW]);

  const rootBg = getNrmRootBackgroundColor(isDark);
  const modalScrim = getNrmModalScrimColor(isDark);
  const cardBg = isDark ? nrmTokens.color.surfaceTile1 : nrmTokens.color.canvas;
  const cardBorder = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const titleColor = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
  const bodyColor = isDark ? nrmTokens.color.textMuted : nrmTokens.color.inkMuted80;
  const rowHover = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';

  const openMenuRef = useRef(openMenu);
  openMenuRef.current = openMenu;

  const requestDrawerDismissRef = useRef(requestDrawerDismiss);
  requestDrawerDismissRef.current = requestDrawerDismiss;

  const edgePanHandlers = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) =>
        gesture.dx > 6 && Math.abs(gesture.dy) < Math.abs(gesture.dx) * 1.8,
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx >= EDGE_SWIPE_OPEN_PX) {
          openMenuRef.current();
        }
      },
    }),
  ).current;

  const mobileSwipeEdgeWidth = MOBILE_SWIPE_EDGE_WIDTH + insets.left;
  /** 차트 네비 버튼과 겹치지 않는 좁은 물리 가장자리 스와이프 */
  const mobileEdgeStripWidth = 16;

  const mobileEdgePanHandlers = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gesture) =>
          gesture.dx > 8 && Math.abs(gesture.dy) < Math.abs(gesture.dx) * 1.5,
        onPanResponderTerminationRequest: () => true,
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx >= EDGE_SWIPE_OPEN_PX) {
            openMenuRef.current();
          }
        },
      }),
    [],
  );

  const handleAccent = isDark
    ? nrmTokens.color.primaryOnDark
    : nrmTokens.color.primary;
  const edgeRailColor = isDark
    ? 'rgba(255, 255, 255, 0.14)'
    : 'rgba(0, 0, 0, 0.08)';

  const nativeHalfPad = paddingHorizontal / 2;
  const webMenuInset = Math.round(
    (nrmTokens.space.lg + nrmTokens.space.xs) / 2,
  );
  const menuFabLeft =
    Platform.OS === 'web'
      ? webMenuInset
      : insets.left + nativeHalfPad;
  const menuFabTop =
    Platform.OS === 'web'
      ? Math.max(insets.top, nrmTokens.space.sm) + webMenuInset
      : insets.top + nativeHalfPad;

  return (
    <>
      {IS_NATIVE_MOBILE && !open && !hideMenuFab ? (
        <Pressable
          onPress={openMenu}
          hitSlop={8}
          style={({ pressed }) => [
            styles.menuFab,
            {
              left: menuFabLeft,
              top: menuFabTop,
            },
            pressed && styles.menuFabPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="메뉴">
          <NrmHamburgerIcon
            color={isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink}
            size={22}
          />
        </Pressable>
      ) : null}

      {Platform.OS === 'web' && !open ? (
        <View
          style={[
            styles.edgeZone,
            {
              width: EDGE_HIT_WIDTH + insets.left,
              paddingLeft: insets.left,
            },
          ]}
          pointerEvents="box-none"
          {...edgePanHandlers.panHandlers}>
          {Platform.OS === 'web' ? (
            <Pressable
              onPress={openMenu}
              accessibilityRole="button"
              accessibilityLabel="메뉴 열기"
              style={({ pressed }) => [
                styles.edgePress,
                pressed && styles.edgePressPressed,
                styles.edgePressWeb,
              ]}>
              <View
                style={[
                  styles.edgeRail,
                  { backgroundColor: edgeRailColor },
                ]}
              />
              <View
                style={[
                  styles.edgeHandle,
                  {
                    borderColor: isDark
                      ? nrmTokens.color.borderOnDark
                      : nrmTokens.color.hairline,
                    backgroundColor: isDark
                      ? 'rgba(255, 255, 255, 0.06)'
                      : 'rgba(255, 255, 255, 0.72)',
                  },
                ]}>
                <View
                  style={[styles.edgeGrip, { backgroundColor: handleAccent }]}
                />
                <View
                  style={[styles.edgeGrip, { backgroundColor: handleAccent }]}
                />
              </View>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <Modal
        visible={open}
        transparent
        animationType="none"
        onRequestClose={goBackInMenu}
        statusBarTranslucent
        hardwareAccelerated>
        <View style={[styles.modalWrap, { backgroundColor: rootBg }]}>
          <Pressable
            style={[StyleSheet.absoluteFill, { backgroundColor: modalScrim }]}
            onPress={requestDrawerDismiss}
            accessibilityLabel="닫기"
          />
          <Animated.View
            style={[
              styles.drawer,
              {
                width: drawerW,
                backgroundColor: cardBg,
                borderColor: cardBorder,
                paddingTop: insets.top + nrmTokens.space.lg,
                paddingBottom: insets.bottom,
                transform: [{ translateX }],
              },
            ]}
            accessibilityViewIsModal>
            {panel === 'root' ? (
              <NrmAppDrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <View style={styles.menuLogoGap}>
                  <NrmLogo
                    layout="stacked"
                    compact
                    tone={isDark ? 'dark' : 'light'}
                    onPress={onLogoPressHome ? closeMenuAndGoHome : undefined}
                  />
                </View>
                <Pressable
                  onPress={() => pushPanel('charts')}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rowLabel, { color: titleColor }]}>
                    실시간 차트
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={bodyColor}
                  />
                </Pressable>
                <Pressable
                  onPress={() => pushPanel('periodCharts')}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rowLabel, { color: titleColor }]}>
                    기간별 차트
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={bodyColor}
                  />
                </Pressable>
                <Pressable
                  onPress={closeMenuAndNavigateGenreCharts}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rowLabel, { color: titleColor }]}>
                    장르별 차트
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={bodyColor}
                  />
                </Pressable>
                <Pressable
                  onPress={() => pushPanel('search')}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rowLabel, { color: titleColor }]}>
                    음악 검색
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={bodyColor}
                  />
                </Pressable>
                <Pressable
                  onPress={() => pushPanel('settings')}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rowLabel, { color: titleColor }]}>
                    앱 설정
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={bodyColor}
                  />
                </Pressable>
                <Pressable
                  onPress={() => pushPanel('downloadManage')}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rowLabel, { color: titleColor }]}>
                    다운로드 설정
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={bodyColor}
                  />
                </Pressable>
                <Pressable
                  onPress={() => pushPanel('lyricsManage')}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rowLabel, { color: titleColor }]}>
                    가사 관리
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={bodyColor}
                  />
                </Pressable>
                {adminSessionActive ? (
                  <Pressable
                    onPress={hasAppSerialNo ? () => pushPanel('adminPage') : undefined}
                    disabled={!hasAppSerialNo}
                    style={({ pressed }) => [
                      styles.row,
                      !hasAppSerialNo && styles.rowDisabled,
                      hasAppSerialNo && pressed && { backgroundColor: rowHover },
                    ]}>
                    <Text
                      style={[
                        styles.rowLabel,
                        { color: titleColor },
                        !hasAppSerialNo && styles.rowLabelDisabled,
                      ]}>
                      관리자페이지
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={20}
                      color={!hasAppSerialNo ? rowHover : bodyColor}
                    />
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => setVersionOverlayOpen(true)}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rowLabel, { color: titleColor }]}>
                    버전 정보
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={bodyColor}
                  />
                </Pressable>
              </NrmAppDrawerShell>
            ) : null}

            {panel === 'settings' ? (
              <NrmAppDrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <Pressable
                  onPress={popPanel}
                  style={styles.backRow}
                  accessibilityRole="button"
                  accessibilityLabel="뒤로">
                  <Ionicons
                    name="chevron-back"
                    size={22}
                    color={nrmTokens.color.primary}
                  />
                  <Text style={styles.backText}>뒤로</Text>
                </Pressable>
                <Text style={[styles.panelTitle, { color: titleColor }]}>
                  앱 설정
                </Text>
                <Pressable
                  onPress={() => pushPanel('appSettings')}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rowLabel, { color: titleColor }]}>
                    API 설정
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={bodyColor}
                  />
                </Pressable>
                <Pressable
                  onPress={() => pushPanel('searchSettings')}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rowLabel, { color: titleColor }]}>
                    검색 설정
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={bodyColor}
                  />
                </Pressable>
                <Pressable
                  onPress={() => pushPanel('screenSettings')}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rowLabel, { color: titleColor }]}>
                    화면 설정
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={bodyColor}
                  />
                </Pressable>
                <Pressable
                  onPress={() => pushPanel('mainPageSettings')}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rowLabel, { color: titleColor }]}>
                    메인페이지 설정
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={bodyColor}
                  />
                </Pressable>
                <Pressable
                  onPress={() => pushPanel('weeklySnapshotSettings')}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rowLabel, { color: titleColor }]}>
                    주간차트 스냅샷 요일 설정
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={bodyColor}
                  />
                </Pressable>
                <Pressable
                  onPress={() => pushPanel('genreTagSettings')}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rowLabel, { color: titleColor }]}>
                    장르 태그 설정
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={bodyColor}
                  />
                </Pressable>
                <Pressable
                  onPress={() => pushPanel('historyManagementSettings')}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rowLabel, { color: titleColor }]}>
                    History 관리
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={bodyColor}
                  />
                </Pressable>
                <Pressable
                  onPress={() => pushPanel('mainLogoDisplayNameSettings')}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rowLabel, { color: titleColor }]}>
                    앱 이름 변경
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={bodyColor}
                  />
                </Pressable>
                <Pressable
                  onPress={() => pushPanel('fileLoggingSettings')}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rowLabel, { color: titleColor }]}>
                    로깅
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={bodyColor}
                  />
                </Pressable>
                <Pressable
                  onPress={hasAppSerialNo ? () => pushPanel('inquirySettings') : undefined}
                  disabled={!hasAppSerialNo}
                  style={({ pressed }) => [
                    styles.row,
                    !hasAppSerialNo && styles.rowDisabled,
                    hasAppSerialNo && pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text
                    style={[
                      styles.rowLabel,
                      { color: titleColor },
                      !hasAppSerialNo && styles.rowLabelDisabled,
                    ]}>
                    Q&A
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={!hasAppSerialNo ? rowHover : bodyColor}
                  />
                </Pressable>
              </NrmAppDrawerShell>
            ) : null}

            {panel === 'appSettings' ? (
              <NrmAppDrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <Pressable
                  onPress={popPanel}
                  style={styles.backRow}
                  accessibilityRole="button"
                  accessibilityLabel="뒤로">
                  <Ionicons
                    name="chevron-back"
                    size={22}
                    color={nrmTokens.color.primary}
                  />
                  <Text style={styles.backText}>뒤로</Text>
                </Pressable>
                <Text style={[styles.panelTitle, { color: titleColor }]}>
                  API 설정
                </Text>
                <Pressable
                  onPress={() => pushPanel('spotifyApiManage')}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rowLabel, { color: titleColor }]}>
                    Spotify API 토큰 관리
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={bodyColor}
                  />
                </Pressable>
                <Pressable
                  onPress={() => void openLastfmApiManage()}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rowLabel, { color: titleColor }]}>
                    Last.fm API 토큰 관리
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={bodyColor}
                  />
                </Pressable>
                <Pressable
                  onPress={() => pushPanel('deeplApiManage')}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rowLabel, { color: titleColor }]}>
                    deepL 번역기 API KEY 관리
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={bodyColor}
                  />
                </Pressable>
              </NrmAppDrawerShell>
            ) : null}

            {panel === 'lyricsOrderSettings' ? (
              <NrmAppDrawerShell
                titleColor={titleColor}
                onDismiss={requestDrawerDismiss}
                compactFooter={Platform.OS !== 'web'}>
                <NrmLyricsOrderSettingsPanel
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  rowHover={rowHover}
                  onBack={popPanel}
                  onCloseDrawer={dismissDrawer}
                  registerBackHandler={registerLyricsOrderBackHandler}
                  registerDrawerDismiss={registerLyricsOrderDrawerDismiss}
                />
              </NrmAppDrawerShell>
            ) : null}

            {panel === 'alignLyricsLangDetectionSettings' ? (
              <NrmAppDrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <Pressable
                  onPress={popPanel}
                  style={styles.backRow}
                  accessibilityRole="button"
                  accessibilityLabel="뒤로">
                  <Ionicons
                    name="chevron-back"
                    size={22}
                    color={nrmTokens.color.primary}
                  />
                  <Text style={styles.backText}>뒤로</Text>
                </Pressable>
                <Text style={[styles.panelTitle, { color: titleColor }]}>
                  가사 언어 탐지 설정
                </Text>
                <NrmAlignLyricsLangDetectionPanel
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  rowHover={rowHover}
                />
              </NrmAppDrawerShell>
            ) : null}

            {panel === 'weeklySnapshotSettings' ? (
              <NrmAppDrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <NrmWeeklySnapshotSettingsPanel
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  rowHover={rowHover}
                  onBack={popPanel}
                />
              </NrmAppDrawerShell>
            ) : null}

            {panel === 'genreTagSettings' ? (
              <NrmAppDrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <NrmGenreTagSettingsPanel
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  rowHover={rowHover}
                  onBack={popPanel}
                />
              </NrmAppDrawerShell>
            ) : null}

            {panel === 'spotifyApiManage' ? (
              <NrmAppDrawerShell
                titleColor={titleColor}
                onDismiss={requestDrawerDismiss}
                compactFooter={Platform.OS !== 'web'}>
                <NrmSpotifyApiManagePanel
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  rowHover={rowHover}
                  focusChartsSession={spotifyFocusChartsSession}
                  onChartsSessionFocusConsumed={() =>
                    setSpotifyFocusChartsSession(false)
                  }
                  onBack={popPanel}
                  onCloseDrawer={dismissDrawer}
                  registerBackHandler={registerSpotifyBackHandler}
                  registerDrawerDismiss={registerSpotifyDrawerDismiss}
                />
              </NrmAppDrawerShell>
            ) : null}

            {panel === 'lastfmApiManage' ? (
              <NrmAppDrawerShell
                titleColor={titleColor}
                onDismiss={requestDrawerDismiss}
                compactFooter={Platform.OS !== 'web'}>
                <NrmLastfmApiManagePanel
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  rowHover={rowHover}
                  initialScreen={lastfmEntryScreen}
                  onBack={popPanel}
                  onCloseDrawer={dismissDrawer}
                  registerBackHandler={registerLastfmBackHandler}
                  registerDrawerDismiss={registerLastfmDrawerDismiss}
                />
              </NrmAppDrawerShell>
            ) : null}

            {panel === 'deeplApiManage' ? (
              <NrmAppDrawerShell
                titleColor={titleColor}
                onDismiss={requestDrawerDismiss}
                compactFooter={Platform.OS !== 'web'}>
                <NrmDeepLApiManagePanel
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  rowHover={rowHover}
                  onBack={popPanel}
                  onCloseDrawer={dismissDrawer}
                  registerBackHandler={registerDeepLBackHandler}
                  registerDrawerDismiss={registerDeepLDrawerDismiss}
                />
              </NrmAppDrawerShell>
            ) : null}

            {panel === 'downloadManage' ? (
              <NrmAppDrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <Pressable
                  onPress={popPanel}
                  style={styles.backRow}
                  accessibilityRole="button"
                  accessibilityLabel="뒤로">
                  <Ionicons
                    name="chevron-back"
                    size={22}
                    color={nrmTokens.color.primary}
                  />
                  <Text style={styles.backText}>뒤로</Text>
                </Pressable>
                <Text style={[styles.panelTitle, { color: titleColor }]}>
                  다운로드 설정
                </Text>
                <Pressable
                  onPress={() => pushPanel('downloadPathSettings')}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rowLabel, { color: titleColor }]}>
                    {Platform.OS === 'ios' ? '저장 위치 안내' : '다운로드 경로 설정'}
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={bodyColor}
                  />
                </Pressable>
                <Pressable
                  onPress={() => pushPanel('downloadExtensionSettings')}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rowLabel, { color: titleColor }]}>
                    확장자 설정
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={bodyColor}
                  />
                </Pressable>
                <Pressable
                  onPress={() => pushPanel('downloadQualitySettings')}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rowLabel, { color: titleColor }]}>
                    비트레이트 설정
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={bodyColor}
                  />
                </Pressable>
                <Pressable
                  onPress={() => pushPanel('downloadVbrSettings')}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rowLabel, { color: titleColor }]}>
                    VBR 설정
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={bodyColor}
                  />
                </Pressable>
                <Pressable
                  onPress={() => pushPanel('downloadLosslessSettings')}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rowLabel, { color: titleColor }]}>
                    무손실 설정
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={bodyColor}
                  />
                </Pressable>
                <Pressable
                  onPress={() => pushPanel('downloadFilenameSettings')}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rowLabel, { color: titleColor }]}>
                    파일명 설정
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={bodyColor}
                  />
                </Pressable>
              </NrmAppDrawerShell>
            ) : null}

            {panel === 'lyricsManage' ? (
              <NrmAppDrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <Pressable
                  onPress={popPanel}
                  style={styles.backRow}
                  accessibilityRole="button"
                  accessibilityLabel="뒤로">
                  <Ionicons
                    name="chevron-back"
                    size={22}
                    color={nrmTokens.color.primary}
                  />
                  <Text style={styles.backText}>뒤로</Text>
                </Pressable>
                <Text style={[styles.panelTitle, { color: titleColor }]}>
                  가사 관리
                </Text>
                <Pressable
                  onPress={() => pushPanel('downloadLyricsEmbedSettings')}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rowLabel, { color: titleColor }]}>
                    AI 가사 추출 엔진 설정
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={bodyColor}
                  />
                </Pressable>
                <Pressable
                  onPress={() => pushPanel('downloadLyricsSyncerSettings')}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rowLabel, { color: titleColor }]}>
                    가사 싱커 설정
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={bodyColor}
                  />
                </Pressable>
                <Pressable
                  onPress={() => pushPanel('downloadLyricsOutputSettings')}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rowLabel, { color: titleColor }]}>
                    가사 저장 방식 설정
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={bodyColor}
                  />
                </Pressable>
                <Pressable
                  onPress={() => pushPanel('lyricsOrderSettings')}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rowLabel, { color: titleColor }]}>
                    가사 설정
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={bodyColor}
                  />
                </Pressable>
                <Pressable
                  onPress={() => pushPanel('alignLyricsLangDetectionSettings')}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rowLabel, { color: titleColor }]}>
                    가사 언어 탐지 설정
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={bodyColor}
                  />
                </Pressable>
                <Pressable
                  onPress={() => pushPanel('translationSettings')}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rowLabel, { color: titleColor }]}>
                    가사 번역 설정
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={bodyColor}
                  />
                </Pressable>
                <Pressable
                  onPress={() => pushPanel('melonAdultAuth')}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rowLabel, { color: titleColor }]}>
                    멜론 성인인증
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={bodyColor}
                  />
                </Pressable>
              </NrmAppDrawerShell>
            ) : null}

            {panel === 'melonAdultAuth' ? (
              <NrmAppDrawerShell
                titleColor={titleColor}
                onDismiss={requestDrawerDismiss}
                compactFooter={Platform.OS !== 'web'}>
                <NrmMelonAdultAuthPanel
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  rowHover={rowHover}
                  onBack={popPanel}
                  onCloseDrawer={dismissDrawer}
                  registerBackHandler={registerMelonAdultBackHandler}
                  registerDrawerDismiss={registerMelonAdultDrawerDismiss}
                />
              </NrmAppDrawerShell>
            ) : null}

            {panel === 'mainPageSettings' ? (
              <NrmAppDrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <NrmMainPageSettingsPanel
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  onBack={popPanel}
                />
              </NrmAppDrawerShell>
            ) : null}

            {panel === 'adminPage' ? (
              <NrmAppDrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <Pressable
                  onPress={popPanel}
                  style={styles.backRow}
                  accessibilityRole="button"
                  accessibilityLabel="뒤로">
                  <Ionicons
                    name="chevron-back"
                    size={22}
                    color={nrmTokens.color.primary}
                  />
                  <Text style={styles.backText}>뒤로</Text>
                </Pressable>
                <Text style={[styles.panelTitle, { color: titleColor }]}>
                  관리자페이지
                </Text>
                <Pressable
                  onPress={() => pushPanel('adminUserList')}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rowLabel, { color: titleColor }]}>
                    사용자 조회
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={bodyColor}
                  />
                </Pressable>
                <Pressable
                  onPress={() => pushPanel('adminAlarmRegister')}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rowLabel, { color: titleColor }]}>
                    알림 등록
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={bodyColor}
                  />
                </Pressable>
                <Pressable
                  onPress={() => pushPanel('adminUserBanList')}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rowLabel, { color: titleColor }]}>
                    사용자 블랙리스트
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={bodyColor}
                  />
                </Pressable>
                <Pressable
                  onPress={() => pushPanel('adminUserBanRegister')}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rowLabel, { color: titleColor }]}>
                    사용자 블랙리스트 등록
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={bodyColor}
                  />
                </Pressable>
                <Pressable
                  onPress={() => pushPanel('adminInquiryList')}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rowLabel, { color: titleColor }]}>
                    문의 답변하기
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={bodyColor}
                  />
                </Pressable>
                <Pressable
                  onPress={() => pushPanel('adminDeviceReset')}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rowLabel, { color: titleColor }]}>
                    앱등록 초기화
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={bodyColor}
                  />
                </Pressable>
              </NrmAppDrawerShell>
            ) : null}

            {panel === 'adminAlarmRegister' ? (
              <NrmAppDrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <NrmAdminAlarmRegisterPanel
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  isDark={isDark}
                  onBack={popPanel}
                />
              </NrmAppDrawerShell>
            ) : null}

            {panel === 'adminUserBanList' ? (
              <NrmAppDrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <NrmAdminUserBanListPanel
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  isDark={isDark}
                  onBack={popPanel}
                />
              </NrmAppDrawerShell>
            ) : null}

            {panel === 'adminUserBanRegister' ? (
              <NrmAppDrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <NrmAdminUserBanRegisterPanel
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  isDark={isDark}
                  onBack={popPanel}
                />
              </NrmAppDrawerShell>
            ) : null}

            {panel === 'adminInquiryList' ? (
              <NrmAppDrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <NrmAdminInquiryListPanel
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  isDark={isDark}
                  onBack={popPanel}
                />
              </NrmAppDrawerShell>
            ) : null}

            {panel === 'adminUserList' ? (
              <NrmAppDrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <NrmAdminUserListPanel
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  isDark={isDark}
                  onBack={popPanel}
                />
              </NrmAppDrawerShell>
            ) : null}

            {panel === 'adminDeviceReset' ? (
              <NrmAppDrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <NrmAdminDeviceResetPanel
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  isDark={isDark}
                  onBack={popPanel}
                />
              </NrmAppDrawerShell>
            ) : null}

            {panel === 'historyManagementSettings' ? (
              <NrmAppDrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <NrmActivityHistorySettingsPanel
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  rowHover={rowHover}
                  onBack={popPanel}
                />
              </NrmAppDrawerShell>
            ) : null}

            {panel === 'mainLogoDisplayNameSettings' ? (
              <NrmAppDrawerShell
                titleColor={titleColor}
                onDismiss={requestDrawerDismiss}
                compactFooter={Platform.OS !== 'web'}>
                <NrmMainLogoDisplayNameSettingsPanel
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  rowHover={rowHover}
                  onBack={popPanel}
                  onCloseDrawer={dismissDrawer}
                  registerBackHandler={registerMainLogoDisplayNameBackHandler}
                  registerDrawerDismiss={registerMainLogoDisplayNameDrawerDismiss}
                />
              </NrmAppDrawerShell>
            ) : null}

            {panel === 'fileLoggingSettings' ? (
              <NrmAppDrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <NrmFileLoggingSettingsPanel
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  onBack={popPanel}
                />
              </NrmAppDrawerShell>
            ) : null}

            {panel === 'inquirySettings' ? (
              <NrmAppDrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <NrmInquiryQaPanel
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  isDark={isDark}
                  onBack={popPanel}
                />
              </NrmAppDrawerShell>
            ) : null}

            {panel === 'downloadPathSettings' ? (
              <NrmAppDrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <NrmDownloadSettingsPanel
                  section="path"
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  rowHover={rowHover}
                  onBack={popPanel}
                />
              </NrmAppDrawerShell>
            ) : null}

            {panel === 'downloadExtensionSettings' ? (
              <NrmAppDrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <NrmDownloadSettingsPanel
                  section="extension"
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  rowHover={rowHover}
                  onBack={popPanel}
                />
              </NrmAppDrawerShell>
            ) : null}

            {panel === 'downloadQualitySettings' ? (
              <NrmAppDrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <NrmDownloadSettingsPanel
                  section="quality"
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  rowHover={rowHover}
                  onBack={popPanel}
                />
              </NrmAppDrawerShell>
            ) : null}

            {panel === 'downloadVbrSettings' ? (
              <NrmAppDrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <NrmDownloadSettingsPanel
                  section="vbr"
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  rowHover={rowHover}
                  onBack={popPanel}
                />
              </NrmAppDrawerShell>
            ) : null}

            {panel === 'downloadLosslessSettings' ? (
              <NrmAppDrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <NrmDownloadSettingsPanel
                  section="lossless"
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  rowHover={rowHover}
                  onBack={popPanel}
                />
              </NrmAppDrawerShell>
            ) : null}

            {panel === 'downloadFilenameSettings' ? (
              <NrmAppDrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <NrmDownloadSettingsPanel
                  section="filename"
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  rowHover={rowHover}
                  onBack={popPanel}
                />
              </NrmAppDrawerShell>
            ) : null}

            {panel === 'downloadMetadataSettings' ? (
              <NrmAppDrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <NrmDownloadSettingsPanel
                  section="metadata"
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  rowHover={rowHover}
                  onBack={popPanel}
                />
              </NrmAppDrawerShell>
            ) : null}

            {panel === 'downloadLyricsOutputSettings' ? (
              <NrmAppDrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <NrmDownloadSettingsPanel
                  section="lyricsOutput"
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  rowHover={rowHover}
                  onBack={popPanel}
                />
              </NrmAppDrawerShell>
            ) : null}

            {panel === 'downloadLyricsEmbedSettings' ? (
              <NrmAppDrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <NrmDownloadSettingsPanel
                  section="lyricsEmbed"
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  rowHover={rowHover}
                  onBack={popPanel}
                />
              </NrmAppDrawerShell>
            ) : null}

            {panel === 'downloadLyricsSyncerSettings' ? (
              <NrmAppDrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <NrmDownloadSettingsPanel
                  section="lyricsSyncer"
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  rowHover={rowHover}
                  onBack={popPanel}
                />
              </NrmAppDrawerShell>
            ) : null}

            {isChartMenuPanel(panel) ? (
              <NrmAppDrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <NrmMenuChartPanels
                  panel={panel}
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  rowHover={rowHover}
                  onBackToRoot={goBackToRoot}
                  onBackToCharts={popPanel}
                  onOpenAppleMusicCharts={closeMenuAndNavigateAppleMusicCharts}
                  onOpenSpotifyChartsOfficial={closeMenuAndNavigateSpotifyChartsOfficial}
                  onOpenSpotifyChartsCharts={closeMenuAndNavigateSpotifyChartsCharts}
                  onOpenLastfmCharts={closeMenuAndNavigateLastfmCharts}
                  onOpenMelonCharts={closeMenuAndNavigateMelonCharts}
                />
              </NrmAppDrawerShell>
            ) : null}

            {isPeriodChartMenuPanel(panel) ? (
              <NrmAppDrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <NrmMenuPeriodChartPanels
                  panel={panel}
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  rowHover={rowHover}
                  onBackToRoot={goBackToRoot}
                  onOpenLastfm={() => void closeMenuAndNavigatePeriodLastfmCharts()}
                  onOpenSpotify={() => void closeMenuAndNavigatePeriodSpotifyCharts()}
                />
              </NrmAppDrawerShell>
            ) : null}

            {isSearchMenuPanel(panel) ? (
              <NrmAppDrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <NrmMenuSearchPanels
                  panel={panel}
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  rowHover={rowHover}
                  onBackToRoot={goBackToRoot}
                  onBackToSearch={popPanel}
                  onOpenPlatform={(platform) => {
                    pushPanel(
                      platform === 'spotify'
                        ? 'searchSpotify'
                        : platform === 'lastfm'
                          ? 'searchLastfm'
                          : 'searchMelon',
                    );
                  }}
                  onOpenSpotifySearch={(kind) =>
                    void closeMenuAndNavigateSpotifySearch(kind)
                  }
                  onOpenLastfmSearch={(kind) =>
                    void closeMenuAndNavigateLastfmSearch(kind)
                  }
                  onOpenMelonSearch={(kind) => closeMenuAndNavigateMelonSearch(kind)}
                />
              </NrmAppDrawerShell>
            ) : null}

            {panel === 'searchSettings' ? (
              <NrmAppDrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <Pressable
                  onPress={popPanel}
                  style={styles.backRow}
                  accessibilityRole="button"
                  accessibilityLabel="뒤로">
                  <Ionicons
                    name="chevron-back"
                    size={22}
                    color={nrmTokens.color.primary}
                  />
                  <Text style={styles.backText}>뒤로</Text>
                </Pressable>
                <Text style={[styles.panelTitle, { color: titleColor }]}>
                  검색 설정
                </Text>
                <NrmSettingsOptionPicker
                  options={listYoutubeSearchSuffixModes().map((mode) => ({
                    id: mode,
                    label: NRM_YOUTUBE_SEARCH_SUFFIX_LABELS[mode],
                  }))}
                  value={suffixMode}
                  onChange={(mode) => {
                    void setYoutubeSearchSuffixMode(
                      mode as NrmYoutubeSearchSuffixMode,
                    ).then(() => {
                      setSuffixMode(mode as NrmYoutubeSearchSuffixMode);
                    });
                  }}
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  rowHover={rowHover}
                />
              </NrmAppDrawerShell>
            ) : null}

            {panel === 'translationSettings' ? (
              <NrmAppDrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <Pressable
                  onPress={popPanel}
                  style={styles.backRow}
                  accessibilityRole="button"
                  accessibilityLabel="뒤로">
                  <Ionicons
                    name="chevron-back"
                    size={22}
                    color={nrmTokens.color.primary}
                  />
                  <Text style={styles.backText}>뒤로</Text>
                </Pressable>
                <Text style={[styles.panelTitle, { color: titleColor }]}>
                  가사 번역 설정
                </Text>
                <NrmTranslationSettingsPanel
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  rowHover={rowHover}
                  active={panel === 'translationSettings'}
                />
              </NrmAppDrawerShell>
            ) : null}

            {panel === 'screenSettings' ? (
              <NrmAppDrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <Pressable
                  onPress={popPanel}
                  style={styles.backRow}
                  accessibilityRole="button"
                  accessibilityLabel="뒤로">
                  <Ionicons
                    name="chevron-back"
                    size={22}
                    color={nrmTokens.color.primary}
                  />
                  <Text style={styles.backText}>뒤로</Text>
                </Pressable>
                <Text style={[styles.panelTitle, { color: titleColor }]}>
                  화면 설정
                </Text>
                <Pressable
                  onPress={() => {
                    void setAppearanceMode('light');
                  }}
                  style={({ pressed }) => [
                    styles.optionRow,
                    !isDark && styles.optionRowSelected,
                    pressed && { backgroundColor: rowHover },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="라이트 모드">
                  <Text style={[styles.optionLabel, { color: titleColor }]}>
                    라이트 모드
                  </Text>
                  <Ionicons
                    name={!isDark ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={
                      !isDark ? nrmTokens.color.primary : bodyColor
                    }
                  />
                </Pressable>
                <Pressable
                  onPress={() => {
                    void setAppearanceMode('dark');
                  }}
                  style={({ pressed }) => [
                    styles.optionRow,
                    isDark && styles.optionRowSelected,
                    pressed && { backgroundColor: rowHover },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="다크 모드">
                  <Text style={[styles.optionLabel, { color: titleColor }]}>
                    다크 모드
                  </Text>
                  <Ionicons
                    name={isDark ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={
                      isDark ? nrmTokens.color.primary : bodyColor
                    }
                  />
                </Pressable>
              </NrmAppDrawerShell>
            ) : null}
          </Animated.View>
          <NrmMenuNotifyHost isDark={isDark} active={open} />
        </View>
      </Modal>

      <Modal
        visible={versionOverlayOpen && open}
        transparent
        animationType="fade"
        onRequestClose={() => setVersionOverlayOpen(false)}
        statusBarTranslucent>
        <View style={styles.versionOverlayModalRoot}>
          <Pressable
            style={[StyleSheet.absoluteFill, { backgroundColor: modalScrim }]}
            onPress={() => setVersionOverlayOpen(false)}
            accessibilityLabel="버전 정보 닫기"
          />
          <View
            style={[
              styles.versionOverlayCard,
              {
                width: Math.min(windowWidth * 0.86, 440),
                backgroundColor: cardBg,
                borderColor: cardBorder,
              },
            ]}>
            <View style={styles.versionOverlayTopRow}>
              <Text
                style={[
                  styles.panelTitle,
                  { color: titleColor, marginBottom: 0 },
                ]}>
                버전 정보
              </Text>
            </View>

            <Text style={[styles.versionLine, { color: bodyColor }]}>
              {getNrmAppVersionLabel()}
            </Text>
            {getNrmVersionInfoAdminLine() ? (
              <Text style={[styles.versionLine, { color: bodyColor }]}>
                {getNrmVersionInfoAdminLine()}
              </Text>
            ) : null}
            {getNrmVersionInfoCustomizingLine() ? (
              <Text style={[styles.versionLine, { color: bodyColor }]}>
                {getNrmVersionInfoCustomizingLine()}
              </Text>
            ) : null}
            {shouldShowVersionInfoSerialNumber() && appSerialNo.trim() ? (
              <Text style={[styles.versionLine, { color: bodyColor }]}>
                {`Serial Number : ${appSerialNo.trim()}`}
              </Text>
            ) : null}

            <View style={styles.versionMetaBlock}>
              <Text style={[styles.versionMetaText, { color: bodyColor }]}>
                {getNrmAppCopyrightNotice()}
              </Text>
              <Text style={[styles.versionMetaText, { color: bodyColor }]}>
                제작 · {NRM_APP_AUTHOR_DISPLAY}
              </Text>
            </View>
            <Pressable
              onPress={() => setVersionOverlayOpen(false)}
              style={({ pressed }) => [
                styles.versionOverlayBottomClose,
                { borderColor: cardBorder },
                pressed && styles.versionOverlayBottomClosePressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="닫기">
              <Text
                style={[
                  styles.versionOverlayBottomCloseLabel,
                  { color: titleColor },
                ]}>
                닫기
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {IS_NATIVE_MOBILE && !open ? (
        <View
          style={styles.mobileSwipeLayer}
          pointerEvents="box-none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants">
          {leftEdgeSwipeReserve != null && leftEdgeSwipeReserve > 0 ? (
            <View
              style={[
                styles.mobileSwipeEdge,
                { left: 0, width: mobileEdgeStripWidth },
              ]}
              collapsable={false}
              pointerEvents="auto"
              {...mobileEdgePanHandlers.panHandlers}
            />
          ) : (
            <View
              style={[
                styles.mobileSwipeEdge,
                { width: mobileSwipeEdgeWidth },
              ]}
              collapsable={false}
              pointerEvents="auto"
              {...mobileEdgePanHandlers.panHandlers}
            />
          )}
        </View>
      ) : null}
    </>
  );
});

const styles = StyleSheet.create({
  menuFab: {
    position: 'absolute',
    zIndex: 52,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuFabPressed: {
    opacity: 0.72,
  },
  mobileSwipeLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 51,
    ...Platform.select({
      android: { elevation: 51 },
    }),
  },
  mobileSwipeEdge: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  edgeZone: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    zIndex: 50,
    justifyContent: 'center',
  },
  edgePress: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingLeft: nrmTokens.space.xxs,
  },
  edgePressPressed: {
    opacity: 0.88,
  },
  edgePressWeb: {
    cursor: 'pointer',
  },
  edgeRail: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
  },
  edgeHandle: {
    width: 14,
    height: 52,
    borderRadius: nrmTokens.radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    zIndex: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.12,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: '0 1px 8px rgba(0,0,0,0.08)',
      },
    }),
  },
  edgeGrip: {
    width: 2,
    height: 18,
    borderRadius: nrmTokens.radius.pill,
    opacity: 0.85,
  },
  modalWrap: {
    flex: 1,
  },
  drawer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    height: '100%',
    maxHeight: '100%',
    flexDirection: 'column',
    borderTopRightRadius: nrmTokens.radius.lg,
    borderBottomRightRadius: nrmTokens.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 0,
    paddingHorizontal: nrmTokens.space.lg,
    zIndex: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 4, height: 0 },
        shadowOpacity: 0.18,
        shadowRadius: 12,
      },
      android: {
        elevation: 16,
      },
      web: {
        boxShadow: '4px 0 24px rgba(0,0,0,0.18)',
      },
    }),
  },
  menuLogoGap: {
    marginTop: nrmTokens.space.xs,
    marginBottom: nrmTokens.space.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: nrmTokens.space.md,
    paddingHorizontal: nrmTokens.space.xs,
    borderRadius: nrmTokens.radius.sm,
    marginBottom: nrmTokens.space.xs,
  },
  rowLabel: {
    fontSize: nrmTokens.font.body,
    fontWeight: '500',
  },
  rowDisabled: {
    opacity: 0.42,
  },
  rowLabelDisabled: {
    opacity: 0.72,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.xxs,
    marginTop: nrmTokens.space.md,
    marginBottom: nrmTokens.space.md,
    alignSelf: 'flex-start',
  },
  backText: {
    fontSize: nrmTokens.font.body,
    color: nrmTokens.color.primary,
    fontWeight: '500',
  },
  panelTitle: {
    fontSize: nrmTokens.font.lead,
    fontWeight: '600',
    marginBottom: nrmTokens.space.md,
    letterSpacing: -0.4,
  },
  versionLine: {
    fontSize: nrmTokens.font.body,
    lineHeight: 24,
    marginBottom: nrmTokens.space.md,
  },
  versionMetaBlock: {
    marginTop: nrmTokens.space.sm,
    gap: nrmTokens.space.xs,
  },
  versionMetaText: {
    fontSize: nrmTokens.font.finePrint,
    lineHeight: 18,
    fontWeight: '400',
  },
  versionOverlayModalRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: nrmTokens.space.lg,
  },
  versionOverlayCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: nrmTokens.radius.lg,
    paddingVertical: nrmTokens.space.lg,
    paddingHorizontal: nrmTokens.space.lg,
    zIndex: 1,
    ...Platform.select({
      android: { elevation: 8 },
    }),
  },
  versionOverlayTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginBottom: nrmTokens.space.md,
  },
  versionOverlayBottomClose: {
    marginTop: nrmTokens.space.lg,
    height: 42,
    borderRadius: nrmTokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  versionOverlayBottomClosePressed: {
    opacity: 0.88,
  },
  versionOverlayBottomCloseLabel: {
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
  versionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: nrmTokens.space.md,
    paddingHorizontal: nrmTokens.space.sm,
    borderRadius: nrmTokens.radius.sm,
    marginBottom: nrmTokens.space.xxs,
  },
  versionBadge: {
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
  bulletLine: {
    fontSize: nrmTokens.font.body,
    lineHeight: 24,
    marginBottom: nrmTokens.space.sm,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: nrmTokens.space.md,
    paddingHorizontal: nrmTokens.space.sm,
    borderRadius: nrmTokens.radius.sm,
    marginBottom: nrmTokens.space.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  optionRowSelected: {
    borderColor: 'rgba(0, 102, 204, 0.35)',
    backgroundColor: 'rgba(0, 102, 204, 0.06)',
  },
  optionLabel: {
    fontSize: nrmTokens.font.body,
    fontWeight: '500',
    flex: 1,
    paddingRight: nrmTokens.space.sm,
  },
});
