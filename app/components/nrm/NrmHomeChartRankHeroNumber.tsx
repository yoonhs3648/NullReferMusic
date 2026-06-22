import { Platform, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Mask, Rect, Stop, Text as SvgText } from 'react-native-svg';

import {
  homeChartRankNumberGradientStops,
  homeChartRankNumberShadowColor,
} from '@/components/nrm/NrmHomeChartRankCrown';

const RANK_NUMBER_FONT_SIZE = 108;
const RANK_NUMBER_HEIGHT = 112;

type Props = {
  rank: number;
  isDark: boolean;
};

function rankSvgWidth(rank: number): number {
  const digits = String(rank).length;
  return 72 + digits * 52;
}

const svgFontProps = Platform.select({
  ios: { fontFamily: 'System' },
  android: { fontFamily: 'sans-serif-black' },
  default: {},
});

const svgTextCommon = {
  textAnchor: 'middle' as const,
  fontSize: RANK_NUMBER_FONT_SIZE,
  fontWeight: '800' as const,
  ...svgFontProps,
};

/** TOP N 숫자 — Mask+Rect 그라데이션 (Android·Expo Go에서 url(#grad) 텍스트 fill 미지원 대응) */
export function NrmHomeChartRankHeroNumber({ rank, isDark }: Props) {
  const label = String(rank);
  const width = rankSvgWidth(rank);
  const gradId = `home-chart-rank-grad-${rank}-${isDark ? 'd' : 'l'}`;
  const maskId = `home-chart-rank-mask-${rank}-${isDark ? 'd' : 'l'}`;
  const stops = homeChartRankNumberGradientStops(rank, isDark);
  const shadow = homeChartRankNumberShadowColor(rank, isDark);
  const centerX = width / 2;
  const baselineY = RANK_NUMBER_HEIGHT - 18;

  return (
    <View style={[styles.wrap, { width, height: RANK_NUMBER_HEIGHT }]} pointerEvents="none">
      <Svg width={width} height={RANK_NUMBER_HEIGHT}>
        <Defs>
          <LinearGradient id={gradId} x1="0" y1="0" x2="0.35" y2="1">
            <Stop offset="0" stopColor={stops[0]} />
            <Stop offset="0.38" stopColor={stops[1]} />
            <Stop offset="0.72" stopColor={stops[2]} />
            <Stop offset="1" stopColor={stops[3]} />
          </LinearGradient>
          <Mask id={maskId} x="0" y="0" width={width} height={RANK_NUMBER_HEIGHT}>
            <SvgText x={centerX} y={baselineY} fill="#ffffff" {...svgTextCommon}>
              {label}
            </SvgText>
          </Mask>
        </Defs>
        <SvgText
          x={centerX + 1.5}
          y={baselineY + 2.5}
          fill={shadow}
          {...svgTextCommon}>
          {label}
        </SvgText>
        <Rect
          x={0}
          y={0}
          width={width}
          height={RANK_NUMBER_HEIGHT}
          fill={`url(#${gradId})`}
          mask={`url(#${maskId})`}
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    backgroundColor: 'transparent',
  },
});
