import { nrmTokens } from '@/constants/nrmTokens';

/** 레거시 Themed 컴포넌트용 — nrmTokens와 동일 계열 */
const tintColorLight = nrmTokens.color.accent;
const tintColorDark = nrmTokens.color.accent2;

export default {
  light: {
    text: '#1a0a0e',
    background: '#fff6f5',
    tint: tintColorLight,
    tabIconDefault: '#ccc',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: nrmTokens.color.text,
    background: nrmTokens.color.bg,
    tint: tintColorDark,
    tabIconDefault: '#ccc',
    tabIconSelected: tintColorDark,
  },
};
