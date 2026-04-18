import { DarkTheme, DefaultTheme, Theme } from '@react-navigation/native';

import { nrmTokens } from '@/constants/nrmTokens';

const nrmLight: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: nrmTokens.color.accent,
    background: '#fff6f5',
    card: '#ffffff',
    text: '#1a0a0e',
    border: '#edd5d8',
    notification: nrmTokens.color.accent2,
  },
};

const nrmDark: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: nrmTokens.color.accent,
    background: nrmTokens.color.bg,
    card: nrmTokens.color.bgElevated,
    text: nrmTokens.color.text,
    border: nrmTokens.color.border,
    notification: nrmTokens.color.accent2,
  },
};

export function getNrmNavigationTheme(scheme: 'light' | 'dark' | null | undefined) {
  return scheme === 'light' ? nrmLight : nrmDark;
}
