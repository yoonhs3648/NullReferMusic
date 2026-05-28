import { NativeModules, Platform } from 'react-native';

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
  if (Platform.OS !== 'android') {
    return '';
  }
  const mod = NativeModules.NrmWhisper as NrmWhisperNative | undefined;
  if (!mod?.transcribeToLrc) {
    return '';
  }
  const { loadWhisperModelPreference } = await import('@/lib/nrmDownloadSettings');
  const preference = await loadWhisperModelPreference();
  const out = await mod.transcribeToLrc(toFsPath(fileUri), preference);
  return (out?.lrc ?? '').trim();
}
