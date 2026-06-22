import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import type { HomeChartPodiumTier } from '@/components/nrm/NrmHomeChartRankCrown';

const PODIUM_LAMP_RGB: Record<HomeChartPodiumTier, string> = {
  1: '255, 224, 96',
  2: '228, 238, 248',
  3: '228, 186, 148',
};

type LampBlob = {
  cx: string;
  cy: string;
  rx: string;
  ry: string;
  weight: number;
};

/** U자 월계수 중앙 램프 + 좌우·상단 확산 (목업 램프 조명) */
const LAMP_BLOBS: LampBlob[] = [
  { cx: '50%', cy: '97%', rx: '68%', ry: '50%', weight: 1 },
  { cx: '18%', cy: '93%', rx: '38%', ry: '34%', weight: 0.78 },
  { cx: '82%', cy: '93%', rx: '38%', ry: '34%', weight: 0.78 },
  { cx: '50%', cy: '68%', rx: '56%', ry: '40%', weight: 0.5 },
  { cx: '50%', cy: '48%', rx: '44%', ry: '28%', weight: 0.22 },
];

type Props = {
  tier: HomeChartPodiumTier;
  isDark: boolean;
  width: number;
  height: number;
};

/** 하단 U형 월계수 램프에서 좌우·상단으로 퍼지는 배경 글로우 */
export function NrmHomeChartPodiumLampGlow({ tier, isDark, width, height }: Props) {
  const rgb = PODIUM_LAMP_RGB[tier];
  const core = isDark ? 0.38 : 0.26;
  const mid = isDark ? 0.17 : 0.11;
  const wash = isDark ? 0.05 : 0.032;

  return (
    <View
      style={[styles.wrap, { width, height }]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Svg width={width} height={height}>
        <Defs>
          {LAMP_BLOBS.map((blob, i) => (
            <RadialGradient
              key={`lamp-def-${tier}-${i}`}
              id={`lamp-glow-${tier}-${i}`}
              cx={blob.cx}
              cy={blob.cy}
              rx={blob.rx}
              ry={blob.ry}
              fx={blob.cx}
              fy={blob.cy}
              gradientUnits="objectBoundingBox">
              <Stop offset="0" stopColor={`rgb(${rgb})`} stopOpacity={core * blob.weight} />
              <Stop offset="0.38" stopColor={`rgb(${rgb})`} stopOpacity={mid * blob.weight} />
              <Stop offset="0.68" stopColor={`rgb(${rgb})`} stopOpacity={wash * blob.weight} />
              <Stop offset="1" stopColor={`rgb(${rgb})`} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        {LAMP_BLOBS.map((_, i) => (
          <Rect
            key={`lamp-fill-${tier}-${i}`}
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill={`url(#lamp-glow-${tier}-${i})`}
          />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
    overflow: 'hidden',
    borderRadius: 18,
  },
});
