import type { NrmDownloadTrackItem } from '@/lib/nrmDownloadTrackTypes';

/** 우측 인덱스 바 라벨 (한글 초성 전체 + 영문 A~Z + #) */
export const TRACK_LIST_INDEX_LABELS = [
  'ㄱ',
  'ㄴ',
  'ㄷ',
  'ㄹ',
  'ㅁ',
  'ㅂ',
  'ㅅ',
  'ㅇ',
  'ㅈ',
  'ㅊ',
  'ㅋ',
  'ㅌ',
  'ㅍ',
  'ㅎ',
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
  'K',
  'L',
  'M',
  'N',
  'O',
  'P',
  'Q',
  'R',
  'S',
  'T',
  'U',
  'V',
  'W',
  'X',
  'Y',
  'Z',
  '#',
] as const;

export type TrackListIndexLabel = (typeof TRACK_LIST_INDEX_LABELS)[number];

const HANGUL_CHO = [
  'ㄱ',
  'ㄲ',
  'ㄴ',
  'ㄷ',
  'ㄸ',
  'ㄹ',
  'ㅁ',
  'ㅂ',
  'ㅃ',
  'ㅅ',
  'ㅆ',
  'ㅇ',
  'ㅈ',
  'ㅉ',
  'ㅊ',
  'ㅋ',
  'ㅌ',
  'ㅍ',
  'ㅎ',
] as const;

const CHO_TO_INDEX: Record<string, TrackListIndexLabel> = {
  'ㄱ': 'ㄱ',
  'ㄲ': 'ㄱ',
  'ㄴ': 'ㄴ',
  'ㄷ': 'ㄷ',
  'ㄸ': 'ㄷ',
  'ㄹ': 'ㄹ',
  'ㅁ': 'ㅁ',
  'ㅂ': 'ㅂ',
  'ㅃ': 'ㅂ',
  'ㅅ': 'ㅅ',
  'ㅆ': 'ㅅ',
  'ㅇ': 'ㅇ',
  'ㅈ': 'ㅈ',
  'ㅉ': 'ㅈ',
  'ㅊ': 'ㅊ',
  'ㅋ': 'ㅋ',
  'ㅌ': 'ㅌ',
  'ㅍ': 'ㅍ',
  'ㅎ': 'ㅎ',
};

const JAMO_SET = new Set<string>([
  'ㄱ',
  'ㄴ',
  'ㄷ',
  'ㄹ',
  'ㅁ',
  'ㅂ',
  'ㅅ',
  'ㅇ',
  'ㅈ',
  'ㅊ',
  'ㅋ',
  'ㅌ',
  'ㅍ',
  'ㅎ',
]);

/**
 * 트랙 표시 라벨의 첫 글자를 우측 퀵 네비게이션 버킷(ㄱ~ㅎ·A~Z·#)으로 매핑한다.
 * 섹션 헤더 표시 문자, 섹션 그룹핑 키, 퀵 네비게이션 타겟 판별에 모두 이 함수 하나만 쓴다.
 * (과거에는 동일 로직을 가진 `getTrackListSectionTitle`이 별도로 존재해 두 값이 항상 같다는
 *  것을 가정에만 의존했었음 — 함수를 하나로 합쳐 그 가정 자체를 제거함)
 */
export function getTrackListJumpBucket(label: string): TrackListIndexLabel {
  const text = label.trim();
  if (!text) return '#';
  const ch = text[0];
  const code = ch.charCodeAt(0);

  if (code >= 0xac00 && code <= 0xd7a3) {
    const cho = HANGUL_CHO[Math.floor((code - 0xac00) / 588)];
    return CHO_TO_INDEX[cho] ?? '#';
  }

  if (JAMO_SET.has(ch)) {
    return ch as TrackListIndexLabel;
  }

  const upper = ch.toUpperCase();
  if (upper >= 'A' && upper <= 'Z') {
    return upper as TrackListIndexLabel;
  }

  return '#';
}

/** 섹션 구성용 버킷 정렬 순서 (ㄱ~ㅎ → A~Z → 기타 → #) */
function sectionSortRank(bucket: TrackListIndexLabel): number {
  const jumpIdx = TRACK_LIST_INDEX_LABELS.indexOf(bucket);
  if (jumpIdx >= 0 && jumpIdx < 14) return jumpIdx;
  if (bucket === '#') return 900;
  if (bucket.length === 1) {
    const c = bucket.charCodeAt(0);
    if (c >= 65 && c <= 90) return 100 + (c - 65);
  }
  return 800;
}

/**
 * `String.prototype.localeCompare(other, locale, options)`를 비교마다 호출하면
 * 매번 내부적으로 Collator를 새로 만들어 비교 1회당 비용이 매우 크다(수천 곡 정렬 시
 * 체감 가능한 지연의 주요 원인). 모듈 레벨에 Collator를 한 번만 만들어 재사용한다.
 */
const trackListCollator = new Intl.Collator('ko-KR', { sensitivity: 'base' });

export function sortTracksForList(tracks: NrmDownloadTrackItem[]): NrmDownloadTrackItem[] {
  return [...tracks].sort((a, b) =>
    trackListCollator.compare(a.displayLabel, b.displayLabel),
  );
}

export type TrackListSection = {
  /** 섹션 헤더 표시 문자이자 퀵 네비게이션 버킷 (ㄱ, A, # …) — getTrackListJumpBucket의 결과값 그대로 */
  title: TrackListIndexLabel;
  /** TRACK_LIST_INDEX_LABELS.indexOf(title) 사전 계산값 — 퀵 네비게이션 탐색 시 매번 다시 계산하지 않도록 */
  jumpRank: number;
  data: NrmDownloadTrackItem[];
};

/**
 * SectionList가 실제로 그리는 섹션 배열을 만든다.
 * 버킷 키를 만들 때 이미 `getTrackListJumpBucket`을 쓰므로, 섹션의 `title`/`jumpRank`는
 * 그 버킷 값을 그대로 재사용한다(데이터 첫 항목을 다시 읽어 재계산하지 않음).
 */
export function buildTrackListSections(tracks: NrmDownloadTrackItem[]): TrackListSection[] {
  const sorted = sortTracksForList(tracks);
  const buckets = new Map<TrackListIndexLabel, NrmDownloadTrackItem[]>();

  for (const track of sorted) {
    const bucket = getTrackListJumpBucket(track.displayLabel);
    const list = buckets.get(bucket) ?? [];
    list.push(track);
    buckets.set(bucket, list);
  }

  const orderedBuckets = [...buckets.keys()].sort(
    (a, b) => sectionSortRank(a) - sectionSortRank(b),
  );

  return orderedBuckets.map((bucket) => ({
    title: bucket,
    jumpRank: TRACK_LIST_INDEX_LABELS.indexOf(bucket),
    data: buckets.get(bucket) ?? [],
  }));
}

export function filterTracksByQuery(
  tracks: NrmDownloadTrackItem[],
  query: string,
): NrmDownloadTrackItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return tracks;
  return tracks.filter(
    (t) =>
      t.displayLabel.toLowerCase().includes(q) || t.fileName.toLowerCase().includes(q),
  );
}

export function sectionJumpLabelsWithData(sections: TrackListSection[]): Set<TrackListIndexLabel> {
  return new Set(sections.map((s) => s.title));
}

/** @deprecated sectionJumpLabelsWithData 사용 */
export function sectionIndexLabelsWithData(sections: TrackListSection[]): Set<TrackListIndexLabel> {
  return sectionJumpLabelsWithData(sections);
}
