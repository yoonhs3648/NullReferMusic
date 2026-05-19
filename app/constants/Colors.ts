import { nrmTokens } from '@/constants/nrmTokens';

const tintColorLight = nrmTokens.color.primary;
const tintColorDark = nrmTokens.color.primaryOnDark;

export default {
  light: {
    text: nrmTokens.color.ink,
    background: nrmTokens.color.canvasParchment,
    tint: tintColorLight,
    tabIconDefault: nrmTokens.color.inkMuted48,
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: nrmTokens.color.bodyOnDark,
    background: nrmTokens.color.surfaceTile1,
    tint: tintColorDark,
    tabIconDefault: nrmTokens.color.bodyMuted,
    tabIconSelected: tintColorLight,
  },
};
