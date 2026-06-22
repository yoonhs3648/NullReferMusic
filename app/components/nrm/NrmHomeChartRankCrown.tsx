import { Image, Platform, StyleSheet, View } from 'react-native';

import {
  HOME_CHART_CROWN_ASPECT,
  HOME_CHART_CROWN_SOURCES,
} from '@/constants/nrmHomeChartPodiumAssets';

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

const CROWN_GLOW: Record<CrownTier, string> = {
  1: 'rgba(255, 214, 80, 0.55)',
  2: 'rgba(200, 214, 228, 0.48)',
  3: 'rgba(200, 140, 90, 0.45)',
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

/** TOP N 숫자 그라데이션 (1~20) — 목업 금·은·동·프리미엄 명암 */
export function homeChartRankNumberGradientStops(
  rank: number,
  isDark: boolean,
): readonly [string, string, string, string] {
  const tier = homeChartPodiumTier(rank);
  if (tier === 1) {
    return isDark
      ? (['#FFF8D4', '#FFE566', '#E8B923', '#9A7209'] as const)
      : (['#FFF3C4', '#F0D060', '#D4A017', '#8B6914'] as const);
  }
  if (tier === 2) {
    return isDark
      ? (['#FFFFFF', '#DCE8F2', '#A8B8C8', '#5E6E7E'] as const)
      : (['#F8FAFC', '#C8D4E0', '#8E9DAD', '#566676'] as const);
  }
  if (tier === 3) {
    return isDark
      ? (['#FFE8CC', '#E8B080', '#C4895A', '#7A4E2A'] as const)
      : (['#F5DCC8', '#D9A06E', '#A0622E', '#6B3F1F'] as const);
  }
  return isDark
    ? (['#FFFFFF', '#D8D8D8', '#989898', '#585858'] as const)
    : (['#484848', '#333333', '#222222', '#121212'] as const);
}

export function homeChartRankTopLabelColor(rank: number, isDark: boolean): string {
  const podium = homeChartPodiumTextColors(rank, isDark);
  if (podium) return podium.label;
  return isDark ? 'rgba(255,255,255,0.58)' : 'rgba(0,0,0,0.42)';
}

export function homeChartRankNumberShadowColor(rank: number, isDark: boolean): string {
  const tier = homeChartPodiumTier(rank);
  if (tier === 1) return isDark ? 'rgba(180, 120, 0, 0.45)' : 'rgba(120, 80, 0, 0.28)';
  if (tier === 2) return isDark ? 'rgba(80, 100, 120, 0.4)' : 'rgba(60, 80, 100, 0.22)';
  if (tier === 3) return isDark ? 'rgba(140, 80, 40, 0.42)' : 'rgba(100, 60, 30, 0.24)';
  return isDark ? 'rgba(0, 0, 0, 0.35)' : 'rgba(0, 0, 0, 0.18)';
}

const CROWN_WIDTH_FRAC = 0.616;
const CROWN_MIN_WIDTH = 101;
const CROWN_TOP_FRAC = 0.775;
const CROWN_CLEARANCE_FRAC = 0.79;

function homeChartCrownSize(coverSize: number): { crownW: number; crownH: number } {
  const crownW = Math.max(CROWN_MIN_WIDTH, Math.round(coverSize * CROWN_WIDTH_FRAC));
  const crownH = Math.round(crownW * HOME_CHART_CROWN_ASPECT);
  return { crownW, crownH };
}

export function homeChartCrownClearanceInset(coverSize: number): number {
  const { crownH } = homeChartCrownSize(coverSize);
  return Math.round(crownH * CROWN_CLEARANCE_FRAC);
}

type Props = {
  rank: number;
  coverSize: number;
};

/** TOP 1·2·3 — PNG 왕관 (금·은·동, 투명 배경) */
export function NrmHomeChartRankCrown({ rank, coverSize }: Props) {
  if (rank < 1 || rank > 3) return null;
  const tier = rank as CrownTier;
  const { crownW, crownH } = homeChartCrownSize(coverSize);
  const left = (coverSize - crownW) / 2;

  return (
    <View
      style={[
        styles.wrap,
        {
          width: crownW,
          height: crownH,
          left,
          top: -(crownH * CROWN_TOP_FRAC),
          shadowColor: CROWN_GLOW[tier],
        },
      ]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Image
        source={HOME_CHART_CROWN_SOURCES[tier]}
        style={{ width: crownW, height: crownH, backgroundColor: 'transparent' }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    zIndex: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.5,
        shadowRadius: 10,
      },
      android: {
        elevation: 12,
      },
      default: {},
    }),
  },
});
