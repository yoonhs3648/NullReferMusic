import { DarkTheme, DefaultTheme, Theme } from '@react-navigation/native';

import { nrmTokens } from '@/constants/nrmTokens';

const nrmLight: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: nrmTokens.color.primary,
    background: nrmTokens.color.canvasParchment,
    card: nrmTokens.color.canvas,
    text: nrmTokens.color.ink,
    border: nrmTokens.color.hairline,
    notification: nrmTokens.color.primaryFocus,
  },
};

const nrmDark: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: nrmTokens.color.primary,
    background: nrmTokens.color.surfaceTile1,
    card: nrmTokens.color.surfaceTile3,
    text: nrmTokens.color.bodyOnDark,
    border: nrmTokens.color.borderOnDark,
    notification: nrmTokens.color.primaryOnDark,
  },
};

export function getNrmNavigationTheme(scheme: 'light' | 'dark' | null | undefined) {
  return scheme === 'light' ? nrmLight : nrmDark;
}
