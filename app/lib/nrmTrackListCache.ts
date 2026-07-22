/**
 * Storage 탭 트랙 목록의 "세션 내" 인메모리 캐시.
 *
 * - DB·디스크 영속 없음 — 앱 프로세스가 살아있는 동안만 유지되고 재시작 시 소멸한다.
 * - 목적: 탭을 반복 진입할 때마다 파일시스템(SAF 포함)을 재스캔하지 않고
 *   즉시 이전 목록·섹션을 보여준 뒤, 백그라운드에서 조용히 최신 상태를 확인한다
 *   (stale-while-revalidate). 순수 JS 변수만 사용해 리소스 부담이 거의 없다.
 */
import type { NrmDownloadTrackItem } from '@/lib/nrmDownloadTrackTypes';
import type { TrackListSection } from '@/lib/nrmTrackListIndex';

let cachedTracks: NrmDownloadTrackItem[] | null = null;
let cachedSections: TrackListSection[] | null = null;

export function getCachedDownloadTracks(): NrmDownloadTrackItem[] | null {
  return cachedTracks;
}

export function getCachedDownloadSections(): TrackListSection[] | null {
  return cachedSections;
}

export function setCachedDownloadTracks(
  tracks: NrmDownloadTrackItem[],
  sections?: TrackListSection[] | null,
): void {
  cachedTracks = tracks;
  if (sections !== undefined) {
    cachedSections = sections;
  }
}

export function clearCachedDownloadTracks(): void {
  cachedTracks = null;
  cachedSections = null;
}
