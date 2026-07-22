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
export function scrollSectionListToOffset(
  listRef: SectionListRef,
  y: number,
  animated: boolean,
): void {
  listRef.current?.getScrollResponder()?.scrollTo({ y: Math.max(0, y), animated });
}

/**
 * 섹션 라벨 → 실측 content Y(px) 저장소.
 *
 * computeSectionStartOffsets()의 고정 행/헤더 높이 가정은 트랙 수가 많아질수록(특히
 * 실제 기기의 dp→px 라운딩이 행마다 누적되면서) 추정치와 실제 렌더링 위치가 조금씩
 * 벌어진다 — 뒤쪽 문자일수록 그 앞에 쌓인 행 수가 많아 오차가 커지는 구조라, 상수를
 * 아무리 정교하게 잡아도 기기별 라운딩 편차까지는 근본적으로 못 맞춘다.
 * 그래서 실제로 화면에 그려진 섹션 헤더의 진짜 위치를 onLayout으로 관측해 저장해두고,
 * 다음 점프부터는 "가장 가까운 실측 지점 + 그 사이 구간만큼의 추정 델타"로 보정한다.
 * (구간이 짧을수록 추정 오차도 작아 누적 오차 문제를 사실상 제거함)
 */
export type TrackListMeasuredOffsets = Map<TrackListIndexLabel, number>;

/** renderSectionHeader의 onLayout에서 측정한 pageY를 content Y로 환산해 저장 */
export function recordMeasuredSectionOffset(
  measured: TrackListMeasuredOffsets,
  label: TrackListIndexLabel,
  headerPageY: number,
  listPageY: number,
  scrollOffsetY: number,
): void {
  measured.set(label, headerPageY - listPageY + scrollOffsetY);
}

/**
 * 목표 섹션의 스크롤 Y를 결정한다.
 * 1) 목표 섹션 자체가 실측되어 있으면 그 값을 그대로 쓴다(정확).
 * 2) 아니면 실측된 섹션 중 가장 가까운 것을 찾아, 추정 오프셋 테이블상의
 *    "가까운 섹션→목표 섹션" 짧은 구간 델타만 더한다(그 구간의 추정 오차는 미미함).
 * 3) 실측 데이터가 전혀 없으면(최초 진입) 추정치를 그대로 쓴다.
 */
export function resolveSectionScrollOffset(
  sections: TrackListSection[],
  estimatedOffsets: number[],
  measured: TrackListMeasuredOffsets,
  targetSectionIndex: number,
): number {
  const estimated = estimatedOffsets[targetSectionIndex] ?? 0;
  const targetLabel = sections[targetSectionIndex]?.title;
  if (targetLabel != null) {
    const exact = measured.get(targetLabel);
    if (exact != null) return exact;
  }

  let nearestIndex = -1;
  let nearestDistance = Infinity;
  for (let i = 0; i < sections.length; i += 1) {
    if (!measured.has(sections[i]!.title)) continue;
    const distance = Math.abs(i - targetSectionIndex);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = i;
    }
  }
  if (nearestIndex < 0) return estimated;

  const nearestMeasured = measured.get(sections[nearestIndex]!.title)!;
  const nearestEstimated = estimatedOffsets[nearestIndex] ?? 0;
  return nearestMeasured + (estimated - nearestEstimated);
}
