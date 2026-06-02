import type { NrmYoutubeSearchSuffixMode } from '@/lib/nrmYoutubeSearchSettings';

/**
 * 검색 설정에 따라 최종 YouTube 검색 쿼리 문자열을 만듭니다.
 * - 기본: 사용자 입력만(공백 정리).
 * - Topic: 입력 끝에 ` topic` 보조(이미 topic 이 있으면 생략).
 * - Official Audio: 입력 끝에 ` official audio` 보조(이미 있으면 생략).
 * - Album Track / Uncensored / Explicit / Official MV: 동일 규칙으로 보조 접미사 추가.
 */
export function buildYoutubeSearchQuery(
  raw: string,
  mode: NrmYoutubeSearchSuffixMode,
): string {
  const q = raw.trim().replace(/\s+/g, ' ');
  if (!q.length) return q;

  if (mode === 'default') {
    return q;
  }

  if (mode === 'topic') {
    if (/\btopic\b/i.test(q)) return q;
    return `${q} topic`;
  }

  if (mode === 'official_audio') {
    if (/\bofficial\s+audio\b/i.test(q)) return q;
    return `${q} official audio`;
  }

  if (mode === 'album_track') {
    if (/\balbum\s+track\b/i.test(q)) return q;
    return `${q} album track`;
  }

  if (mode === 'uncensored') {
    if (/\buncensored\b/i.test(q)) return q;
    return `${q} uncensored`;
  }

  if (mode === 'explicit') {
    if (/\bexplicit\b/i.test(q)) return q;
    return `${q} explicit`;
  }

  if (mode === 'official_mv') {
    if (/\bofficial\s+mv\b/i.test(q)) return q;
    return `${q} official mv`;
  }

  return q;
}
