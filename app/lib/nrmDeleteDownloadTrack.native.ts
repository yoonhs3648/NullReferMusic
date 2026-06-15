import * as FileSystem from 'expo-file-system/src/legacy/FileSystem';

import type { NrmDownloadTrackItem } from '@/lib/nrmDownloadTrackTypes';
import { deletePersistedLrc } from '@/lib/nrmPersistDownload.native';
import { invalidateAudioMetadataCache } from '@/lib/nrmReadAudioMetadata';
import { siblingLrcUri } from '@/lib/nrmSiblingLrc';

/** 다운로드 경로에 저장된 오디오(+ LRC 사이드카) 물리 파일 삭제 */
export async function deleteDownloadTrack(track: NrmDownloadTrackItem): Promise<void> {
  const audioUri = track.audioUri.trim();
  if (!audioUri) {
    throw new Error('삭제할 파일 경로가 없습니다.');
  }

  const lrcCandidates = new Set<string>();
  if (track.lrcUri?.trim()) lrcCandidates.add(track.lrcUri.trim());
  lrcCandidates.add(siblingLrcUri(audioUri));

  for (const lrcUri of lrcCandidates) {
    await deletePersistedLrc(lrcUri);
  }

  const info = await FileSystem.getInfoAsync(audioUri);
  if (!info.exists) {
    throw new Error('파일을 찾을 수 없습니다.');
  }

  await FileSystem.deleteAsync(audioUri, { idempotent: true });
  invalidateAudioMetadataCache(audioUri);
}
