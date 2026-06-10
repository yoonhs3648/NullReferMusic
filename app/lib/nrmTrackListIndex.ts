import type { NrmDownloadTrackItem } from '@/lib/nrmDownloadTrackTypes';

/** 우측 인덱스 바 라벨 (한글 초성 전체 + 영문 그룹 + #) */
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
  'D',
  'G',
  'J',
  'M',
  'P',
  'S',
  'V',
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

function englishJumpBucket(upper: string): TrackListIndexLabel {
  if (upper <= 'C') return 'A';
  if (upper <= 'F') return 'D';
  if (upper <= 'I') return 'G';
  if (upper <= 'L') return 'J';
  if (upper <= 'O') return 'M';
  if (upper <= 'R') return 'P';
  if (upper <= 'U') return 'S';
  if (upper <= 'X') return 'V';
  return 'Z';
}

/** 우측 빠른 이동 바용 버킷 (영문은 A·D·G… 그룹) */
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
    return englishJumpBucket(upper);
  }

  return '#';
}

/** 리스트 섹션 헤더 표시 문자 (ILLIT → I) */
export function getTrackListSectionTitle(label: string): string {
  const text = label.trim();
  if (!text) return '#';
  const ch = text[0];
  const code = ch.charCodeAt(0);

  if (code >= 0xac00 && code <= 0xd7a3) {
    const cho = HANGUL_CHO[Math.floor((code - 0xac00) / 588)];
    return CHO_TO_INDEX[cho] ?? '#';
  }

  if (JAMO_SET.has(ch)) {
    return ch;
  }

  const upper = ch.toUpperCase();
  if (upper >= 'A' && upper <= 'Z') {
    return upper;
  }

  return '#';
}

function sectionSortRank(title: string): number {
  const jumpIdx = TRACK_LIST_INDEX_LABELS.indexOf(title as TrackListIndexLabel);
  if (jumpIdx >= 0 && jumpIdx < 14) return jumpIdx;
  if (title === '#') return 900;
  if (title.length === 1) {
    const c = title.charCodeAt(0);
    if (c >= 65 && c <= 90) return 100 + (c - 65);
  }
  return 800;
}

export function sortTracksForList(tracks: NrmDownloadTrackItem[]): NrmDownloadTrackItem[] {
  return [...tracks].sort((a, b) =>
    a.displayLabel.localeCompare(b.displayLabel, 'ko-KR', { sensitivity: 'base' }),
  );
}

export type TrackListSection = {
  /** 섹션 헤더 표시 (I, ㄱ, # …) */
  title: string;
  /** 우측 인덱스 바 점프용 버킷 */
  jumpLabel: TrackListIndexLabel;
  data: NrmDownloadTrackItem[];
};

export function buildTrackListSections(tracks: NrmDownloadTrackItem[]): TrackListSection[] {
  const sorted = sortTracksForList(tracks);
  const buckets = new Map<string, NrmDownloadTrackItem[]>();

  for (const track of sorted) {
    const key = getTrackListSectionTitle(track.displayLabel);
    const list = buckets.get(key) ?? [];
    list.push(track);
    buckets.set(key, list);
  }

  const titles = [...buckets.keys()].sort((a, b) => sectionSortRank(a) - sectionSortRank(b));
  return titles.map((title) => {
    const data = buckets.get(title) ?? [];
    const jumpLabel = getTrackListJumpBucket(data[0]?.displayLabel ?? title);
    return { title, jumpLabel, data };
  });
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

/** 인덱스 탭 시 이동할 섹션 인덱스 (없으면 다음 점프 라벨 탐색) */
export function resolveSectionIndexForIndexLabel(
  label: TrackListIndexLabel,
  sections: TrackListSection[],
): number {
  const start = TRACK_LIST_INDEX_LABELS.indexOf(label);
  if (start < 0) return -1;
  for (let i = start; i < TRACK_LIST_INDEX_LABELS.length; i += 1) {
    const candidate = TRACK_LIST_INDEX_LABELS[i];
    const idx = sections.findIndex((s) => s.jumpLabel === candidate);
    if (idx >= 0) return idx;
  }
  return -1;
}

export function sectionJumpLabelsWithData(sections: TrackListSection[]): Set<TrackListIndexLabel> {
  return new Set(sections.map((s) => s.jumpLabel));
}

/** @deprecated sectionJumpLabelsWithData 사용 */
export function sectionIndexLabelsWithData(sections: TrackListSection[]): Set<TrackListIndexLabel> {
  return sectionJumpLabelsWithData(sections);
}
