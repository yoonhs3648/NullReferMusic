/**
 * 다운로드 메타데이터용 앨범 아트 URL 정규화.
 * 플레이어에 보이려면 URL 문자열이 아니라, 이 URL로 받은 이미지를 파일에 삽입해야 함.
 * 여기서는 가능한 한 고해상도·HTTPS URL을 만든다.
 */
export function normalizeCoverArtUrl(url: string | undefined | null): string {
  let u = (url ?? '').trim();
  if (!u) return '';

  if (u.startsWith('http://')) {
    u = `https://${u.slice(7)}`;
  }

  // Apple Music RSS: 100x100 → 600x600
  if (u.includes('mzstatic.com')) {
    u = u
      .replace(/100x100bb/gi, '600x600bb')
      .replace(/100x100/gi, '600x600');
  }

  // Last.fm CDN: 경로에 작은 썸네일 크기가 있으면 키움
  if (u.includes('lastfm') || u.includes('freetls.fastly.net')) {
    u = u
      .replace(/\/300x300-/g, '/600x600-')
      .replace(/\/174s\//g, '/600s/')
      .replace(/\/64s\//g, '/600s/')
      .replace(/\/34s\//g, '/600s/');
  }

  // Melon CDN — 목록·상세용으로 해상도 상향
  if (u.includes('cdnimg.melon.co.kr') || u.includes('melon.co.kr')) {
    u = u
      .replace(/\/melon\/resize\/\d+/g, '/melon/resize/500')
      .replace(/\/melon\/quality\/\d+/g, '/melon/quality/80');
  }

  // Spotify CDN은 원본 해상도 URL 그대로 사용
  return u;
}

/** 화면 표시 크기에 맞춰 커버 URL 해상도 상향 (홈 히어로 등) */
export function coverArtUrlForDisplaySize(url: string | undefined | null, minSidePx: number): string {
  let u = normalizeCoverArtUrl(url);
  if (!u || minSidePx <= 0) return u;

  const target = Math.min(1200, Math.max(500, Math.ceil(minSidePx)));

  if (u.includes('cdnimg.melon.co.kr') || u.includes('melon.co.kr')) {
    u = u.replace(/\/melon\/resize\/\d+/g, `/melon/resize/${target}`);
  }

  if (u.includes('mzstatic.com')) {
    u = u
      .replace(/\d+x\d+bb/gi, `${target}x${target}bb`)
      .replace(/\d+x\d+/gi, `${target}x${target}`);
  }

  if (u.includes('lastfm') || u.includes('freetls.fastly.net')) {
    u = u
      .replace(/\/\d+x\d+-/g, `/${target}x${target}-`)
      .replace(/\/\d+s\//g, `/${target}s/`);
  }

  return u;
}

/** Melon 기본(noAlbum/noArtist) placeholder */
export function isMelonPlaceholderCoverUrl(url: string | undefined | null): boolean {
  const u = (url ?? '').trim();
  return (
    !u ||
    u.includes('/default/noAlbum') ||
    u.includes('/default/noArtist') ||
    u.includes('/default/noMovie')
  );
}

export function needsMelonCoverFallback(url: string | undefined | null): boolean {
  return isMelonPlaceholderCoverUrl(url);
}

/** Last.fm 기본 placeholder (차트·검색 공통) */
export const LASTFM_PLACEHOLDER_IMAGE_ID = '2a96cbd8b46e442fc41c2b86b821562f';

export function isLastfmPlaceholderCoverUrl(url: string | undefined | null): boolean {
  const u = (url ?? '').trim();
  return !u || u.includes(LASTFM_PLACEHOLDER_IMAGE_ID);
}

/** Last.fm image[] 노드에서 앨범/트랙 커버 URL (placeholder 제외) */
export function pickLastfmCoverUrl(
  images: { '#text'?: string; size?: string }[] | undefined,
): string {
  if (!Array.isArray(images)) return '';
  const priority = ['mega', 'extralarge', 'large', 'medium', 'small', ''];
  for (const size of priority) {
    for (const img of images) {
      const url = (img['#text'] ?? '').trim();
      const imgSize = img.size ?? '';
      if (!url || url.includes(LASTFM_PLACEHOLDER_IMAGE_ID)) continue;
      if (imgSize === size || (size === '' && imgSize)) {
        return normalizeCoverArtUrl(url);
      }
    }
  }
  return '';
}

/** Spotify images[] 배열에서 가장 큰 커버 URL */
export function pickSpotifyCoverUrl(
  images: { url?: string; width?: number; height?: number }[] | undefined,
): string {
  if (!Array.isArray(images) || images.length === 0) return '';
  const sorted = [...images].sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  return normalizeCoverArtUrl(sorted[0]?.url ?? '');
}
