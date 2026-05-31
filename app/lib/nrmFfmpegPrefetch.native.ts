import { NativeModules, Platform } from 'react-native';

type NrmOnDeviceDownloadNative = {
  prefetchFfmpeg?: () => Promise<{ ready?: boolean }>;
};

/** 릴리스 APK: 앱 시작 시 ffmpeg+libffmpeg.so 백그라운드 예열 */
export async function prefetchFfmpegOnDevice(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const mod = NativeModules.NrmOnDeviceDownload as NrmOnDeviceDownloadNative | undefined;
  if (!mod?.prefetchFfmpeg) return;
  try {
    await mod.prefetchFfmpeg();
  } catch {
    /* optional warmup */
  }
}
