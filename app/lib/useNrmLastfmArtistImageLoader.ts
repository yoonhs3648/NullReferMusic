import { useCallback, useEffect, useRef, useState } from 'react';

import { isLastfmPlaceholderCoverUrl } from '@/lib/nrmCoverArtUrl';
import {
  getLastfmArtistImageFromCache,
  setLastfmArtistImageCache,
} from '@/lib/nrmLastfmArtistImageCache';
import {
  lastfmArtistImageCacheKey,
  resolveLastfmArtistImageUrl,
} from '@/lib/nrmLastfmArtistImageClient';
import type { LastfmArtistSearchHit } from '@/lib/nrmLastfmSearchTypes';

type Options = {
  hits: LastfmArtistSearchHit[];
  generation: string | number;
  enabled?: boolean;
};

function needsImageFetch(hit: LastfmArtistSearchHit): boolean {
  if (!hit.name.trim()) return false;
  return isLastfmPlaceholderCoverUrl(hit.imageUrl);
}

export function useNrmLastfmArtistImageLoader({
  hits,
  generation,
  enabled = true,
}: Options) {
  const [imageByKey, setImageByKey] = useState<Record<string, string>>({});
  const generationRef = useRef(generation);
  const requestedRef = useRef(new Set<string>());
  generationRef.current = generation;

  useEffect(() => {
    requestedRef.current.clear();
    setImageByKey({});
  }, [generation]);

  const applyImage = useCallback((cacheKey: string, imageUrl: string) => {
    setImageByKey((prev) => {
      if (prev[cacheKey] === imageUrl) return prev;
      return { ...prev, [cacheKey]: imageUrl };
    });
  }, []);

  const queueHit = useCallback(
    async (hit: LastfmArtistSearchHit) => {
      if (!enabled || !needsImageFetch(hit)) return;
      const cacheKey = lastfmArtistImageCacheKey(hit.name, hit.mbid);
      if (!cacheKey || requestedRef.current.has(cacheKey)) return;
      if (generationRef.current !== generation) return;

      try {
        const fromStore = await getLastfmArtistImageFromCache(cacheKey);
        if (generationRef.current !== generation) return;
        if (fromStore !== undefined) {
          applyImage(cacheKey, fromStore);
          requestedRef.current.add(cacheKey);
          return;
        }

        const resolved = await resolveLastfmArtistImageUrl(hit.name, hit.mbid);
        if (generationRef.current !== generation) return;
        if (resolved.settled) {
          applyImage(cacheKey, resolved.imageUrl);
          requestedRef.current.add(cacheKey);
        }
      } catch {
        await setLastfmArtistImageCache(cacheKey, '');
        requestedRef.current.add(cacheKey);
      }
    },
    [applyImage, enabled, generation],
  );

  useEffect(() => {
    if (!enabled || hits.length === 0) return;
    for (const hit of hits) {
      if (needsImageFetch(hit)) {
        void queueHit(hit);
      }
    }
  }, [enabled, hits, queueHit]);

  const resolveImageUrl = useCallback(
    (hit: LastfmArtistSearchHit): string => {
      if (!isLastfmPlaceholderCoverUrl(hit.imageUrl)) {
        return hit.imageUrl.trim();
      }
      const cacheKey = lastfmArtistImageCacheKey(hit.name, hit.mbid);
      const resolved = imageByKey[cacheKey];
      return resolved ?? '';
    },
    [imageByKey],
  );

  return { resolveImageUrl };
}
