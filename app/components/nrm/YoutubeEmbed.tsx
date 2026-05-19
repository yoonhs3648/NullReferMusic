import { Platform, StyleSheet, View } from 'react-native';
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
  if (!videoId) return null;

  const uri = buildYoutubeEmbedUrl(videoId, {
    pageOrigin: NRM_YOUTUBE_WEBVIEW_REFERER,
  });
  const borderColor = isDark
    ? nrmTokens.color.border
    : nrmTokens.color.cardLightBorder;

  return (
    <View style={[styles.wrap, { borderColor }]}>
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
});
