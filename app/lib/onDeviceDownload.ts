import { NativeModules, Platform } from 'react-native';

type NativeOnDevice = {
  downloadAudio: (
    url: string,
    noPlaylist: boolean,
  ) => Promise<{ path: string; message?: string }>;
};

export function isOnDeviceDownloadAvailable(): boolean {
  return (
    Platform.OS === 'android' &&
    NativeModules.NrmOnDeviceDownload != null
  );
}

export async function downloadOnDevice(
  url: string,
  noPlaylist: boolean,
): Promise<{ path: string; message?: string }> {
  const mod = NativeModules.NrmOnDeviceDownload as NativeOnDevice | undefined;
  if (!mod?.downloadAudio) {
    throw new Error('온디바이스 모듈을 사용할 수 없습니다. Android 개발/릴리스 빌드를 확인하세요.');
  }
  return mod.downloadAudio(url, noPlaylist);
}
