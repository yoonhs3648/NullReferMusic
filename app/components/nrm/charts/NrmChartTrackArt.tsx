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

/** 차트 커버 — 로딩 중엔 앱 메인 로고, 로드 완료 후 앨범 커버로 교체 */
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
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    setLoadFailed(false);
    setImageLoaded(false);
  }, [uri, cacheKey]);

  if (uri && !loadFailed) {
    const displayUri = coverArtUrlForDisplaySize(uri, targetPx);
    return (
      <View
        key={cacheKey ? `cover-${cacheKey}` : displayUri}
        style={[...artStyle, styles.container]}
      >
        {/* 이미지 로딩 완료 전까지 앱 메인 로고 표시 */}
        {!imageLoaded && (
          <View style={[StyleSheet.absoluteFill, row.artPlaceholder, styles.logoWrap]}>
            <Image source={APP_ICON} style={styles.logo} resizeMode="contain" />
          </View>
        )}
        <Image
          source={{ uri: displayUri }}
          style={[StyleSheet.absoluteFill, !imageLoaded && styles.invisible]}
          resizeMode="cover"
          onLoad={() => setImageLoaded(true)}
          onError={() => setLoadFailed(true)}
        />
      </View>
    );
  }

  return (
    <View style={[...artStyle, row.artPlaceholder, styles.container, styles.logoWrap]}>
      <Image source={APP_ICON} style={styles.logo} resizeMode="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  /** borderRadius 자식 클리핑 */
  container: {
    overflow: 'hidden',
  },
  logoWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  /** 로딩 중 — 자리는 차지하되 보이지 않음 */
  invisible: {
    opacity: 0,
  },
});
