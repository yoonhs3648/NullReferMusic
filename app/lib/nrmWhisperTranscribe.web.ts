import { usesPcBackendInDev } from '@/lib/nrmDevRuntime';

export async function transcribeAudioToLrcWeb(fileUri: string): Promise<string> {
  if (!usesPcBackendInDev()) return '';
  const { transcribeAudioViaBackend } = await import('@/lib/nrmWhisperTranscribeBackend');
  return transcribeAudioViaBackend(fileUri);
}
