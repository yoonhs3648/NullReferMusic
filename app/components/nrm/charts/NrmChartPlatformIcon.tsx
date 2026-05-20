import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Image, StyleSheet, View } from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';
import type { ChartPlatformIconKey } from '@/lib/nrmChartsPlatforms';
import { NRM_CHART_OFFICIAL_ICON_URI } from '@/lib/nrmChartPlatformIcons';

type Props = {
  iconKey: ChartPlatformIconKey;
  size?: number;
};

const BILLBOARD_RED = '#E22134';

export function NrmChartPlatformIcon({ iconKey, size = 28 }: Props) {
  const officialUri = NRM_CHART_OFFICIAL_ICON_URI[iconKey];
  if (officialUri) {
    return (
      <Image
        source={{ uri: officialUri }}
        style={{
          width: size,
          height: size,
          borderRadius: nrmTokens.radius.xs,
        }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    );
  }

  if (iconKey === 'billboard') {
    return (
      <View style={[styles.wrap, { width: size, height: size }]}>
        <MaterialCommunityIcons
          name="billboard"
          size={size - 2}
          color={BILLBOARD_RED}
        />
      </View>
    );
  }

  const faBrand =
    iconKey === 'spotify'
      ? ('spotify' as const)
      : iconKey === 'youtubeMusic'
        ? ('youtube' as const)
        : null;

  if (faBrand) {
    const brandColor =
      iconKey === 'spotify' ? '#1DB954' : '#FF0000';
    return (
      <View style={[styles.wrap, { width: size, height: size }]}>
        <FontAwesome5 name={faBrand} size={size - 4} color={brandColor} brand />
      </View>
    );
  }

  return <View style={[styles.wrap, { width: size, height: size }]} />;
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
