import { getResolvedApiBaseUrl } from '@/lib/apiBaseUrl';
import { loadWhisperModelPreference } from '@/lib/nrmDownloadSettings';
import { nrmBackendFetch } from '@/lib/nrmBackendFetch';

async function readFileBlob(fileUri: string, fileName: string): Promise<Blob> {
  if (typeof document !== 'undefined' && (fileUri.startsWith('blob:') || fileUri.startsWith('nrm-web-track:'))) {
    if (fileUri.startsWith('nrm-web-track:')) {
      const { readWebTrackBlob } = await import('@/lib/nrmWebDownloadTrackCatalog');
      const blob = await readWebTrackBlob(fileUri);
      if (!blob) throw new Error('web_track_blob_missing');
      return blob;
    }
    const res = await fetch(fileUri);
    return res.blob();
  }
  const FileSystem = await import('expo-file-system/src/legacy/FileSystem');
  const b64 = await FileSystem.readAsStringAsync(fileUri, { encoding: 'base64' });
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: 'application/octet-stream' });
}

/** PC Spring 백엔드 whisper.cpp 전사 (웹·Expo Go) */
export async function transcribeAudioViaBackend(
  fileUri: string,
  fileName = 'audio.mp3',
): Promise<string> {
  const base = await getResolvedApiBaseUrl();
  if (!base) return '';
  try {
    const blob = await readFileBlob(fileUri, fileName);
    const form = new FormData();
    form.append('file', blob, fileName);
    const pref = await loadWhisperModelPreference();
    form.append('whisperModelPreference', pref);
    const res = await nrmBackendFetch(`${base}/api/whisper/transcribe`, {
      method: 'POST',
      body: form,
    });
    if (!res.ok) return '';
    const body = (await res.json()) as { lrcText?: string };
    return (body.lrcText ?? '').trim();
  } catch {
    return '';
  }
}
