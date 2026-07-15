import type { NrmYoutubeSearchSuffixMode } from '@/lib/nrmYoutubeSearchSettings';
import type { YoutubeSearchItem } from '@/lib/youtubeSearchTypes';

/** 정규화 시 제거할 잡음 구문 (긴 것부터) */
const NOISE_PHRASES = [
  'official music video',
  'official audio',
  'official video',
  'official mv',
  'lyrics video',
  'lyric video',
  'music video',
  'official',
  'lyrics',
  'lyric',
  'audio',
  'video',
  'explicit',
  'uncensored',
  'clean',
  'mv',
  'hd',
  '4k',
  'hq',
] as const;

/**
 * 영상 제목·채널명·검색어용 정규화.
 * Topic 모드에서는 `topic` 토큰을 유지한다.
 */
export function normalizeYoutubeSearchText(
  raw: string,
  options?: { keepTopic?: boolean },
): string {
  const keepTopic = options?.keepTopic === true;
  let s = String(raw ?? '').toLowerCase();

  s = s.replace(/\([^)]*\)/g, ' ');
  s = s.replace(/\[[^\]]*\]/g, ' ');
  s = s.replace(/\{[^}]*\}/g, ' ');

  // 구분자·중점을 공백으로
  s = s.replace(/[·•|/_]+/g, ' ');
  s = s.replace(/\s+[-–—]+\s+/g, ' ');

  for (const phrase of NOISE_PHRASES) {
    const re = new RegExp(`\\b${phrase.replace(/\s+/g, '\\s+')}\\b`, 'gi');
    s = s.replace(re, ' ');
  }

  if (!keepTopic) {
    s = s.replace(/\btopic\b/gi, ' ');
  }

  // 문자·숫자·공백·(keepTopic 시 topic은 이미 단어로 남음) 외 제거
  s = s.replace(/[^\p{L}\p{N}\s]/gu, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/** 사용자 검색어에서 `가수 - 제목` 분리 (설정 접미사 붙이기 전 원문 기준) */
export function parseArtistTitleFromSearchQuery(raw: string): {
  artist: string;
  title: string;
} {
  let q = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (!q) return { artist: '', title: '' };

  // 사용자가 접미사를 직접 넣은 경우 파싱 전에 제거
  q = q
    .replace(/\s+official\s+audio$/i, '')
    .replace(/\s+official\s+mv$/i, '')
    .replace(/\s+album\s+track$/i, '')
    .replace(/\s+uncensored$/i, '')
    .replace(/\s+explicit$/i, '')
    .replace(/\s+topic$/i, '')
    .trim();

  const m = q.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (m) {
    return { artist: m[1]!.trim(), title: m[2]!.trim() };
  }
  return { artist: '', title: q };
}

function includesNormalizedNeedle(haystack: string, needle: string): boolean {
  if (!needle) return true;
  if (haystack.includes(needle)) return true;
  const words = needle.split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  return words.every((w) => haystack.includes(w));
}

function hasTopicToken(haystack: string): boolean {
  return /\btopic\b/.test(haystack);
}

/** Dice coefficient on character bigrams (0..1) */
export function diceCoefficient(a: string, b: string): number {
  if (!a.length && !b.length) return 1;
  if (!a.length || !b.length) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;

  const bigrams = (s: string): Map<string, number> => {
    const map = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      map.set(g, (map.get(g) ?? 0) + 1);
    }
    return map;
  };

  const A = bigrams(a);
  const B = bigrams(b);
  let overlap = 0;
  for (const [g, ca] of A) {
    const cb = B.get(g);
    if (cb) overlap += Math.min(ca, cb);
  }
  return (2 * overlap) / (a.length - 1 + (b.length - 1));
}

type Ranked = {
  item: YoutubeSearchItem;
  index: number;
  tier: number;
  similarity: number;
};

/**
 * YouTube 검색 결과 페이지를 artist/title 유사도 기준으로 재정렬.
 * 검색 API·쿼리는 변경하지 않고 리스트 순서만 바꿉니다.
 */
export function rerankYoutubeSearchItems(
  items: YoutubeSearchItem[],
  userQuery: string,
  mode: NrmYoutubeSearchSuffixMode,
): YoutubeSearchItem[] {
  if (items.length <= 1) return items;

  const { artist, title } = parseArtistTitleFromSearchQuery(userQuery);
  const keepTopic = mode === 'topic';
  const normArtist = normalizeYoutubeSearchText(artist, { keepTopic: false });
  const normTitle = normalizeYoutubeSearchText(title, { keepTopic: false });

  if (!normArtist && !normTitle) return items;

  const expected = normalizeYoutubeSearchText(
    [artist, title].filter(Boolean).join(' '),
    { keepTopic: false },
  );

  const ranked: Ranked[] = items.map((item, index) => {
    const haystack = normalizeYoutubeSearchText(
      `${item.title} ${item.channelTitle}`,
      { keepTopic },
    );
    const artistOk = includesNormalizedNeedle(haystack, normArtist);
    const titleOk = includesNormalizedNeedle(haystack, normTitle);
    const bothOk = artistOk && titleOk && (!!normArtist || !!normTitle);
    const topicOk = keepTopic && hasTopicToken(haystack);

    let tier: number;
    if (keepTopic && bothOk && topicOk) {
      tier = 1;
    } else if (bothOk) {
      tier = 2;
    } else {
      tier = 3;
    }

    const similarity = diceCoefficient(expected, haystack);
    return { item, index, tier, similarity };
  });

  ranked.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    if (a.similarity !== b.similarity) return b.similarity - a.similarity;
    return a.index - b.index;
  });

  return ranked.map((r) => r.item);
}
