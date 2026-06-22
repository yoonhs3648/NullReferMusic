import { Image, StyleSheet, View } from 'react-native';

import type { HomeChartPodiumTier } from '@/components/nrm/NrmHomeChartRankCrown';
import { HOME_CHART_RANK_GLINT_SOURCES } from '@/constants/nrmHomeChartPodiumAssets';

type SparkleSpec = {
  left: number;
  top: number;
  size: number;
  opacity: number;
};

/** 목업 기준 4개만: 좌측, 우상단, 우측, 좌하단 */
const SPARKLE_LAYOUT: SparkleSpec[] = [
  { left: 43, top: 38, size: 21, opacity: 0.72 },
  { left: 104, top: 8, size: 30, opacity: 0.98 },
  { left: 134, top: 55, size: 24, opacity: 0.86 },
  { left: 22, top: 74, size: 16, opacity: 0.55 },
];

type Props = {
  tier: HomeChartPodiumTier;
};

/** TOP 1·2·3 숫자 주변 PNG 글린트 (배경 글로우 없음) */
export function NrmHomeChartRankSparkle({ tier }: Props) {
  return (
    <View style={styles.wrap} pointerEvents="none">
      {SPARKLE_LAYOUT.map((s, i) => (
        <Image
          key={`rank-glint-${i}`}
          source={HOME_CHART_RANK_GLINT_SOURCES[tier]}
          style={[
            styles.glint,
            {
              left: s.left,
              top: s.top,
              width: s.size,
              height: s.size,
              opacity: s.opacity,
            },
          ]}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      ))}
    </View>
  );
}

const SPARKLE_BOX_WIDTH = 190;

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    width: SPARKLE_BOX_WIDTH,
    height: 112,
    top: -4,
    left: '50%',
    transform: [{ translateX: -SPARKLE_BOX_WIDTH / 2 }],
    zIndex: 1,
    backgroundColor: 'transparent',
  },
  glint: {
    position: 'absolute',
  },
});
