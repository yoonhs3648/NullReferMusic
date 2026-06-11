import { useCallback, useEffect, useRef, useState } from 'react';

import { isLastfmPlaceholderCoverUrl } from '@/lib/nrmCoverArtUrl';
import { isValidLastfmMbid } from '@/lib/nrmLastfmMbid';
import {
  getLastfmTrackCoverFromCache,
  setLastfmTrackCoverCache,
} from '@/lib/nrmLastfmTrackCoverCache';
import { resolveLastfmTrackCoverUrl } from '@/lib/nrmLastfmTrackCoverClient';

export type LastfmTrackCoverHit = {
  name: string;
  artist: string;
  mbid: string;
  imageUrl: string;
};

type Options = {
  hits: LastfmTrackCoverHit[];
  generation: string | number;
  enabled?: boolean;
};

function needsCoverFetch(hit: LastfmTrackCoverHit): boolean {
  if (!isValidLastfmMbid(hit.mbid)) return false;
  return isLastfmPlaceholderCoverUrl(hit.imageUrl);
}

export function useNrmLastfmTrackCoverLoader({
  hits,
  generation,
  enabled = true,
}: Options) {
  const [coverByMbid, setCoverByMbid] = useState<Record<string, string>>({});
  const generationRef = useRef(generation);
  const requestedRef = useRef(new Set<string>());
  generationRef.current = generation;

  useEffect(() => {
    requestedRef.current.clear();
    setCoverByMbid({});
  }, [generation]);

  const applyCover = useCallback((mbid: string, imageUrl: string) => {
    const key = mbid.trim().toLowerCase();
    setCoverByMbid((prev) => {
      if (prev[key] === imageUrl) return prev;
      return { ...prev, [key]: imageUrl };
    });
  }, []);

  const queueHit = useCallback(
    async (hit: LastfmTrackCoverHit) => {
      if (!enabled || !needsCoverFetch(hit)) return;
      const mbid = hit.mbid.trim().toLowerCase();
      if (!mbid || requestedRef.current.has(mbid)) return;
      if (generationRef.current !== generation) return;

      try {
        const fromStore = await getLastfmTrackCoverFromCache(mbid);
        if (generationRef.current !== generation) return;
        if (fromStore !== undefined) {
          applyCover(mbid, fromStore);
          requestedRef.current.add(mbid);
          return;
        }

        const resolved = await resolveLastfmTrackCoverUrl(mbid);
        if (generationRef.current !== generation) return;
        if (resolved.settled) {
          applyCover(mbid, resolved.coverUrl);
          requestedRef.current.add(mbid);
        }
      } catch {
        await setLastfmTrackCoverCache(mbid, '');
        requestedRef.current.add(mbid);
      }
    },
    [applyCover, enabled, generation],
  );

  useEffect(() => {
    if (!enabled || hits.length === 0) return;
    for (const hit of hits) {
      if (needsCoverFetch(hit)) {
        void queueHit(hit);
      }
    }
  }, [enabled, hits, queueHit]);

  const resolveCoverUrl = useCallback(
    (hit: LastfmTrackCoverHit): string => {
      if (!isLastfmPlaceholderCoverUrl(hit.imageUrl)) {
        return hit.imageUrl.trim();
      }
      const mbid = hit.mbid.trim().toLowerCase();
      if (!mbid) return '';
      const resolved = coverByMbid[mbid];
      return resolved ?? '';
    },
    [coverByMbid],
  );

  return { resolveCoverUrl };
}
