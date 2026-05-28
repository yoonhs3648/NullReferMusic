import { NativeModules, Platform } from 'react-native';

import type { NrmWhisperModelId } from '@/lib/nrmWhisperCatalog';

type NrmWhisperNative = {
  prefetchModel?: (modelPreference: string) => Promise<{ ok?: boolean }>;
};

/** 릴리스 APK: 설정에서 모델 선택 시 백그라운드 다운로드 예열 */
export async function prefetchWhisperModelOnDevice(
  modelId: NrmWhisperModelId,
): Promise<void> {
  if (Platform.OS !== 'android') return;
  const mod = NativeModules.NrmWhisper as NrmWhisperNative | undefined;
  if (!mod?.prefetchModel) return;
  try {
    await mod.prefetchModel(modelId);
  } catch {
    /* optional warmup */
  }
}
