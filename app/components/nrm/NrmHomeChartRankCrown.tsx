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

export function homeChartPodiumTier(rank: number): HomeChartPodiumTier | null {
  if (rank < 1 || rank > 3) return null;
  return rank as HomeChartPodiumTier;
}

/** 왕관이 TOP 숫자 영역과 겹치지 않도록 커버 상단 여백 (px) */
export function homeChartCrownClearanceInset(coverSize: number): number {
  const crownW = Math.max(56, Math.round(coverSize * 0.32));
  const crownH = Math.round(crownW * 0.82);
  return Math.round(crownH * 0.54);
}

const CROWN_PALETTE: Record<
  CrownTier,
  {
    body: [string, string, string];
    shade: string;
    highlight: string;
    stroke: string;
    glow: string;
    band: [string, string];
    bandInner: string;
    jewel: string;
    orb: string;
    specular: string;
  }
> = {
  1: {
    body: ['#FFF4B0', '#F0C63A', '#B8860B'],
    shade: '#8A6508',
    highlight: '#FFFBE6',
    stroke: '#8A6508',
    glow: 'rgba(255, 214, 80, 0.55)',
    band: ['#FFE566', '#C9920A'],
    bandInner: '#9A7209',
    jewel: '#E8C547',
    orb: '#FFF8DC',
    specular: '#FFFFFF',
  },
  2: {
    body: ['#FFFFFF', '#D8E4EE', '#8E9DAD'],
    shade: '#5E6F80',
    highlight: '#FFFFFF',
    stroke: '#5E6F80',
    glow: 'rgba(200, 214, 228, 0.48)',
    band: ['#F4FAFF', '#9AABB8'],
    bandInner: '#6B7D8F',
    jewel: '#C8D8E8',
    orb: '#FFFFFF',
    specular: '#FFFFFF',
  },
  3: {
    body: ['#E8BE98', '#B8733F', '#6B4423'],
    shade: '#4A2C14',
    highlight: '#F0D0B0',
    stroke: '#4A2C14',
    glow: 'rgba(200, 140, 90, 0.45)',
    band: ['#D9A574', '#8B5A2B'],
    bandInner: '#5C3A1E',
    jewel: '#C4895A',
    orb: '#F0C89A',
    specular: '#FFE8D0',
  },
};

type Props = {
  rank: number;
  coverSize: number;
};

export function NrmHomeChartRankCrown({ rank, coverSize }: Props) {
  if (rank < 1 || rank > 3) return null;
  const tier = rank as CrownTier;
  const palette = CROWN_PALETTE[tier];
  const crownW = Math.max(56, Math.round(coverSize * 0.32));
  const crownH = Math.round(crownW * 0.82);
  const left = (coverSize - crownW) / 2;

  return (
    <View
      style={[
        styles.wrap,
        {
          width: crownW,
          height: crownH,
          left,
          top: -(crownH * 0.5),
          shadowColor: palette.glow,
        },
      ]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Svg width={crownW} height={crownH} viewBox="0 0 72 58">
        <Defs>
          <SvgGradient id={`crownBody-${tier}`} x1="0.15" y1="0" x2="0.85" y2="1">
            <Stop offset="0" stopColor={palette.body[0]} />
            <Stop offset="0.5" stopColor={palette.body[1]} />
            <Stop offset="1" stopColor={palette.body[2]} />
          </SvgGradient>
          <SvgGradient id={`crownShade-${tier}`} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={palette.shade} stopOpacity={0.45} />
            <Stop offset="0.45" stopColor={palette.shade} stopOpacity={0.08} />
            <Stop offset="1" stopColor={palette.shade} stopOpacity={0} />
          </SvgGradient>
          <SvgGradient id={`crownBand-${tier}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={palette.band[0]} />
            <Stop offset="1" stopColor={palette.band[1]} />
          </SvgGradient>
          <RadialGradient id={`crownOrb-${tier}`} cx="35%" cy="30%" r="65%">
            <Stop offset="0" stopColor={palette.specular} />
            <Stop offset="0.35" stopColor={palette.orb} />
            <Stop offset="1" stopColor={palette.body[2]} />
          </RadialGradient>
        </Defs>

        <Ellipse cx={36} cy={54} rx={29} ry={3.8} fill="#000000" opacity={0.28} />
        <Ellipse cx={36} cy={53} rx={22} ry={2.2} fill="#000000" opacity={0.12} />

        <Path
          d="M8 44 C18 48, 54 48, 64 44 L64 50 C54 53, 18 53, 8 50 Z"
          fill={`url(#crownBand-${tier})`}
          stroke={palette.bandInner}
          strokeWidth={1}
        />
        <Path d="M10 44 L62 44 L60 47 L12 47 Z" fill={palette.bandInner} opacity={0.35} />

        <Path
          d="M7 44 L13 27 L19 33 L26 18 L33 29 L36 11 L39 29 L46 18 L53 33 L59 27 L65 44 Z"
          fill={`url(#crownBody-${tier})`}
          stroke={palette.stroke}
          strokeWidth={1.2}
          strokeLinejoin="round"
        />
        <Path
          d="M7 44 L13 27 L19 33 L26 18 L33 29 L36 11 L39 29 L46 18 L53 33 L59 27 L65 44 Z"
          fill={`url(#crownShade-${tier})`}
        />

        <Path
          d="M14 30 L26 19 L36 14 L46 19 L58 30"
          fill="none"
          stroke={palette.highlight}
          strokeWidth={1.35}
          strokeLinecap="round"
          opacity={0.72}
        />
        <Path
          d="M18 38 L54 38"
          fill="none"
          stroke={palette.highlight}
          strokeWidth={0.8}
          strokeLinecap="round"
          opacity={0.35}
        />

        {[
          [13, 25, 3.2],
          [26, 16, 3.4],
          [36, 9, 3.8],
          [46, 16, 3.4],
          [59, 25, 3.2],
        ].map(([cx, cy, r], i) => (
          <Circle
            key={`orb-${i}`}
            cx={cx}
            cy={cy}
            r={r}
            fill={`url(#crownOrb-${tier})`}
            stroke={palette.stroke}
            strokeWidth={0.65}
          />
        ))}

        {[
          [13, 25],
          [36, 9],
          [59, 25],
        ].map(([cx, cy], i) => (
          <Circle key={`spec-${i}`} cx={cx - 0.8} cy={cy - 0.9} r={0.9} fill={palette.specular} opacity={0.85} />
        ))}

        {[
          [20, 46, 2.5, 2.1],
          [36, 46.5, 2.8, 2.2],
          [52, 46, 2.5, 2.1],
        ].map(([cx, cy, rx, ry], i) => (
          <Ellipse
            key={`jewel-${i}`}
            cx={cx}
            cy={cy}
            rx={rx}
            ry={ry}
            fill={palette.jewel}
            stroke={palette.stroke}
            strokeWidth={0.55}
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
        shadowOffset: { width: 0, height: 7 },
        shadowOpacity: 0.62,
        shadowRadius: 12,
      },
      android: {
        elevation: 10,
      },
      default: {},
    }),
  },
});
