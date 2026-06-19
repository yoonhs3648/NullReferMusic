import { StyleSheet, View } from 'react-native';
import Svg, {
  Defs,
  LinearGradient as SvgGradient,
  Path,
  Stop,
} from 'react-native-svg';

import { homeChartPodiumTier } from '@/components/nrm/NrmHomeChartRankCrown';

type LaurelTier = 1 | 2 | 3;

const LAUREL_PALETTE: Record<
  LaurelTier,
  { leaf: [string, string, string]; stem: string; highlight: string }
> = {
  1: {
    leaf: ['#FFF0A8', '#E8C547', '#B8860B'],
    stem: '#9A7209',
    highlight: '#FFF8DC',
  },
  2: {
    leaf: ['#F8FBFF', '#C8D4E0', '#8E9DAD'],
    stem: '#6B7D8F',
    highlight: '#FFFFFF',
  },
  3: {
    leaf: ['#D9A574', '#A86F45', '#6B4423'],
    stem: '#5C3A1E',
    highlight: '#E8BE98',
  },
};

type Props = {
  rank: number;
  /** 앨범 커버와 동일한 폭 */
  width: number;
};

/** TOP 1·2·3 트랙 제목 아래 장식용 월계관 */
export function NrmHomeChartLaurelWreath({ rank, width }: Props) {
  const tier = homeChartPodiumTier(rank);
  if (!tier) return null;

  const palette = LAUREL_PALETTE[tier];
  const height = Math.round(width * 0.2);
  const gradId = `laurel-${tier}`;

  return (
    <View
      style={[styles.wrap, { width, height }]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Svg width={width} height={height} viewBox="0 0 200 44">
        <Defs>
          <SvgGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={palette.leaf[0]} />
            <Stop offset="0.45" stopColor={palette.leaf[1]} />
            <Stop offset="1" stopColor={palette.leaf[2]} />
          </SvgGradient>
        </Defs>

        <Path
          d="M100 38 C94 37, 88 35, 82 32 C72 26, 64 18, 58 8 C56 12, 58 18, 62 22 C66 26, 72 28, 76 26 C74 30, 70 34, 64 36 C58 38, 52 38, 48 36 C52 38, 58 39, 64 39 C70 39, 76 37, 82 35 C88 33, 94 31, 100 28"
          fill={`url(#${gradId})`}
          stroke={palette.stem}
          strokeWidth={0.65}
          strokeLinejoin="round"
        />
        {[
          [58, 12, 54, 6, 60, 8],
          [64, 18, 60, 12, 66, 14],
          [70, 24, 66, 18, 72, 20],
          [76, 28, 72, 22, 78, 24],
          [82, 31, 78, 25, 84, 27],
          [88, 33, 84, 27, 90, 29],
          [94, 34, 90, 28, 96, 30],
        ].map(([x1, y1, x2, y2, x3, y3], i) => (
          <Path
            key={`l-${i}`}
            d={`M${x1} ${y1} L${x2} ${y2} L${x3} ${y3} Z`}
            fill={`url(#${gradId})`}
            stroke={palette.stem}
            strokeWidth={0.35}
          />
        ))}

        <Path
          d="M100 38 C106 37, 112 35, 118 32 C128 26, 136 18, 142 8 C144 12, 142 18, 138 22 C134 26, 128 28, 124 26 C126 30, 130 34, 136 36 C142 38, 148 38, 152 36 C148 38, 142 39, 136 39 C130 39, 124 37, 118 35 C112 33, 106 31, 100 28"
          fill={`url(#${gradId})`}
          stroke={palette.stem}
          strokeWidth={0.65}
          strokeLinejoin="round"
        />
        {[
          [142, 12, 146, 6, 140, 8],
          [136, 18, 140, 12, 134, 14],
          [130, 24, 134, 18, 128, 20],
          [124, 28, 128, 22, 122, 24],
          [118, 31, 122, 25, 116, 27],
          [112, 33, 116, 27, 110, 29],
          [106, 34, 110, 28, 104, 30],
        ].map(([x1, y1, x2, y2, x3, y3], i) => (
          <Path
            key={`r-${i}`}
            d={`M${x1} ${y1} L${x2} ${y2} L${x3} ${y3} Z`}
            fill={`url(#${gradId})`}
            stroke={palette.stem}
            strokeWidth={0.35}
          />
        ))}

        <Path
          d="M92 38 C96 40, 104 40, 108 38 M88 40 C92 42, 108 42, 112 40"
          fill="none"
          stroke={palette.stem}
          strokeWidth={1.1}
          strokeLinecap="round"
        />
        <Path
          d="M94 36 L100 32 L106 36"
          fill="none"
          stroke={palette.highlight}
          strokeWidth={0.75}
          strokeLinecap="round"
          opacity={0.7}
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
});
