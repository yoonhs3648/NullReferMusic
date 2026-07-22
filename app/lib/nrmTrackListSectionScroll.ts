/**
 * Storage SectionList 퀵 네비게이션 스크롤 — 고정 행 높이 + 사전 계산 오프셋.
 *
 * SectionList.scrollToLocation()은 멀리 있는 섹션이 아직 측정되지 않았을 때 자주 실패하고,
 * onScrollToIndexFailed 재시도가 y≈0 으로 scrollTo()를 호출해 목록 최상단으로 튀는 버그를 유발한다.
 * 대신 getItemLayout + scrollTo({ y }) 로 정확한 위치를 직접 지정한다.
 */
import type { RefObject } from 'react';
import type { SectionList } from 'react-native';

import type { NrmDownloadTrackItem } from '@/lib/nrmDownloadTrackTypes';
import {
  TRACK_LIST_INDEX_LABELS,
  type TrackListIndexLabel,
  type TrackListSection,
} from '@/lib/nrmTrackListIndex';

/** sectionHeader paddingVertical xxs×2 + finePrint(~12) + hairline */
export const TRACK_LIST_SECTION_HEADER_HEIGHT = 24;

/** trackRow paddingVertical sm×2 + art(52) + marginBottom xxs */
export const TRACK_LIST_ROW_HEIGHT = 80;

export type TrackListFlatLayoutEntry = {
  length: number;
  offset: number;
  index: number;
};

/** sections[i] 섹션 헤더가 시작하는 content Y 오프셋 */
export function computeSectionStartOffsets(sections: TrackListSection[]): number[] {
  const offsets: number[] = [];
  let y = 0;
  for (const section of sections) {
    offsets.push(y);
    y += TRACK_LIST_SECTION_HEADER_HEIGHT + section.data.length * TRACK_LIST_ROW_HEIGHT;
  }
  return offsets;
}

/** SectionList VirtualizedList flat index용 getItemLayout 테이블 */
export function buildTrackListFlatItemLayout(
  sections: TrackListSection[],
): TrackListFlatLayoutEntry[] {
  const layout: TrackListFlatLayoutEntry[] = [];
  let offset = 0;
  let flatIndex = 0;

  for (const section of sections) {
    layout.push({
      length: TRACK_LIST_SECTION_HEADER_HEIGHT,
      offset,
      index: flatIndex,
    });
    offset += TRACK_LIST_SECTION_HEADER_HEIGHT;
    flatIndex += 1;

    for (let i = 0; i < section.data.length; i += 1) {
      layout.push({
        length: TRACK_LIST_ROW_HEIGHT,
        offset,
        index: flatIndex,
      });
      offset += TRACK_LIST_ROW_HEIGHT;
      flatIndex += 1;
    }
  }

  return layout;
}

/**
 * 퀵 네비 Label → SectionList sections 배열 인덱스.
 * sections 순서(=화면 표시 순서)만 사용한다.
 */
export function findSectionIndexForJumpLabel(
  sections: TrackListSection[],
  label: TrackListIndexLabel,
): number {
  if (sections.length === 0) return 0;

  const selectedRank = TRACK_LIST_INDEX_LABELS.indexOf(label);
  const isHashLabel = label === '#';

  for (let i = 0; i < sections.length; i += 1) {
    const section = sections[i]!;
    if (section.jumpRank < 0) continue;
    if (!isHashLabel && section.title === '#') continue;
    if (section.jumpRank >= selectedRank) return i;
  }

  for (let i = sections.length - 1; i >= 0; i -= 1) {
    if (sections[i]!.title !== '#') return i;
  }

  return sections.length - 1;
}

type SectionListRef = RefObject<
  SectionList<NrmDownloadTrackItem, TrackListSection> | null
>;

/** scrollToLocation/onScrollToIndexFailed 없이 Y 오프셋으로 직접 스크롤 */
export function scrollSectionListToSection(
  listRef: SectionListRef,
  sectionStartOffsets: number[],
  sectionIndex: number,
  animated: boolean,
): void {
  const y = sectionStartOffsets[sectionIndex] ?? 0;
  listRef.current?.getScrollResponder()?.scrollTo({ y, animated });
}
