import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
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

import { NrmAppMenu } from '@/components/nrm/NrmAppMenu';
import { NrmLogo } from '@/components/nrm/NrmLogo';
import { NrmYoutubeHome } from '@/components/nrm/NrmYoutubeHome';
import { nrmTokens } from '@/constants/nrmTokens';
import { useNrmUiAppearance } from '@/context/NrmUiAppearanceContext';

const LOGO_TOP_FRAC = 0.1;

export default function HomeScreen() {
  const { isDark } = useNrmUiAppearance();
  const { width, height: winH } = useWindowDimensions();
  const [layoutPhase, setLayoutPhase] = useState<'welcome' | 'browsing'>(
    'welcome',
  );
  const [homeEpoch, setHomeEpoch] = useState(0);

  const pad = width >= 900 ? nrmTokens.space.xxl : nrmTokens.space.lg;
  const logoPadTop = Math.max(0, winH * LOGO_TOP_FRAC);
  const isWelcome = layoutPhase === 'welcome';
  const resetToWelcome = useCallback(() => {
    setLayoutPhase('welcome');
    setHomeEpoch((v) => v + 1);
  }, []);

  const onMainLogoPress = useCallback(() => {
    resetToWelcome();
  }, [resetToWelcome]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (layoutPhase !== 'welcome') {
        resetToWelcome();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [layoutPhase, resetToWelcome]);

  return (
    <View
      style={[
        styles.rootBg,
        {
          backgroundColor: isDark
            ? nrmTokens.color.surfaceTile1
            : nrmTokens.color.canvasParchment,
        },
      ]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <NrmAppMenu isDark={isDark} paddingHorizontal={pad} />
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
                <NrmLogo tone={isDark ? 'dark' : 'light'} onPress={onMainLogoPress} />
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
