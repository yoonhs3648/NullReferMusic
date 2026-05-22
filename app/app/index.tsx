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
import { NrmLastfmChartsHome } from '@/components/nrm/charts/NrmLastfmChartsHome';
import { NrmSpotifyChartsHome } from '@/components/nrm/charts/NrmSpotifyChartsHome';
import { NrmSpotifyChartsLoginModal } from '@/components/nrm/settings/NrmSpotifyChartsLoginModal';
import { NrmSpotifyChartsSilentCapture } from '@/components/nrm/settings/NrmSpotifyChartsSilentCapture';
import { NrmLastfmAlbumSearchHome } from '@/components/nrm/search/NrmLastfmAlbumSearchHome';
import { NrmLastfmArtistSearchHome } from '@/components/nrm/search/NrmLastfmArtistSearchHome';
import { NrmLastfmTrackSearchHome } from '@/components/nrm/search/NrmLastfmTrackSearchHome';

import { NrmAppMenu, type NrmAppMenuHandle } from '@/components/nrm/NrmAppMenu';
import { setupNrmMobileDownloadNotifications } from '@/lib/nrmMobileDownloadNotifications';

import { NrmLogo } from '@/components/nrm/NrmLogo';

import { NrmYoutubeHome } from '@/components/nrm/NrmYoutubeHome';

import { nrmTokens } from '@/constants/nrmTokens';

import { useNrmUiAppearance } from '@/context/NrmUiAppearanceContext';

import { getNrmRootBackgroundColor } from '@/lib/nrmUiAppearanceColors';
import { saveSpotifyChartsSession } from '@/lib/nrmSpotifyChartsSession';



const LOGO_TOP_FRAC = 0.1;



type MainView =
  | 'youtube'
  | 'appleMusicCharts'
  | 'spotifyChartsOfficial'
  | 'spotifyChartsCharts'
  | 'lastfmCharts'
  | 'lastfmSearchArtist'
  | 'lastfmSearchAlbum'
  | 'lastfmSearchTrack';



export default function HomeScreen() {

  const { isDark } = useNrmUiAppearance();

  const { width, height: winH } = useWindowDimensions();

  const [mainView, setMainView] = useState<MainView>('youtube');

  const [layoutPhase, setLayoutPhase] = useState<'welcome' | 'browsing'>(

    'welcome',

  );

  const [homeEpoch, setHomeEpoch] = useState(0);
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
  const isLastfmSearchArtist = mainView === 'lastfmSearchArtist';
  const isLastfmSearchAlbum = mainView === 'lastfmSearchAlbum';
  const isLastfmSearchTrack = mainView === 'lastfmSearchTrack';
  const isLastfmSearchView =
    isLastfmSearchArtist || isLastfmSearchAlbum || isLastfmSearchTrack;
  const isChartsView =
    isAppleMusicCharts ||
    isSpotifyChartsOfficial ||
    isSpotifyChartsCharts ||
    isLastfmCharts;
  const isFullScreenFeature = isChartsView || isLastfmSearchView;



  const resetToYoutubeHome = useCallback(() => {

    setMainView('youtube');

    setLayoutPhase('welcome');

    setHomeEpoch((v) => v + 1);

  }, []);



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

  const openLastfmArtistSearch = useCallback(() => {
    setMainView('lastfmSearchArtist');
    setLayoutPhase('browsing');
  }, []);

  const openLastfmAlbumSearch = useCallback(() => {
    setMainView('lastfmSearchAlbum');
    setLayoutPhase('browsing');
  }, []);

  const openLastfmTrackSearch = useCallback(() => {
    setMainView('lastfmSearchTrack');
    setLayoutPhase('browsing');
  }, []);

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

      if (isFullScreenFeature) {
        resetToYoutubeHome();
        return true;
      }

      if (layoutPhase !== 'welcome') {

        resetToYoutubeHome();

        return true;

      }

      return false;

    });

    return () => sub.remove();

  }, [isFullScreenFeature, layoutPhase, resetToYoutubeHome]);



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
          />
        ) : isSpotifyChartsOfficial ? (
          <NrmSpotifyChartsHome
            isDark={isDark}
            paddingHorizontal={pad}
            chartSource="official"
            onBackToHome={resetToYoutubeHome}
          />
        ) : isSpotifyChartsCharts ? (
          <NrmSpotifyChartsHome
            isDark={isDark}
            paddingHorizontal={pad}
            chartSource="charts"
            onBackToHome={resetToYoutubeHome}
            onOpenChartsSession={openChartsSessionSettings}
            onRenewChartsBearer={renewChartsBearerViaWebView}
          />
        ) : isLastfmCharts ? (
          <NrmLastfmChartsHome
            isDark={isDark}
            paddingHorizontal={pad}
            onBackToHome={resetToYoutubeHome}
          />
        ) : isLastfmSearchArtist ? (
          <NrmLastfmArtistSearchHome
            isDark={isDark}
            paddingHorizontal={pad}
            onBackToHome={resetToYoutubeHome}
          />
        ) : isLastfmSearchAlbum ? (
          <NrmLastfmAlbumSearchHome
            isDark={isDark}
            paddingHorizontal={pad}
            onBackToHome={resetToYoutubeHome}
          />
        ) : isLastfmSearchTrack ? (
          <NrmLastfmTrackSearchHome
            isDark={isDark}
            paddingHorizontal={pad}
            onBackToHome={resetToYoutubeHome}
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


