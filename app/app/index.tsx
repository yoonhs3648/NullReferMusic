import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { ScrollView, StyleSheet, Text, useColorScheme, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NrmLogo } from '@/components/nrm/NrmLogo';
import { NrmUrlDownloader } from '@/components/nrm/NrmUrlDownloader';
import { nrmTokens } from '@/constants/nrmTokens';

export default function HomeScreen() {
  const scheme = useColorScheme();
  const isDark = scheme !== 'light';
  const { width } = useWindowDimensions();
  const pad = width >= 900 ? nrmTokens.space.xxl : nrmTokens.space.lg;
  const maxW = Math.min(width - pad * 2, nrmTokens.layout.maxContentWidth + pad * 2);

  return (
    <LinearGradient
      colors={
        isDark
          ? [nrmTokens.color.bg, '#160e12', nrmTokens.color.bg]
          : ['#fff5f4', '#f0faf5', '#fff8f6']
      }
      style={styles.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView
          contentContainerStyle={[
            styles.scrollInner,
            { paddingHorizontal: pad, paddingVertical: nrmTokens.space.xl },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag">
          <View style={[styles.centerColumn, { maxWidth: maxW }]}>
            <NrmLogo isDark={isDark} />
            <Text
              style={[
                styles.lead,
                { color: isDark ? nrmTokens.color.textMuted : '#4b5568' },
              ]}>
              Android에서는 기본으로 이 기기 안에서 yt-dlp·FFmpeg로 MP3를 저장할
              수 있습니다. 웹은 로컬 PC 서버, 필요 시 앱에서「PC 서버」모드로 전환할
              수 있습니다.
            </Text>
            <NrmUrlDownloader isDark={isDark} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  safe: {
    flex: 1,
  },
  scrollInner: {
    flexGrow: 1,
    alignItems: 'center',
  },
  centerColumn: {
    width: '100%',
    alignSelf: 'center',
  },
  lead: {
    fontSize: nrmTokens.font.subtitle,
    lineHeight: 26,
    marginBottom: nrmTokens.space.xl,
    fontWeight: '500',
  },
});
