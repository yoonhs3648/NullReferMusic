import type { NrmDownloadTrackItem } from '@/lib/nrmDownloadTrackTypes';
import { deleteWebTrack } from '@/lib/nrmWebDownloadTrackCatalog';

export async function deleteDownloadTrack(track: NrmDownloadTrackItem): Promise<void> {
  if (track.location.kind !== 'web') {
    throw new Error('웹 트랙만 삭제할 수 있습니다.');
  }
  await deleteWebTrack(track.audioUri);
}
