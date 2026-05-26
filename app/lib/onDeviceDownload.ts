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
  getAudioStreamUrl: (videoId: string) => Promise<string>;
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

export async function getAudioStreamUrlOnDevice(
  videoId: string,
): Promise<string> {
  const mod = NativeModules.NrmOnDeviceDownload as NativeOnDevice | undefined;
  if (!mod?.getAudioStreamUrl) {
    throw new Error('NrmOnDeviceDownload unavailable');
  }
  return mod.getAudioStreamUrl(videoId);
}
