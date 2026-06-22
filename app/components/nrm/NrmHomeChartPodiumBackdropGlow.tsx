import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import type { HomeChartPodiumTier } from '@/components/nrm/NrmHomeChartRankCrown';

type Props = {
  tier: HomeChartPodiumTier;
  isDark: boolean;
  width: number;
  height: number;
  coverCenterX: number;
  coverBottomY: number;
  coverSize: number;
};

/** 금·은·동 빛 색상 (다크/라이트 분리 — 두 모드 모두 색이 또렷하게 구분되도록) */
const GLOW_RGB: Record<'dark' | 'light', Record<HomeChartPodiumTier, string>> = {
  dark: {
    1: '255, 198, 64',
    2: '202, 222, 242',
    3: '230, 138, 66',
  },
  light: {
    1: '201, 132, 8',
    2: '78, 112, 144',
    3: '156, 76, 24',
  },
};

type Blob = {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  weight: number;
};

/**
 * TOP 1·2·3 — 앨범커버 하단 좌·우 꼭지점에서 5시/7시 방향으로
 * 은은하지만 강렬하게 퍼지는 그라데이션 빛. SVG로 직접 그려
 * 웹·Expo Go·APK가 동일한 좌표/falloff로 렌더링된다.
 */
export function NrmHomeChartPodiumBackdropGlow({
  tier,
  isDark,
  width,
  height,
  coverCenterX,
  coverBottomY,
  coverSize,
}: Props) {
  if (width <= 0 || height <= 0 || coverSize <= 0) return null;

  const rgb = (isDark ? GLOW_RGB.dark : GLOW_RGB.light)[tier];
  const core = isDark ? 0.5 : 0.42;
  const mid = isDark ? 0.24 : 0.2;
  const wash = isDark ? 0.06 : 0.05;

  const halfW = coverSize / 2;
  const leftCornerX = coverCenterX - halfW;
  const rightCornerX = coverCenterX + halfW;
  const cornerY = coverBottomY;
  const spread = coverSize * 0.34;

  // 좌/우 코너 빛은 강하게(weight 1), 중앙 풀은 가운데 빈틈을 부드럽게 메움.
  const blobs: Blob[] = [
    {
      cx: leftCornerX - spread * 0.45,
      cy: cornerY + spread * 0.55,
      rx: coverSize * 1.18,
      ry: coverSize * 0.98,
      weight: 1,
    },
    {
      cx: rightCornerX + spread * 0.45,
      cy: cornerY + spread * 0.55,
      rx: coverSize * 1.18,
      ry: coverSize * 0.98,
      weight: 1,
    },
    {
      cx: coverCenterX,
      cy: cornerY + coverSize * 0.14,
      rx: coverSize * 1.02,
      ry: coverSize * 0.62,
      weight: 0.72,
    },
  ];

  return (
    <View
      style={[styles.wrap, { width, height }]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Svg width={width} height={height}>
        <Defs>
          {blobs.map((b, i) => (
            <RadialGradient
              key={`pg-def-${tier}-${i}`}
              id={`pg-glow-${tier}-${isDark ? 'd' : 'l'}-${i}`}
              cx={b.cx}
              cy={b.cy}
              rx={b.rx}
              ry={b.ry}
              fx={b.cx}
              fy={b.cy}
              gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={`rgb(${rgb})`} stopOpacity={core * b.weight} />
              <Stop offset="0.4" stopColor={`rgb(${rgb})`} stopOpacity={mid * b.weight} />
              <Stop offset="0.72" stopColor={`rgb(${rgb})`} stopOpacity={wash * b.weight} />
              <Stop offset="1" stopColor={`rgb(${rgb})`} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        {blobs.map((_, i) => (
          <Rect
            key={`pg-fill-${tier}-${i}`}
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill={`url(#pg-glow-${tier}-${isDark ? 'd' : 'l'}-${i})`}
          />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 0,
    overflow: 'visible',
  },
});
