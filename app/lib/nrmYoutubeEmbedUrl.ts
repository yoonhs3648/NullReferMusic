/**
 * 임베드 재생: YouTube가 Referer/origin을 요구하는 경우가 많음(오류 153 등).
 * 앱 bundle id 기반 URL을 Referer로 사용 (react-native-webview 권장 패턴).
 */
export const NRM_YOUTUBE_WEBVIEW_REFERER = 'https://com.nullrefer.music';

export function buildYoutubeEmbedUrl(
  videoId: string,
  options?: { pageOrigin?: string; autoplay?: boolean },
): string {
  const u = new URL(
    `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`,
  );
  u.searchParams.set('playsinline', '1');
  u.searchParams.set('rel', '0');
  u.searchParams.set('modestbranding', '1');
  u.searchParams.set('enablejsapi', '1');
  if (options?.autoplay) {
    u.searchParams.set('autoplay', '1');
  }
  if (options?.pageOrigin) {
    u.searchParams.set('origin', options.pageOrigin);
  }
  return u.toString();
}
