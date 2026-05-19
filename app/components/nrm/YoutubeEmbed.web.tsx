import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';
import { buildYoutubeEmbedUrl } from '@/lib/nrmYoutubeEmbedUrl';

type Props = {
  videoId: string | null;
  isDark: boolean;
};

export function YoutubeEmbed({ videoId, isDark }: Props) {
  const [pageOrigin, setPageOrigin] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setPageOrigin(window.location.origin);
    }
  }, []);

  if (!videoId) return null;

  const borderColor = isDark
    ? nrmTokens.color.border
    : nrmTokens.color.cardLightBorder;

  const src =
    pageOrigin !== null
      ? buildYoutubeEmbedUrl(videoId, { pageOrigin })
      : null;

  return (
    <View style={[styles.wrap, { borderColor }]}>
      <View style={styles.ratioBox}>
        {src ? (
          <iframe
            title="YouTube"
            key={videoId}
            src={src}
            style={iframeFill}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : null}
      </View>
    </View>
  );
}

const iframeFill: CSSProperties = {
  position: 'absolute',
  left: 0,
  top: 0,
  width: '100%',
  height: '100%',
  border: 0,
  display: 'block',
};

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    borderRadius: nrmTokens.radius.lg,
    overflow: 'hidden',
    marginBottom: 0,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: '#000',
  },
  /** RN Web에서 aspectRatio만으로 높이가 0이 되는 경우 대비 (16:9) */
  ratioBox: {
    position: 'relative',
    width: '100%',
    height: 0,
    paddingBottom: '56.25%',
    overflow: 'hidden',
  },
});
