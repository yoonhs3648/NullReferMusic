import type { NrmAlignModelId } from '@/lib/nrmAlignModelCatalog';
import type { NrmWhisperModelId } from '@/lib/nrmWhisperCatalog';

/**
 * 카테고리(Whisper / Align)에 설치된 모델이 하나도 없을 때
 * 첫 설치 완료 시에만 해당 모델을 기본 선택으로 전환한다.
 */
export function createFirstInstallAutoSelectTracker<
  TModelId extends NrmWhisperModelId | NrmAlignModelId,
>() {
  let hadAnyInstalledAtDownloadStart = true;
  let pendingModelId: TModelId | null = null;

  return {
    markDownloadStart(anyInstalled: boolean, modelId: TModelId) {
      hadAnyInstalledAtDownloadStart = anyInstalled;
      pendingModelId = modelId;
    },
    shouldSelectAfterInstall(): boolean {
      return !hadAnyInstalledAtDownloadStart;
    },
    pendingModelId(): TModelId | null {
      return pendingModelId;
    },
    clearPending() {
      pendingModelId = null;
    },
  };
}
