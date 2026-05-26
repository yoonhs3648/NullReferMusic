import { useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import WebView from 'react-native-webview';

import { nrmTokens } from '@/constants/nrmTokens';
import {
  buildYoutubeEmbedUrl,
  NRM_YOUTUBE_WEBVIEW_REFERER,
} from '@/lib/nrmYoutubeEmbedUrl';

type Props = {
  videoId: string | null;
  isDark: boolean;
};

export function YoutubeEmbed({ videoId, isDark }: Props) {
  const [loading, setLoading] = useState(true);

  if (!videoId) return null;

  const uri = buildYoutubeEmbedUrl(videoId, {
    pageOrigin: 'https://www.youtube.com',
    autoplay: true,
  });
  const borderColor = isDark
    ? nrmTokens.color.border
    : nrmTokens.color.cardLightBorder;

  return (
    <View style={[styles.wrap, { borderColor }]}>
      {loading ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={nrmTokens.color.primary} />
        </View>
      ) : null}
      <WebView
        key={videoId}
        source={{
          uri,
          headers: {
            Referer: NRM_YOUTUBE_WEBVIEW_REFERER,
          },
        }}
        style={styles.web}
        allowsFullscreenVideo
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onError={() => setLoading(false)}
        {...(Platform.OS === 'android'
          ? { mixedContentMode: 'always' as const }
          : {})}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: nrmTokens.radius.lg,
    overflow: 'hidden',
    marginBottom: 0,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: '#000',
  },
  web: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    zIndex: 1,
  },
});
