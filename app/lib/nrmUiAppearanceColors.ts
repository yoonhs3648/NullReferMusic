import { nrmTokens } from '@/constants/nrmTokens';

type RootBackgroundOptions = {
  /** 메인 홈 charts 캐러셀 — 왕관 PNG와 맞춘 더 어두운 바탕 */
  chartsHome?: boolean;
};

/** 홈·드로어·스택 등 루트 배경 (불투명) */
export function getNrmRootBackgroundColor(isDark: boolean, options?: RootBackgroundOptions): string {
  if (!isDark) return nrmTokens.color.canvasParchment;
  if (options?.chartsHome) return nrmTokens.color.surfaceChartsHome;
  return nrmTokens.color.surfaceTile1;
}

/** Modal 뒤 스크림 — 다크에서는 이미 어두운 바탕 위에만 살짝 눌림 */
export function getNrmModalScrimColor(isDark: boolean): string {
  return isDark ? 'rgba(0, 0, 0, 0.35)' : 'rgba(0, 0, 0, 0.45)';
}
