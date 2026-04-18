/**
 * NullReferMusic 디자인 토큰 — 웹·앱 공통
 * 메인: 리버풀 FC 구 엠블럼(~2010 전후) 실드 톤의 빨강 / 보조: 동 시기 크레스트 트림 초록
 */
export const nrmTokens = {
  color: {
    /** 어두운 베이스(살짝 레드 블랙) */
    bg: '#0c080a',
    bgElevated: '#140f12',
    surface: '#1a1418',
    surfaceHover: '#242022',
    border: '#33262b',
    text: '#f8f6f6',
    textMuted: '#b0a0a4',
    /** LFC heritage red (Pantone 186C 계열, 구 실드 빨강) */
    accent: '#C8102E',
    accentDim: '#9e0d24',
    /** 구 엠블럼 트림·클럽 그린 계열 */
    accent2: '#1B8C5E',
    accent2Dim: '#136647',
    accentSoft: 'rgba(200, 16, 46, 0.18)',
    accent2Soft: 'rgba(27, 140, 94, 0.22)',
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
