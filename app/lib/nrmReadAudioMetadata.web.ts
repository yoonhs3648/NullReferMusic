import type { NrmAudioFileMetadata } from '@/lib/nrmDownloadAudioMetadata';
import { normalizeDownloadMetadata } from '@/lib/nrmDownloadAudioMetadata';
import {
  readWebTrackLrcText,
  readWebTrackRecord,
} from '@/lib/nrmWebDownloadTrackCatalog';

const metaCache = new Map<string, NrmAudioFileMetadata>();

export async function readAudioFileMetadata(
  audioUri: string,
  fileName: string,
): Promise<NrmAudioFileMetadata> {
  const cached = metaCache.get(audioUri);
  if (cached) return cached;

  const record = await readWebTrackRecord(audioUri);
  if (record?.metadata) {
    const meta = normalizeDownloadMetadata(record.metadata);
    const lrc = record.lrcText?.trim() || (await readWebTrackLrcText(`${audioUri}:lrc`));
    if (lrc && !meta.lyrics?.trim()) {
      meta.lyrics = lrc;
    }
    metaCache.set(audioUri, meta);
    return meta;
  }

  return normalizeDownloadMetadata({
    artist: '',
    title: fileName.replace(/\.[^.]+$/, ''),
    album: '',
    genre: '',
    releaseDate: '',
    coverUrl: '',
  });
}

export function invalidateAudioMetadataCache(audioUri?: string): void {
  if (audioUri) {
    metaCache.delete(audioUri);
    return;
  }
  metaCache.clear();
}
