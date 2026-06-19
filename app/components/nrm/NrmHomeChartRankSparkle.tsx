import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';

import type { HomeChartPodiumTier } from '@/components/nrm/NrmHomeChartRankCrown';

const SPARKLE_CORE: Record<HomeChartPodiumTier, string> = {
  1: '#FFF6C8',
  2: '#F4FAFF',
  3: '#F5D4B0',
};

const SPARKLE_RAY: Record<HomeChartPodiumTier, string> = {
  1: '#FFE566',
  2: '#D8E6F2',
  3: '#D9A574',
};

type SparkleSpec = {
  cx: number;
  cy: number;
  size: number;
  opacity: number;
};

/** 숫자 중심(50, 30) 기준 — 목업처럼 상단·좌우에 배치 */
const SPARKLE_LAYOUT: SparkleSpec[] = [
  { cx: 30, cy: 8, size: 7.8, opacity: 1 },
  { cx: 70, cy: 8, size: 7.8, opacity: 1 },
  { cx: 18, cy: 24, size: 5.4, opacity: 0.9 },
  { cx: 82, cy: 24, size: 5.4, opacity: 0.9 },
  { cx: 36, cy: 40, size: 3.8, opacity: 0.72 },
  { cx: 64, cy: 40, size: 3.8, opacity: 0.72 },
  { cx: 50, cy: 2, size: 4.6, opacity: 0.82 },
];

function FourPointStar({
  cx,
  cy,
  size,
  ray,
  opacity,
}: {
  cx: number;
  cy: number;
  size: number;
  ray: string;
  opacity: number;
}) {
  const arm = size;
  const slim = size * 0.32;
  return (
    <Path
      d={`M${cx} ${cy - arm} L${cx + slim} ${cy - slim} L${cx + arm} ${cy} L${cx + slim} ${cy + slim} L${cx} ${cy + arm} L${cx - slim} ${cy + slim} L${cx - arm} ${cy} L${cx - slim} ${cy - slim} Z`}
      fill={ray}
      opacity={opacity}
    />
  );
}

type Props = {
  tier: HomeChartPodiumTier;
};

/** TOP 1·2·3 숫자 주변 반짝임 */
export function NrmHomeChartRankSparkle({ tier }: Props) {
  const core = SPARKLE_CORE[tier];
  const ray = SPARKLE_RAY[tier];

  return (
    <View style={styles.wrap} pointerEvents="none">
      <Svg width={100} height={52} viewBox="0 0 100 52">
        <Defs>
          <RadialGradient id={`rank-sparkle-glow-${tier}`} cx="50%" cy="58%" r="48%">
            <Stop offset="0" stopColor={core} stopOpacity={0.35} />
            <Stop offset="0.55" stopColor={ray} stopOpacity={0.1} />
            <Stop offset="1" stopColor={ray} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={50} cy={30} r={34} fill={`url(#rank-sparkle-glow-${tier})`} />
        {SPARKLE_LAYOUT.map((s, i) => (
          <FourPointStar key={`spark-${i}`} cx={s.cx} cy={s.cy} size={s.size} ray={ray} opacity={s.opacity} />
        ))}
        {SPARKLE_LAYOUT.map((s, i) => (
          <Circle
            key={`spark-core-${i}`}
            cx={s.cx}
            cy={s.cy}
            r={Math.max(1.2, s.size * 0.18)}
            fill={core}
            opacity={s.opacity}
          />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: -14,
    right: -14,
    top: 4,
    bottom: -4,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
});
