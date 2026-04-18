import { DarkTheme, DefaultTheme, Theme } from '@react-navigation/native';

import { nrmTokens } from '@/constants/nrmTokens';

const nrmLight: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: nrmTokens.color.accent,
    background: '#f8f7ff',
    card: '#ffffff',
    text: '#111118',
    border: '#e2e2ee',
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
