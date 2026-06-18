import { Platform, StyleSheet, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  LinearGradient as SvgGradient,
  Path,
  RadialGradient,
  Stop,
} from 'react-native-svg';

type CrownTier = 1 | 2 | 3;

export type HomeChartPodiumTier = CrownTier;

export const HOME_CHART_PODIUM_TEXT: Record<
  HomeChartPodiumTier,
  { light: { label: string; number: string }; dark: { label: string; number: string } }
> = {
  1: {
    light: { label: '#B8860B', number: '#D4A017' },
    dark: { label: '#E8C547', number: '#FFD95A' },
  },
  2: {
    light: { label: '#6E7F92', number: '#8E9DAD' },
    dark: { label: '#B8C4D4', number: '#D8E2EC' },
  },
  3: {
    light: { label: '#7A4E2A', number: '#A0622E' },
    dark: { label: '#C4895A', number: '#D9A06E' },
  },
};

export function homeChartPodiumTextColors(
  rank: number,
  isDark: boolean,
): { label: string; number: string } | null {
  if (rank < 1 || rank > 3) return null;
  const tier = rank as HomeChartPodiumTier;
  return HOME_CHART_PODIUM_TEXT[tier][isDark ? 'dark' : 'light'];
}

const CROWN_PALETTE: Record<
  CrownTier,
  {
    body: [string, string];
    highlight: string;
    stroke: string;
    glow: string;
    band: [string, string];
    jewel: string;
    orb: string;
  }
> = {
  1: {
    body: ['#FFE566', '#D4A017'],
    highlight: '#FFF4B8',
    stroke: '#9A7209',
    glow: 'rgba(255, 214, 80, 0.48)',
    band: ['#F0C63A', '#B8860B'],
    jewel: '#C9920A',
    orb: '#FFF0A8',
  },
  2: {
    body: ['#F2F6FA', '#9AABB8'],
    highlight: '#FFFFFF',
    stroke: '#6B7D8F',
    glow: 'rgba(176, 190, 206, 0.42)',
    band: ['#E2EAF2', '#8E9DAD'],
    jewel: '#7A8C9E',
    orb: '#F8FBFF',
  },
  3: {
    body: ['#C4895A', '#7A4E2A'],
    highlight: '#D9A574',
    stroke: '#5C3A1E',
    glow: 'rgba(122, 78, 42, 0.42)',
    band: ['#A86F45', '#6B4423'],
    jewel: '#5C3A1E',
    orb: '#C9956A',
  },
};

type Props = {
  rank: number;
  /** 앨범 커버 한 변 길이 */
  coverSize: number;
};

export function NrmHomeChartRankCrown({ rank, coverSize }: Props) {
  if (rank < 1 || rank > 3) return null;
  const tier = rank as CrownTier;
  const palette = CROWN_PALETTE[tier];
  const crownW = Math.max(52, Math.round(coverSize * 0.28));
  const crownH = Math.round(crownW * 0.78);
  const left = (coverSize - crownW) / 2;

  return (
    <View
      style={[
        styles.wrap,
        {
          width: crownW,
          height: crownH,
          left,
          top: -(crownH * 0.52),
          shadowColor: palette.glow,
        },
      ]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Svg width={crownW} height={crownH} viewBox="0 0 64 50">
        <Defs>
          <SvgGradient id={`crownBody-${tier}`} x1="0.2" y1="0" x2="0.8" y2="1">
            <Stop offset="0" stopColor={palette.body[0]} />
            <Stop offset="0.55" stopColor={palette.body[0]} />
            <Stop offset="1" stopColor={palette.body[1]} />
          </SvgGradient>
          <SvgGradient id={`crownBand-${tier}`} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={palette.band[0]} />
            <Stop offset="1" stopColor={palette.band[1]} />
          </SvgGradient>
          <RadialGradient id={`crownOrb-${tier}`} cx="50%" cy="35%" r="55%">
            <Stop offset="0" stopColor={palette.orb} />
            <Stop offset="1" stopColor={palette.body[1]} />
          </RadialGradient>
        </Defs>

        {/* 하단 밴드 */}
        <Path
          d="M7 38 C16 42, 48 42, 57 38 L57 44 C48 47, 16 47, 7 44 Z"
          fill={`url(#crownBand-${tier})`}
          stroke={palette.stroke}
          strokeWidth={1.1}
        />

        {/* 왕관 본체 — 5개 봉우리 */}
        <Path
          d="M6 38 L11 24 L16 30 L22 16 L28 26 L32 10 L36 26 L42 16 L48 30 L53 24 L58 38 Z"
          fill={`url(#crownBody-${tier})`}
          stroke={palette.stroke}
          strokeWidth={1.35}
          strokeLinejoin="round"
        />

        {/* 상단 하이라이트 */}
        <Path
          d="M12 27 L22 18 L32 13 L42 18 L50 27"
          fill="none"
          stroke={palette.highlight}
          strokeWidth={1.2}
          strokeLinecap="round"
          opacity={0.55}
        />

        {/* 봉우리 구슬 */}
        {[
          [11, 22],
          [22, 14],
          [32, 8],
          [42, 14],
          [53, 22],
        ].map(([cx, cy], i) => (
          <Circle
            key={`orb-${i}`}
            cx={cx}
            cy={cy}
            r={2.6}
            fill={`url(#crownOrb-${tier})`}
            stroke={palette.stroke}
            strokeWidth={0.7}
          />
        ))}

        {/* 밴드 보석 */}
        {[18, 32, 46].map((cx, i) => (
          <Ellipse
            key={`jewel-${i}`}
            cx={cx}
            cy={40.5}
            rx={2.4}
            ry={2}
            fill={palette.jewel}
            stroke={palette.stroke}
            strokeWidth={0.6}
          />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    zIndex: 3,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.42,
        shadowRadius: 7,
      },
      android: {
        elevation: 6,
      },
      default: {},
    }),
  },
});
