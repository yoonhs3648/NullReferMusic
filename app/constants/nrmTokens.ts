import { Platform } from 'react-native';

/**
 * NullRefer Music UI tokens — aligned with Apple-gallery design spec
 * (source: user-provided nullferenceMusicDesign.md).
 * Single accent: Action Blue. No decorative gradients; UI elevation via surfaces + hairlines.
 */

export const nrmTokens = {
  color: {
    primary: '#0066cc',
    primaryFocus: '#0071e3',
    primaryOnDark: '#2997ff',
    onPrimary: '#ffffff',

    ink: '#1d1d1f',
    body: '#1d1d1f',
    bodyOnDark: '#ffffff',
    bodyMuted: '#cccccc',
    inkMuted80: '#333333',
    inkMuted48: '#7a7a7a',
    dividerSoft: '#f0f0f0',
    hairline: '#e0e0e0',
    canvas: '#ffffff',
    canvasParchment: '#f5f5f7',
    surfacePearl: '#fafafc',
    surfaceTile1: '#272729',
    surfaceTile2: '#2a2a2c',
    surfaceTile3: '#252527',
    surfaceBlack: '#000000',
    surfaceChipTranslucent: '#d2d2d7',

    /** Semantic aliases used across screens */
    bg: '#272729',
    bgElevated: '#252527',
    surface: '#272729',
    surfaceHover: '#2a2a2c',
    border: '#e0e0e0',
    borderOnDark: 'rgba(255, 255, 255, 0.12)',
    text: '#ffffff',
    textMuted: '#cccccc',
    cardLightBg: '#ffffff',
    cardLightBorder: '#e0e0e0',

    /** Legacy accent keys → map to primary system */
    accent: '#0066cc',
    accentDim: '#004d99',
    accent2: '#0071e3',
    accent2Dim: '#004d99',
    accentSoft: 'rgba(0, 102, 204, 0.12)',
    accent2Soft: 'rgba(0, 113, 227, 0.1)',

    danger: '#d70015',
    success: '#1d8238',
  },
  space: {
    xxs: 4,
    xs: 8,
    sm: 12,
    md: 17,
    lg: 24,
    xl: 32,
    xxl: 48,
    section: 80,
  },
  radius: {
    none: 0,
    xs: 5,
    sm: 8,
    md: 11,
    lg: 18,
    pill: 9999,
    full: 9999,
  },
  font: {
    heroDisplay: 56,
    displayLg: 40,
    displayMd: 34,
    lead: 28,
    leadAiry: 24,
    tagline: 21,
    bodyStrong: 17,
    body: 17,
    caption: 14,
    small: 14,
    buttonLarge: 18,
    buttonUtility: 14,
    finePrint: 12,
    microLegal: 10,
    navLink: 12,
    logo: 34,
  },
  layout: {
    maxContentWidth: 980,
    touchMin: 44,
  },
} as const;

/** Spec: no shadows on chrome — only optional hairline. Product imagery may use the single product shadow. */
export const nrmShadow = {
  flat: {} as Record<string, unknown>,
  card: {} as Record<string, unknown>,
  cardDark: {} as Record<string, unknown>,
  productImage: Platform.select({
    web: {
      boxShadow: 'rgba(0, 0, 0, 0.22) 3px 5px 30px 0',
    },
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 3, height: 5 },
      shadowOpacity: 0.22,
      shadowRadius: 15,
    },
    default: {
      elevation: 8,
    },
  }),
};

export type NrmTokens = typeof nrmTokens;
