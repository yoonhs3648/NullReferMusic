import { useEffect, useState } from 'react';
import { Image, PixelRatio, StyleSheet, View } from 'react-native';

import { nrmChartTrackListStyles } from '@/components/nrm/charts/nrmChartTrackListStyles';
import { coverArtUrlForDisplaySize } from '@/lib/nrmCoverArtUrl';

const APP_ICON = require('@/assets/images/icon.png');

type Props = {
  imageUrl: string;
  size?: number;
  borderRadius?: number;
  /** FlatList 재활용 시 Image 캐시 혼선 방지 */
  cacheKey?: string;
  /** Retina·홈 히어로 등 — CDN 해상도 상향 */
  minPixelSize?: number;
};

/** 차트 커버 — URL 없으면 앱 메인 로고(icon.png), 로드되면 앨범 커버 */
export function NrmChartTrackArt({
  imageUrl,
  size = 52,
  borderRadius = nrmChartTrackListStyles.art.borderRadius,
  cacheKey,
  minPixelSize,
}: Props) {
  const row = nrmChartTrackListStyles;
  const uri = imageUrl?.trim() ?? '';
  const artStyle = [row.art, { width: size, height: size, borderRadius }];
  const targetPx = minPixelSize ?? Math.ceil(size * PixelRatio.get());
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    setLoadFailed(false);
  }, [uri, cacheKey]);

  if (uri && !loadFailed) {
    const displayUri = coverArtUrlForDisplaySize(uri, targetPx);
    return (
      <Image
        key={cacheKey ? `cover-${cacheKey}` : displayUri}
        source={{ uri: displayUri }}
        style={artStyle}
        resizeMode="cover"
        onError={() => setLoadFailed(true)}
      />
    );
  }
  return (
    <View style={[...artStyle, row.artPlaceholder, styles.logoWrap]}>
      <Image source={APP_ICON} style={styles.logo} resizeMode="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  logoWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
  },
  logo: {
    width: '100%',
    height: '100%',
  },
});
