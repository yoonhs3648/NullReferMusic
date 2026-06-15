import type {
  NrmDownloadLosslessMode,
  NrmDownloadVbrMode,
} from '@/lib/nrmDownloadSettings';

/** 확장자 변환 단계를 건너뛸지 (무손실·스마트 모드) */
export function shouldSkipExtensionTranscode(
  losslessMode: NrmDownloadLosslessMode,
  haveExt: string | null,
  wantExt: string,
): boolean {
  if (losslessMode === 'always_reencode') return false;
  return haveExt === wantExt;
}

export function vbrModeUsesCbrSlider(vbrMode: NrmDownloadVbrMode): boolean {
  return vbrMode === 'cbr';
}
