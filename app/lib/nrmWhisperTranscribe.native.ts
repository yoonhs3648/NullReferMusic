import { NativeModules, Platform } from 'react-native';

import { logNrmDev, logNrmRunError } from '@/lib/nrmDevLog';
import { usesPcBackendInDev } from '@/lib/nrmDevRuntime';

type NrmWhisperNative = {
  transcribeToLrc: (
    audioPath: string,
    modelPreference?: string,
  ) => Promise<{ lrc?: string }>;
};

function toFsPath(fileUri: string): string {
  return fileUri.startsWith('file://') ? fileUri.slice(7) : fileUri;
}

export async function transcribeAudioToLrcNative(fileUri: string): Promise<string> {
  const mod = NativeModules.NrmWhisper as NrmWhisperNative | undefined;
  if (Platform.OS !== 'android' || !mod?.transcribeToLrc) {
    if (usesPcBackendInDev()) {
      const { transcribeAudioViaBackend } = await import('@/lib/nrmWhisperTranscribeBackend');
      return transcribeAudioViaBackend(fileUri);
    }
    return '';
  }
  const { loadWhisperModelPreference } = await import('@/lib/nrmDownloadSettings');
  const preference = await loadWhisperModelPreference();
  const audioPath = toFsPath(fileUri);
  logNrmDev('download.whisper', {
    event: 'native_transcribe_start',
    audioPath: audioPath.slice(-120),
    modelPreference: preference,
  });
  const t0 = Date.now();
  try {
    const out = await mod.transcribeToLrc(audioPath, preference);
    const lrc = (out?.lrc ?? '').trim();
    logNrmDev('download.whisper', {
      event: 'native_transcribe_end',
      elapsedMs: Date.now() - t0,
      lrcChars: lrc.length,
      firstLine: lrc.split(/\r?\n/).find((l) => l.startsWith('['))?.slice(0, 48) ?? '(none)',
    });
    return lrc;
  } catch (e) {
    logNrmRunError('download.whisper', e, {
      event: 'native_transcribe_fail',
      elapsedMs: Date.now() - t0,
      audioPath: audioPath.slice(-120),
    });
    return '';
  }
}
