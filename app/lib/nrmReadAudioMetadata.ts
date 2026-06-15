import type { NrmAudioFileMetadata } from '@/lib/nrmDownloadAudioMetadata';
import { normalizeDownloadMetadata } from '@/lib/nrmDownloadAudioMetadata';

export async function readAudioFileMetadata(
  _audioUri: string,
  _fileName: string,
): Promise<NrmAudioFileMetadata> {
  return normalizeDownloadMetadata({
    artist: '',
    title: '',
    album: '',
    genre: '',
    releaseDate: '',
    coverUrl: '',
  });
}

export function invalidateAudioMetadataCache(_audioUri?: string): void {
  /* 웹 환경 — no-op */
}
