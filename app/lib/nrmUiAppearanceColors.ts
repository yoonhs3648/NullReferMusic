import { nrmTokens } from '@/constants/nrmTokens';

/** 홈·드로어·스택 등 루트 배경 (불투명) */
export function getNrmRootBackgroundColor(isDark: boolean): string {
  return isDark
    ? nrmTokens.color.surfaceTile1
    : nrmTokens.color.canvasParchment;
}

/** Modal 뒤 스크림 — 다크에서는 이미 어두운 바탕 위에만 살짝 눌림 */
export function getNrmModalScrimColor(isDark: boolean): string {
  return isDark ? 'rgba(0, 0, 0, 0.35)' : 'rgba(0, 0, 0, 0.45)';
}
