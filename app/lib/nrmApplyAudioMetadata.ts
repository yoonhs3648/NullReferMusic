import type { NrmAudioFileMetadata } from '@/lib/nrmDownloadAudioMetadata';

export async function applyAudioFileMetadata(
  fileUri: string,
  metadata: NrmAudioFileMetadata,
): Promise<string> {
  const { hasEmbeddableAudioMetadata } = await import('@/lib/nrmDownloadAudioMetadata');
  if (!hasEmbeddableAudioMetadata(metadata)) {
    return fileUri;
  }
  if (typeof fileUri !== 'string' || !fileUri.trim()) {
    return fileUri;
  }
  const { Platform } = await import('react-native');
  if (Platform.OS === 'web') {
    const m = await import('@/lib/nrmApplyAudioMetadata.web');
    return m.applyAudioFileMetadata(fileUri, metadata);
  }
  const m = await import('@/lib/nrmApplyAudioMetadata.native');
  return m.applyAudioFileMetadata(fileUri, metadata);
}
