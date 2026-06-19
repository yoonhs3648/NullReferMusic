import { StyleSheet, View } from 'react-native';
import Svg, {
  Defs,
  Ellipse,
  G,
  LinearGradient as SvgGradient,
  Path,
  RadialGradient,
  Stop,
} from 'react-native-svg';

import { homeChartPodiumTier, type HomeChartPodiumTier } from '@/components/nrm/NrmHomeChartRankCrown';

type LaurelTier = HomeChartPodiumTier;

type LaurelPalette = {
  leaf: [string, string, string];
  stem: string;
  highlight: string;
  lampCore: string;
  lampHalo: string;
};

const LAUREL_PALETTE: Record<LaurelTier, LaurelPalette> = {
  1: {
    leaf: ['#FFF6C8', '#F0C63A', '#B8860B'],
    stem: '#9A7209',
    highlight: '#FFFBE0',
    lampCore: '#FFE566',
    lampHalo: '#FFF0A8',
  },
  2: {
    leaf: ['#FFFFFF', '#D0DCE8', '#8E9DAD'],
    stem: '#6B7D8F',
    highlight: '#FFFFFF',
    lampCore: '#E8F2FA',
    lampHalo: '#F8FBFF',
  },
  3: {
    leaf: ['#F0C89A', '#C4895A', '#7A4E2A'],
    stem: '#5C3A1E',
    highlight: '#FFD9B8',
    lampCore: '#E8BE98',
    lampHalo: '#F5D4B0',
  },
};

type LeafSpec = [number, number, number, number];

const LEFT_LEAVES: LeafSpec[] = [
  [32, 32, 5.2, -62],
  [42, 25, 4.8, -52],
  [52, 18, 4.5, -42],
  [62, 12, 4.2, -32],
  [72, 8, 3.9, -22],
  [84, 5, 3.6, -12],
  [94, 3, 3.2, -4],
];

const RIGHT_LEAVES: LeafSpec[] = [
  [168, 32, 5.2, 62],
  [158, 25, 4.8, 52],
  [148, 18, 4.5, 42],
  [138, 12, 4.2, 32],
  [128, 8, 3.9, 22],
  [116, 5, 3.6, 12],
  [106, 3, 3.2, 4],
];

type Props = {
  rank: number;
  width: number;
};

function pointedLeafPath(cx: number, cy: number, s: number): string {
  const top = cy - s;
  const bottom = cy + s * 0.22;
  const half = s * 0.4;
  // react-native-svg: C 명령마다 제어점 2개 + 끝점 1개(총 6개 숫자) 필수
  return (
    `M ${cx} ${top} ` +
    `C ${cx + half} ${cy - s * 0.5} ${cx + half * 0.7} ${bottom} ${cx} ${bottom} ` +
    `C ${cx - half * 0.7} ${bottom} ${cx - half} ${cy - s * 0.5} ${cx} ${top} ` +
    'Z'
  );
}

function PointedLeaf({
  cx,
  cy,
  size,
  rotation,
  gradId,
  palette,
}: {
  cx: number;
  cy: number;
  size: number;
  rotation: number;
  gradId: string;
  palette: LaurelPalette;
}) {
  const s = size;
  const d = pointedLeafPath(cx, cy, s);
  return (
    <G rotation={rotation} origin={`${cx}, ${cy}`}>
      <Path d={d} fill={`url(#${gradId})`} stroke={palette.stem} strokeWidth={0.3} />
      <Path
        d={`M${cx} ${cy - s * 0.88} L${cx} ${cy + s * 0.05}`}
        fill="none"
        stroke={palette.highlight}
        strokeWidth={0.45}
        strokeLinecap="round"
        opacity={0.55}
      />
    </G>
  );
}

const CENTER_RAYS = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];

/** TOP 1·2·3 트랙 제목 아래 U형 월계관 — 중앙 램프 광원 포함 */
export function NrmHomeChartLaurelWreath({ rank, width }: Props) {
  const tier = homeChartPodiumTier(rank);
  if (!tier) return null;

  const palette = LAUREL_PALETTE[tier];
  const height = Math.round(width * 0.24);
  const gradId = `laurel-caption-${tier}`;
  const lampId = `laurel-lamp-${tier}`;
  const burstId = `laurel-burst-${tier}`;

  return (
    <View
      style={[styles.wrap, { width, height }]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Svg width={width} height={height} viewBox="0 0 200 52">
        <Defs>
          <SvgGradient id={gradId} x1="0.15" y1="0" x2="0.85" y2="1">
            <Stop offset="0" stopColor={palette.leaf[0]} />
            <Stop offset="0.48" stopColor={palette.leaf[1]} />
            <Stop offset="1" stopColor={palette.leaf[2]} />
          </SvgGradient>
          <RadialGradient id={lampId} cx="50%" cy="90%" rx="38%" ry="46%" fx="50%" fy="94%">
            <Stop offset="0" stopColor={palette.lampCore} stopOpacity={1} />
            <Stop offset="0.28" stopColor={palette.lampHalo} stopOpacity={0.62} />
            <Stop offset="0.62" stopColor={palette.lampHalo} stopOpacity={0.16} />
            <Stop offset="1" stopColor={palette.lampHalo} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={burstId} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={palette.highlight} stopOpacity={1} />
            <Stop offset="0.45" stopColor={palette.lampCore} stopOpacity={0.55} />
            <Stop offset="1" stopColor={palette.lampCore} stopOpacity={0} />
          </RadialGradient>
        </Defs>

        <Ellipse cx={100} cy={44} rx={62} ry={20} fill={`url(#${lampId})`} />

        <Path
          d="M100 44 C86 42, 70 35, 56 24 C44 15, 32 9, 20 6"
          fill="none"
          stroke={palette.stem}
          strokeWidth={1.1}
          strokeLinecap="round"
        />
        <Path
          d="M100 44 C114 42, 130 35, 144 24 C156 15, 168 9, 180 6"
          fill="none"
          stroke={palette.stem}
          strokeWidth={1.1}
          strokeLinecap="round"
        />

        {LEFT_LEAVES.map(([cx, cy, size, rot], i) => (
          <PointedLeaf
            key={`ll-${i}`}
            cx={cx}
            cy={cy}
            size={size}
            rotation={rot}
            gradId={gradId}
            palette={palette}
          />
        ))}
        {RIGHT_LEAVES.map(([cx, cy, size, rot], i) => (
          <PointedLeaf
            key={`rl-${i}`}
            cx={cx}
            cy={cy}
            size={size}
            rotation={rot}
            gradId={gradId}
            palette={palette}
          />
        ))}

        {CENTER_RAYS.map((deg) => (
          <Path
            key={`ray-${deg}`}
            d="M100 44 L100 36"
            fill="none"
            stroke={palette.highlight}
            strokeWidth={deg % 90 === 0 ? 1.1 : 0.55}
            strokeLinecap="round"
            opacity={deg % 90 === 0 ? 0.9 : 0.45}
            rotation={deg}
            origin="100, 44"
          />
        ))}

        <Ellipse cx={100} cy={44} rx={8} ry={5} fill={`url(#${burstId})`} />
        <Ellipse cx={100} cy={43.5} rx={4.5} ry={2.6} fill={palette.lampCore} opacity={0.95} />
        <Ellipse cx={100} cy={43} rx={2.2} ry={1.3} fill={palette.highlight} opacity={0.92} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    zIndex: 1,
  },
});
