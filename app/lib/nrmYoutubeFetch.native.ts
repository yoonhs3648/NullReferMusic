/**
 * youtubei `FormatUtils.download`는 InnerTube `http.fetch`가 아니라 원시 `fetch_function`으로
 * googlevideo URL만 요청합니다. `STREAM_HEADERS`에 User-Agent가 없어 RN에서 403이 자주 나므로
 * 보강하고, 실패 시 Android/iOS YouTube 앱 UA로 한 번씩 더 시도합니다.
 */
function requestUrlString(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function isYoutubeStreamUrl(url: string): boolean {
  return (
    url.includes('googlevideo.com') ||
    url.includes('gvt1.com') ||
    /[?&]videoplayback(?:&|$)/.test(url)
  );
}

const STREAM_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'com.google.android.youtube/21.03.36(Linux; U; Android 16; en_US; SM-S908E Build/TP1A.220624.014) gzip',
  'com.google.ios.youtube/20.11.6 (iPhone10,4; U; CPU iOS 16_7_7 like Mac OS X)',
] as const;

async function fetchStreamOnce(
  baseFetch: typeof fetch,
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  userAgent: string,
): Promise<Response> {
  const headers = new Headers(
    init?.headers ?? (input instanceof Request ? input.headers : undefined),
  );
  headers.set('User-Agent', userAgent);
  if (!headers.has('Origin')) {
    headers.set('Origin', 'https://www.youtube.com');
  }
  if (!headers.has('Referer')) {
    headers.set('Referer', 'https://www.youtube.com/');
  }
  if (input instanceof Request) {
    return baseFetch(new Request(input, { ...init, headers }));
  }
  return baseFetch(input, { ...init, headers });
}

export function createNrmYoutubeFetch(
  baseFetch: typeof fetch = globalThis.fetch.bind(globalThis),
): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = requestUrlString(input);
    if (!isYoutubeStreamUrl(url)) {
      return baseFetch(input, init);
    }

    let last: Response | undefined;
    for (const ua of STREAM_USER_AGENTS) {
      last = await fetchStreamOnce(baseFetch, input, init, ua);
      if (last.ok) {
        return last;
      }
    }
    return last as Response;
  };
}

/** 세션·검색·다운로드 재시도 전부 동일 래퍼를 씁니다. */
export const nrmYoutubeFetch = createNrmYoutubeFetch();
