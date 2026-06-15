import type { NrmDownloadTrackItem } from '@/lib/nrmDownloadTrackTypes';

export async function deleteDownloadTrack(_track: NrmDownloadTrackItem): Promise<void> {
  throw new Error('트랙 삭제는 Android·iOS 앱에서만 사용할 수 있습니다.');
}
