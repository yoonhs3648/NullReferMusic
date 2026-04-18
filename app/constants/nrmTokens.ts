/**
 * NullReferMusic 디자인 토큰 — 웹·앱 공통 (확장 시 여기만 조정)
 */
export const nrmTokens = {
  color: {
    bg: '#0c0c12',
    bgElevated: '#12121c',
    surface: '#1a1a28',
    surfaceHover: '#222232',
    border: '#2e2e40',
    text: '#f4f4f8',
    textMuted: '#9ca3b8',
    accent: '#8b7cff',
    accentDim: '#6b5bdb',
    accent2: '#22d3ee',
    danger: '#f87171',
    success: '#4ade80',
  },
  space: {
    xs: 6,
    sm: 10,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  radius: {
    sm: 10,
    md: 14,
    lg: 20,
    full: 9999,
  },
  font: {
    title: 28,
    subtitle: 17,
    body: 16,
    small: 13,
    logo: 26,
  },
  layout: {
    maxContentWidth: 560,
    touchMin: 48,
  },
} as const;

export type NrmTokens = typeof nrmTokens;
