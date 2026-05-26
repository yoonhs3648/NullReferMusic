import { NativeModules, Platform } from 'react-native';

import type { NrmAudioFileMetadata } from '@/lib/nrmDownloadAudioMetadata';

type NativeAudioMetadata = {
  applyMetadata: (
    inputPath: string,
    metadata: NrmAudioFileMetadata,
  ) => Promise<{ path: string }>;
};

function toFsPath(fileUri: string): string {
  return fileUri.startsWith('file://') ? fileUri.slice(7) : fileUri;
}

export async function applyAudioFileMetadata(
  fileUri: string,
  metadata: NrmAudioFileMetadata,
): Promise<string> {
  if (Platform.OS !== 'android') {
    return fileUri;
  }
  const mod = NativeModules.NrmAudioMetadata as NativeAudioMetadata | undefined;
  if (!mod?.applyMetadata) {
    return fileUri;
  }
  const out = await mod.applyMetadata(toFsPath(fileUri), metadata);
  const path = out?.path?.trim();
  if (!path) return fileUri;
  return path.startsWith('file://') ? path : `file://${path}`;
}
