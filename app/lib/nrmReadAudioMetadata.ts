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
