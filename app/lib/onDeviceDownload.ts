import { NativeModules, Platform } from 'react-native';

export type OnDeviceDownloadOptions = {
  audioFormat: string;
  audioQuality: number;
  vbrMode?: string;
  losslessMode?: string;
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
    vbrMode: string,
    losslessMode: string,
  ) => Promise<{ path: string; format?: string; fallbackReason?: string }>;
  getAudioStreamUrl: (videoId: string) => Promise<string>;
  copyFileToSaf: (
    sourcePath: string,
    treeUri: string,
    displayName: string,
    mimeType: string,
  ) => Promise<{ uri: string }>;
  copyFileToExistingSaf?: (sourcePath: string, destUri: string) => Promise<null>;
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
  const trimmed = sourcePath.trim();
  if (trimmed.startsWith('content://')) {
    throw new Error(`SAF 소스 경로 오류(로컬 파일 필요): ${trimmed.slice(0, 96)}`);
  }
  const src = trimmed.startsWith('file://') ? trimmed.slice(7) : trimmed;
  const tree = treeUri.trim();
  if (!tree.startsWith('content://')) {
    throw new Error(`SAF 폴더 URI 오류: ${tree.slice(0, 96)}`);
  }
  const out = await mod.copyFileToSaf(src, tree, displayName, mimeType);
  const uri = out?.uri?.trim();
  if (!uri) throw new Error('SAF 저장 URI가 비어 있습니다.');
  return uri;
}

/** Android: createDocument 로 만든 SAF URI에 로컬 파일 스트리밍 복사 (base64 없음). */
export async function copyLocalFileToExistingSaf(
  sourcePath: string,
  destUri: string,
): Promise<void> {
  const mod = NativeModules.NrmOnDeviceDownload as NativeOnDevice | undefined;
  if (!mod?.copyFileToExistingSaf) {
    throw new Error('NrmOnDeviceDownload.copyFileToExistingSaf unavailable');
  }
  const trimmed = sourcePath.trim();
  if (trimmed.startsWith('content://')) {
    throw new Error(`SAF 소스 경로 오류(로컬 파일 필요): ${trimmed.slice(0, 96)}`);
  }
  const src = trimmed.startsWith('file://') ? trimmed.slice(7) : trimmed;
  const dest = destUri.trim();
  if (!dest.startsWith('content://')) {
    throw new Error(`SAF 대상 URI 오류: ${dest.slice(0, 96)}`);
  }
  await mod.copyFileToExistingSaf(src, dest);
}

/** Android: 캐시 파일을 사용자 설정 확장자로 ffmpeg 변환 */
export async function transcodeAudioOnDevice(
  inputPath: string,
  audioFormat: string,
  encode: import('@/lib/nrmDownloadSettings').NrmDownloadEncodeSettings,
): Promise<{ path: string; format?: string; fallbackReason?: string }> {
  const mod = NativeModules.NrmOnDeviceDownload as NativeOnDevice | undefined;
  if (!mod?.transcodeAudio) {
    throw new Error('NrmOnDeviceDownload.transcodeAudio unavailable');
  }
  const src = inputPath.startsWith('file://') ? inputPath.slice(7) : inputPath;
  return mod.transcodeAudio(
    src,
    audioFormat,
    encode.audioQuality,
    encode.vbrMode,
    encode.losslessMode,
  );
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
