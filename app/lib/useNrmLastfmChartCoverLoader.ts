import { useCallback, useEffect, useRef, useState } from 'react';
import type { ViewToken } from 'react-native';

import type { ChartTrackItem } from '@/lib/nrmChartsTypes';
import { isLastfmPlaceholderCoverUrl } from '@/lib/nrmCoverArtUrl';
import { normalizeLastfmMbid } from '@/lib/nrmLastfmMbid';
import {
  getLastfmTrackCoverFromCache,
  primeLastfmTrackCoverCache,
} from '@/lib/nrmLastfmTrackCoverCache';
import { resolveLastfmTrackCoverUrl } from '@/lib/nrmLastfmTrackCoverClient';

const VIEWPORT_BUFFER = 4;

type Options = {
  items: ChartTrackItem[];
  generation: number;
  enabled: boolean;
};

function trackMbid(item: ChartTrackItem): string {
  return normalizeLastfmMbid(item.mbid) || normalizeLastfmMbid(item.trackId);
}

function needsCoverFetch(item: ChartTrackItem): boolean {
  const mbid = trackMbid(item);
  if (!mbid) return false;
  return isLastfmPlaceholderCoverUrl(item.imageUrl);
}

export function useNrmLastfmChartCoverLoader({
  items,
  generation,
  enabled,
}: Options) {
  const [coverByMbid, setCoverByMbid] = useState<Record<string, string>>({});
  const [loadingMbids, setLoadingMbids] = useState<Record<string, true>>({});

  const generationRef = useRef(generation);
  const requestedRef = useRef(new Set<string>());
  const itemsRef = useRef(items);
  itemsRef.current = items;
  generationRef.current = generation;

  useEffect(() => {
    requestedRef.current.clear();
    setCoverByMbid({});
    setLoadingMbids({});
  }, [generation]);

  useEffect(() => {
    if (!enabled) return;
    const mbids = items
      .filter(needsCoverFetch)
      .map(trackMbid)
      .filter(Boolean);
    primeLastfmTrackCoverCache(mbids);
  }, [items, enabled, generation]);

  const applyCover = useCallback((mbid: string, coverUrl: string) => {
    setCoverByMbid((prev) => {
      if (prev[mbid] === coverUrl) return prev;
      return { ...prev, [mbid]: coverUrl };
    });
  }, []);

  const setLoading = useCallback((mbid: string, on: boolean) => {
    setLoadingMbids((prev) => {
      if (on) {
        if (prev[mbid]) return prev;
        return { ...prev, [mbid]: true };
      }
      if (!prev[mbid]) return prev;
      const next = { ...prev };
      delete next[mbid];
      return next;
    });
  }, []);

  const queueMbid = useCallback(
    async (mbid: string) => {
      if (!enabled || !mbid) return;
      if (requestedRef.current.has(mbid)) return;
      if (generationRef.current !== generation) return;

      setLoading(mbid, true);

      try {
        const fromStore = await getLastfmTrackCoverFromCache(mbid);
        if (generationRef.current !== generation) return;
        if (fromStore !== undefined) {
          applyCover(mbid, fromStore ?? '');
          requestedRef.current.add(mbid);
          return;
        }

        const resolved = await resolveLastfmTrackCoverUrl(mbid);
        if (generationRef.current !== generation) return;
        if (resolved.settled) {
          applyCover(mbid, resolved.coverUrl);
          requestedRef.current.add(mbid);
        }
      } finally {
        if (generationRef.current === generation) {
          setLoading(mbid, false);
        }
      }
    },
    [applyCover, enabled, generation, setLoading],
  );

  const scheduleForIndices = useCallback(
    (indices: number[]) => {
      if (!enabled || indices.length === 0) return;
      const list = itemsRef.current;
      const min = Math.max(0, Math.min(...indices) - VIEWPORT_BUFFER);
      const max = Math.min(list.length - 1, Math.max(...indices) + VIEWPORT_BUFFER);
      const mbids: string[] = [];
      for (let i = min; i <= max; i++) {
        const item = list[i];
        if (!item || !needsCoverFetch(item)) continue;
        const mbid = trackMbid(item);
        if (mbid) mbids.push(mbid);
      }
      for (const mbid of mbids) {
        void queueMbid(mbid);
      }
    },
    [enabled, queueMbid],
  );

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const indices = viewableItems
        .map((v) => v.index)
        .filter((i): i is number => typeof i === 'number' && i >= 0);
      scheduleForIndices(indices);
    },
    [scheduleForIndices],
  );

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 12,
    minimumViewTime: 80,
  }).current;

  const resolveItemCoverUrl = useCallback(
    (item: ChartTrackItem): string => {
      if (!isLastfmPlaceholderCoverUrl(item.imageUrl)) {
        return item.imageUrl.trim();
      }
      const mbid = trackMbid(item);
      if (!mbid) return '';
      const resolved = coverByMbid[mbid];
      return resolved ?? '';
    },
    [coverByMbid],
  );

  const isItemCoverLoading = useCallback(
    (item: ChartTrackItem): boolean => {
      const mbid = trackMbid(item);
      if (!mbid) return false;
      if (!needsCoverFetch(item)) return false;
      if (coverByMbid[mbid] !== undefined) return false;
      return !!loadingMbids[mbid];
    },
    [coverByMbid, loadingMbids],
  );

  const hasMbidWithoutCover = useCallback((item: ChartTrackItem): boolean => {
    return needsCoverFetch(item) && !!trackMbid(item);
  }, []);

  return {
    onViewableItemsChanged,
    viewabilityConfig,
    resolveItemCoverUrl,
    isItemCoverLoading,
    hasMbidWithoutCover,
  };
}
