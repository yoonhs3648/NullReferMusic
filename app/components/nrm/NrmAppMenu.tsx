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
import { NrmMenuDrawerScroll } from '@/components/nrm/NrmMenuDrawerScroll';
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
import { NrmFileLoggingSettingsPanel } from '@/components/nrm/settings/NrmFileLoggingSettingsPanel';
import { NrmTrackMetadataSettingsHome } from '@/components/nrm/NrmTrackMetadataSettingsHome';
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
  NRM_APP_AUTHOR_DISPLAY,
} from '@/lib/nrmAppInfo';
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
};

export type NrmAppMenuHandle = {
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
  | 'screenSettings'
  | 'spotifyApiManage'
  | 'lastfmApiManage'
  | 'deeplApiManage'
  | 'genreTagSettings'
  | 'weeklySnapshotSettings'
  | 'downloadManage'
  | 'downloadPathSettings'
  | 'downloadExtensionSettings'
  | 'downloadQualitySettings'
  | 'downloadFilenameSettings'
  | 'downloadMetadataSettings'
  | 'downloadLyricsEmbedSettings'
  | 'fileLoggingSettings'
  | 'trackMetadataSettings'
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
  },
  ref,
) {
  const { setAppearanceMode } = useNrmUiAppearance();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const drawerW = Math.min(380, windowWidth * 0.88);
  const translateX = useRef(new Animated.Value(0)).current;
  const spotifyBackHandlerRef = useRef<(() => boolean) | null>(null);
  const spotifyDrawerDismissRef = useRef<(() => void) | null>(null);
  const [spotifyFocusChartsSession, setSpotifyFocusChartsSession] = useState(false);
  const lastfmBackHandlerRef = useRef<(() => boolean) | null>(null);
  const lastfmDrawerDismissRef = useRef<(() => void) | null>(null);
  const deeplBackHandlerRef = useRef<(() => boolean) | null>(null);
  const deeplDrawerDismissRef = useRef<(() => void) | null>(null);

  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>('root');
  const [versionOverlayOpen, setVersionOverlayOpen] = useState(false);
  const [suffixMode, setSuffixMode] =
    useState<NrmYoutubeSearchSuffixMode>('default');
  const [lastfmEntryScreen, setLastfmEntryScreen] = useState<
    'manage' | 'issue'
  >('issue');

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
    setPanel('root');
    setVersionOverlayOpen(false);
    setOpen(true);
  }, []);

  const dismissDrawer = useCallback(() => {
    setVersionOverlayOpen(false);
    Animated.timing(translateX, {
      toValue: -drawerW,
      duration: 220,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setOpen(false);
        setPanel('root');
      }
    });
  }, [drawerW, translateX]);

  useEffect(() => {
    if (!open) setVersionOverlayOpen(false);
  }, [open]);

  const closeMenuAndNavigateAppleMusicCharts = useCallback(() => {
    onNavigateAppleMusicCharts?.();
    setOpen(false);
    setPanel('root');
    translateX.setValue(-drawerW);
  }, [drawerW, onNavigateAppleMusicCharts, translateX]);

  const openSpotifyTokenSettings = useCallback(() => {
    setSpotifyFocusChartsSession(false);
    setOpen(true);
    setPanel('spotifyApiManage');
    translateX.setValue(0);
  }, [translateX]);

  const openSpotifyChartsSessionSettings = useCallback(() => {
    setSpotifyFocusChartsSession(true);
    setOpen(true);
    setPanel('spotifyApiManage');
    translateX.setValue(0);
  }, [translateX]);

  const openLastfmApiManage = useCallback(async () => {
    const registered = await hasLastfmCredentials();
    setLastfmEntryScreen(registered ? 'manage' : 'issue');
    setOpen(true);
    setPanel('lastfmApiManage');
    translateX.setValue(0);
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
      openChartsSession: openSpotifyChartsSessionSettings,
      openLastfmTokenSettings,
      openSpotifyTokenSettings,
    }),
    [openLastfmTokenSettings, openSpotifyChartsSessionSettings, openSpotifyTokenSettings],
  );

  const openDownloadSettingsFromGlobal = useCallback(() => {
    setOpen(true);
    setPanel('downloadPathSettings');
    translateX.setValue(0);
  }, [translateX]);

  const openLyricsEmbedSettingsFromGlobal = useCallback(() => {
    setOpen(true);
    setPanel('downloadLyricsEmbedSettings');
    translateX.setValue(0);
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
    setPanel('root');
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
    setPanel('root');
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
    setPanel('root');
    translateX.setValue(-drawerW);
  }, [drawerW, lastfmGateHandlers, onNavigateLastfmCharts, translateX]);

  const closeMenuAndNavigatePeriodLastfmCharts = useCallback(async () => {
    const ok = await ensureLastfmChartAccess(lastfmGateHandlers);
    if (!ok) return;
    onNavigatePeriodLastfmCharts?.();
    setOpen(false);
    setPanel('root');
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
    setPanel('root');
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
    setPanel('root');
    translateX.setValue(-drawerW);
  }, [drawerW, onNavigateMelonCharts, translateX]);

  const closeMenuAndNavigateGenreCharts = useCallback(() => {
    onNavigateGenreCharts?.();
    setOpen(false);
    setPanel('root');
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
      setPanel('root');
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
      setPanel('root');
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
      setPanel('root');
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

  /** Android 하드웨어 뒤로: 하위 패널이면 한 단계 위로, 루트면 드로어 닫기 */
  const goBackInMenu = useCallback(() => {
    switch (panel) {
      case 'spotifyApiManage':
        if (spotifyBackHandlerRef.current?.()) return;
        setPanel('appSettings');
        break;
      case 'lastfmApiManage':
        if (lastfmBackHandlerRef.current?.()) return;
        setPanel('appSettings');
        break;
      case 'deeplApiManage':
        if (deeplBackHandlerRef.current?.()) return;
        setPanel('appSettings');
        break;
      case 'genreTagSettings':
        setPanel('settings');
        break;
      case 'downloadPathSettings':
      case 'downloadExtensionSettings':
      case 'downloadQualitySettings':
      case 'downloadFilenameSettings':
      case 'downloadMetadataSettings':
      case 'downloadLyricsEmbedSettings':
        setPanel('downloadManage');
        break;
      case 'weeklySnapshotSettings':
        setPanel('settings');
        break;
      case 'trackMetadataSettings':
        setPanel('root');
        break;
      case 'downloadManage':
        setPanel('root');
        break;
      case 'fileLoggingSettings':
        setPanel('settings');
        break;
      case 'appSettings':
      case 'searchSettings':
      case 'screenSettings':
        setPanel('settings');
        break;
      case 'chartAppleMusic':
      case 'chartSpotifyOfficial':
      case 'chartSpotifyCharts':
      case 'chartLastfm':
      case 'chartBillboard':
      case 'chartYoutubeMusic':
      case 'chartMelon':
      case 'chartGenie':
        setPanel('charts');
        break;
      case 'charts':
        setPanel('root');
        break;
      case 'periodCharts':
        setPanel('root');
        break;
      case 'searchSpotify':
      case 'searchLastfm':
      case 'searchMelon':
        setPanel('search');
        break;
      case 'search':
        setPanel('root');
        break;
      case 'settings':
        setPanel('root');
        break;
      case 'root':
      default:
        dismissDrawer();
        break;
    }
  }, [panel, dismissDrawer]);

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
    dismissDrawer();
  }, [dismissDrawer, panel]);

  useEffect(() => {
    if (!open) return;
    translateX.setValue(-drawerW);
    Animated.timing(translateX, {
      toValue: 0,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [open, drawerW, translateX]);

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
      {IS_NATIVE_MOBILE && !open ? (
        <Pressable
          onPress={openMenu}
          style={({ pressed }) => [
            styles.menuFab,
            {
              left: menuFabLeft,
              top: menuFabTop,
              backgroundColor: pressed
                ? isDark
                  ? 'rgba(255,255,255,0.12)'
                  : 'rgba(0,0,0,0.06)'
                : isDark
                  ? 'rgba(255,255,255,0.08)'
                  : 'rgba(0,0,0,0.04)',
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="메뉴">
          <Ionicons
            name="menu"
            size={26}
            color={isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink}
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
        statusBarTranslucent>
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
              <DrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <View style={styles.menuLogoGap}>
                  <NrmLogo compact tone={isDark ? 'dark' : 'light'} />
                </View>
                <Pressable
                  onPress={() => setPanel('charts')}
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
                  onPress={() => setPanel('periodCharts')}
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
                  onPress={() => setPanel('search')}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rowLabel, { color: titleColor }]}>
                    검색
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={bodyColor}
                  />
                </Pressable>
                <Pressable
                  onPress={() => setPanel('settings')}
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
                  onPress={() => setPanel('downloadManage')}
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
                  onPress={() => setPanel('trackMetadataSettings')}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rowLabel, { color: titleColor }]}>
                    트랙 메타데이터 설정
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={bodyColor}
                  />
                </Pressable>
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
              </DrawerShell>
            ) : null}

            {panel === 'settings' ? (
              <DrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <Pressable
                  onPress={() => setPanel('root')}
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
                  onPress={() => setPanel('appSettings')}
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
                  onPress={() => setPanel('weeklySnapshotSettings')}
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
                  onPress={() => setPanel('genreTagSettings')}
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
                  onPress={() => setPanel('searchSettings')}
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
                  onPress={() => setPanel('screenSettings')}
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
                  onPress={() => setPanel('fileLoggingSettings')}
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
              </DrawerShell>
            ) : null}

            {panel === 'appSettings' ? (
              <DrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <Pressable
                  onPress={() => setPanel('settings')}
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
                  onPress={() => setPanel('spotifyApiManage')}
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
                  onPress={() => setPanel('deeplApiManage')}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rowLabel, { color: titleColor }]}>
                    번역기 API Key 관리
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={bodyColor}
                  />
                </Pressable>
              </DrawerShell>
            ) : null}

            {panel === 'weeklySnapshotSettings' ? (
              <DrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <NrmWeeklySnapshotSettingsPanel
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  onBack={() => setPanel('settings')}
                />
              </DrawerShell>
            ) : null}

            {panel === 'genreTagSettings' ? (
              <DrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <NrmGenreTagSettingsPanel
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  rowHover={rowHover}
                  onBack={() => setPanel('settings')}
                />
              </DrawerShell>
            ) : null}

            {panel === 'spotifyApiManage' ? (
              <DrawerShell
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
                  onBack={() => setPanel('appSettings')}
                  onCloseDrawer={dismissDrawer}
                  registerBackHandler={(handler) => {
                    spotifyBackHandlerRef.current = handler;
                  }}
                  registerDrawerDismiss={(handler) => {
                    spotifyDrawerDismissRef.current = handler;
                  }}
                />
              </DrawerShell>
            ) : null}

            {panel === 'lastfmApiManage' ? (
              <DrawerShell
                titleColor={titleColor}
                onDismiss={requestDrawerDismiss}
                compactFooter={Platform.OS !== 'web'}>
                <NrmLastfmApiManagePanel
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  rowHover={rowHover}
                  initialScreen={lastfmEntryScreen}
                  onBack={() => setPanel('appSettings')}
                  onCloseDrawer={dismissDrawer}
                  registerBackHandler={(handler) => {
                    lastfmBackHandlerRef.current = handler;
                  }}
                  registerDrawerDismiss={(handler) => {
                    lastfmDrawerDismissRef.current = handler;
                  }}
                />
              </DrawerShell>
            ) : null}

            {panel === 'deeplApiManage' ? (
              <DrawerShell
                titleColor={titleColor}
                onDismiss={requestDrawerDismiss}
                compactFooter={Platform.OS !== 'web'}>
                <NrmDeepLApiManagePanel
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  rowHover={rowHover}
                  onBack={() => setPanel('appSettings')}
                  onCloseDrawer={dismissDrawer}
                  registerBackHandler={(handler) => {
                    deeplBackHandlerRef.current = handler;
                  }}
                  registerDrawerDismiss={(handler) => {
                    deeplDrawerDismissRef.current = handler;
                  }}
                />
              </DrawerShell>
            ) : null}

            {panel === 'downloadManage' ? (
              <DrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <Pressable
                  onPress={() => setPanel('root')}
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
                  onPress={() => setPanel('downloadPathSettings')}
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
                  onPress={() => setPanel('downloadExtensionSettings')}
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
                  onPress={() => setPanel('downloadQualitySettings')}
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
                  onPress={() => setPanel('downloadFilenameSettings')}
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
                <Pressable
                  onPress={() => setPanel('downloadMetadataSettings')}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: rowHover },
                  ]}>
                  <Text style={[styles.rowLabel, { color: titleColor }]}>
                    메타데이터 설정
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={bodyColor}
                  />
                </Pressable>
                <Pressable
                  onPress={() => setPanel('downloadLyricsEmbedSettings')}
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
              </DrawerShell>
            ) : null}

            {panel === 'fileLoggingSettings' ? (
              <DrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <NrmFileLoggingSettingsPanel
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  onBack={() => setPanel('settings')}
                />
              </DrawerShell>
            ) : null}

            {panel === 'downloadPathSettings' ? (
              <DrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <NrmDownloadSettingsPanel
                  section="path"
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  onBack={() => setPanel('downloadManage')}
                />
              </DrawerShell>
            ) : null}

            {panel === 'downloadExtensionSettings' ? (
              <DrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <NrmDownloadSettingsPanel
                  section="extension"
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  onBack={() => setPanel('downloadManage')}
                />
              </DrawerShell>
            ) : null}

            {panel === 'downloadQualitySettings' ? (
              <DrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <NrmDownloadSettingsPanel
                  section="quality"
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  onBack={() => setPanel('downloadManage')}
                />
              </DrawerShell>
            ) : null}

            {panel === 'downloadFilenameSettings' ? (
              <DrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <NrmDownloadSettingsPanel
                  section="filename"
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  onBack={() => setPanel('downloadManage')}
                />
              </DrawerShell>
            ) : null}

            {panel === 'trackMetadataSettings' ? (
              <DrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <NrmTrackMetadataSettingsHome
                  isDark={isDark}
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  onBack={() => setPanel('root')}
                />
              </DrawerShell>
            ) : null}

            {panel === 'downloadMetadataSettings' ? (
              <DrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <NrmDownloadSettingsPanel
                  section="metadata"
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  onBack={() => setPanel('downloadManage')}
                />
              </DrawerShell>
            ) : null}

            {panel === 'downloadLyricsEmbedSettings' ? (
              <DrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <NrmDownloadSettingsPanel
                  section="lyricsEmbed"
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  onBack={() => setPanel('downloadManage')}
                />
              </DrawerShell>
            ) : null}

            {isChartMenuPanel(panel) ? (
              <DrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <NrmMenuChartPanels
                  panel={panel}
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  rowHover={rowHover}
                  onBackToRoot={() => setPanel('root')}
                  onBackToCharts={() => setPanel('charts')}
                  onOpenAppleMusicCharts={closeMenuAndNavigateAppleMusicCharts}
                  onOpenSpotifyChartsOfficial={closeMenuAndNavigateSpotifyChartsOfficial}
                  onOpenSpotifyChartsCharts={closeMenuAndNavigateSpotifyChartsCharts}
                  onOpenLastfmCharts={closeMenuAndNavigateLastfmCharts}
                  onOpenMelonCharts={closeMenuAndNavigateMelonCharts}
                />
              </DrawerShell>
            ) : null}

            {isPeriodChartMenuPanel(panel) ? (
              <DrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <NrmMenuPeriodChartPanels
                  panel={panel}
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  rowHover={rowHover}
                  onBackToRoot={() => setPanel('root')}
                  onOpenLastfm={() => void closeMenuAndNavigatePeriodLastfmCharts()}
                  onOpenSpotify={() => void closeMenuAndNavigatePeriodSpotifyCharts()}
                />
              </DrawerShell>
            ) : null}

            {isSearchMenuPanel(panel) ? (
              <DrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <NrmMenuSearchPanels
                  panel={panel}
                  titleColor={titleColor}
                  bodyColor={bodyColor}
                  rowHover={rowHover}
                  onBackToRoot={() => setPanel('root')}
                  onBackToSearch={() => setPanel('search')}
                  onOpenPlatform={(platform) => {
                    setPanel(
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
              </DrawerShell>
            ) : null}

            {panel === 'searchSettings' ? (
              <DrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <Pressable
                  onPress={() => setPanel('settings')}
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
                {listYoutubeSearchSuffixModes().map((mode) => {
                  const selected = suffixMode === mode;
                  return (
                    <Pressable
                      key={mode}
                      onPress={() => {
                        void setYoutubeSearchSuffixMode(mode).then(() => {
                          setSuffixMode(mode);
                        });
                      }}
                      style={({ pressed }) => [
                        styles.optionRow,
                        selected && styles.optionRowSelected,
                        pressed && { backgroundColor: rowHover },
                      ]}>
                      <Text
                        style={[styles.optionLabel, { color: titleColor }]}>
                        {NRM_YOUTUBE_SEARCH_SUFFIX_LABELS[mode]}
                      </Text>
                      <Ionicons
                        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                        size={22}
                        color={
                          selected ? nrmTokens.color.primary : bodyColor
                        }
                      />
                    </Pressable>
                  );
                })}
              </DrawerShell>
            ) : null}

            {panel === 'screenSettings' ? (
              <DrawerShell
                titleColor={titleColor}
                onDismiss={dismissDrawer}
                compactFooter={Platform.OS !== 'web'}>
                <Pressable
                  onPress={() => setPanel('settings')}
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
              </DrawerShell>
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
          <View
            style={[
              styles.mobileSwipeEdge,
              { width: mobileSwipeEdgeWidth },
            ]}
            collapsable={false}
            pointerEvents="auto"
            {...mobileEdgePanHandlers.panHandlers}
          />
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
    borderRadius: nrmTokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
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
  drawerColumn: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    flexDirection: 'column',
  },
  drawerScroll: {
    flex: 1,
    minHeight: 0,
  },
  drawerScrollContent: {
    flexGrow: 1,
    paddingBottom: nrmTokens.space.sm,
    ...Platform.select({
      web: {},
      default: {
        paddingRight: nrmTokens.space.xxs,
      },
    }),
  },
  footerClose: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    marginTop: nrmTokens.space.sm,
    marginBottom: nrmTokens.layout.menuDrawerCloseBottomGap,
    borderRadius: nrmTokens.radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(128,128,128,0.35)',
    ...Platform.select({
      web: {},
      default: {
        marginRight: nrmTokens.space.xxs,
      },
    }),
  },
  footerCloseCompact: {
    marginTop: nrmTokens.space.xs,
  },
  footerClosePressed: {
    opacity: 0.92,
  },
  footerCloseLabel: {
    fontSize: nrmTokens.font.body,
    fontWeight: '500',
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

function DrawerShell({
  titleColor,
  onDismiss,
  compactFooter = false,
  children,
}: {
  titleColor: string;
  onDismiss: () => void;
  compactFooter?: boolean;
  children: ReactNode;
}) {
  return (
    <View style={styles.drawerColumn}>
      <NrmMenuDrawerScroll
        style={styles.drawerScroll}
        contentContainerStyle={styles.drawerScrollContent}>
        {children}
      </NrmMenuDrawerScroll>
      <Pressable
        onPress={onDismiss}
        style={({ pressed }) => [
          styles.footerClose,
          compactFooter && styles.footerCloseCompact,
          pressed && styles.footerClosePressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="닫기">
        <Text style={[styles.footerCloseLabel, { color: titleColor }]}>
          닫기
        </Text>
      </Pressable>
    </View>
  );
}
