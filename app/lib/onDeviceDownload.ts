import { NativeModules, Platform } from 'react-native';

export type OnDeviceDownloadOptions = {
  audioFormat: string;
  audioQuality: number;
};

type NativeOnDevice = {
  downloadAudio: (
    url: string,
    noPlaylist: boolean,
    audioFormat: string,
    audioQuality: number,
  ) => Promise<{ path: string; message?: string }>;
  transcodeAudio?: (
    inputPath: string,
    audioFormat: string,
    audioQuality: number,
  ) => Promise<{ path: string; format?: string; fallbackReason?: string }>;
  getAudioStreamUrl: (videoId: string) => Promise<string>;
  copyFileToSaf: (
    sourcePath: string,
    treeUri: string,
    displayName: string,
    mimeType: string,
  ) => Promise<{ uri: string }>;
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
  options: OnDeviceDownloadOptions,
): Promise<{ path: string; message?: string }> {
  const mod = NativeModules.NrmOnDeviceDownload as NativeOnDevice | undefined;
  if (!mod?.downloadAudio) {
    throw new Error('NrmOnDeviceDownload unavailable');
  }
  return mod.downloadAudio(
    url,
    noPlaylist,
    options.audioFormat,
    options.audioQuality,
  );
}

export async function copyLocalFileToSaf(
  sourcePath: string,
  treeUri: string,
  displayName: string,
  mimeType: string,
): Promise<string> {
  const mod = NativeModules.NrmOnDeviceDownload as NativeOnDevice | undefined;
  if (!mod?.copyFileToSaf) {
    throw new Error('NrmOnDeviceDownload.copyFileToSaf unavailable');
  }
  const src = sourcePath.startsWith('file://') ? sourcePath.slice(7) : sourcePath;
  const out = await mod.copyFileToSaf(src, treeUri, displayName, mimeType);
  const uri = out?.uri?.trim();
  if (!uri) throw new Error('SAF 저장 URI가 비어 있습니다.');
  return uri;
}

/** Android: 캐시 파일을 사용자 설정 확장자(yt-dlp 포맷명)로 변환 */
export async function transcodeAudioOnDevice(
  inputPath: string,
  audioFormat: string,
  audioQuality: number,
): Promise<{ path: string; format?: string; fallbackReason?: string }> {
  const mod = NativeModules.NrmOnDeviceDownload as NativeOnDevice | undefined;
  if (!mod?.transcodeAudio) {
    throw new Error('NrmOnDeviceDownload.transcodeAudio unavailable');
  }
  const src = inputPath.startsWith('file://') ? inputPath.slice(7) : inputPath;
  return mod.transcodeAudio(src, audioFormat, audioQuality);
}

export async function getAudioStreamUrlOnDevice(
  videoId: string,
): Promise<string> {
  const mod = NativeModules.NrmOnDeviceDownload as NativeOnDevice | undefined;
  if (!mod?.getAudioStreamUrl) {
    throw new Error('NrmOnDeviceDownload unavailable');
  }
  return mod.getAudioStreamUrl(videoId);
}
