import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { resolveSpotifyWebViewUserAgent } from '@/lib/nrmSpotifyChartsWebViewConfig';

/** Spotify WebView용 UA — Android는 기기 WebView UA(`; wv)` 제거) */
export function useSpotifyWebViewUserAgent(): string | undefined {
  const [userAgent, setUserAgent] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void resolveSpotifyWebViewUserAgent().then((ua) => {
      if (!cancelled) setUserAgent(ua);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return userAgent;
}
