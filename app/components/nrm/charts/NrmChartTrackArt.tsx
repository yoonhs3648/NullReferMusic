import { Image, StyleSheet, View } from 'react-native';

import { nrmChartTrackListStyles } from '@/components/nrm/charts/nrmChartTrackListStyles';

const APP_ICON = require('@/assets/images/icon.png');

type Props = {
  imageUrl: string;
  size?: number;
};

/** 차트 커버 — URL 없으면 앱 메인 로고(icon.png), 로드되면 앨범 커버 */
export function NrmChartTrackArt({ imageUrl, size = 52 }: Props) {
  const row = nrmChartTrackListStyles;
  const uri = imageUrl?.trim() ?? '';
  if (uri) {
    return <Image source={{ uri }} style={[row.art, { width: size, height: size }]} />;
  }
  return (
    <View style={[row.art, row.artPlaceholder, styles.logoWrap, { width: size, height: size }]}>
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
