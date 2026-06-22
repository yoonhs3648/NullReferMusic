import type { NrmDownloadTrackItem } from '@/lib/nrmDownloadTrackTypes';
import {
  listWebTracks,
  webTrackToListItem,
} from '@/lib/nrmWebDownloadTrackCatalog';

export type { NrmDownloadTrackItem } from '@/lib/nrmDownloadTrackTypes';

/** 웹: IndexedDB에 저장된 다운로드 트랙 목록 */
export async function listDownloadAudioTracks(): Promise<NrmDownloadTrackItem[]> {
  const rows = await listWebTracks();
  return rows.map(webTrackToListItem);
}
