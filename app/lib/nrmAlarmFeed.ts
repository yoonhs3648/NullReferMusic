import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import {
  fetchAlarmsForApp,
  getUnreadAlarmCount,
  invalidateAlarmCache,
  NRM_ALARM_POLL_INTERVAL_MS,
  peekAlarmCache,
  type NrmAlarmItem,
} from '@/lib/nrmAlarmClient';
import { markAlarmRead } from '@/lib/nrmAlarmReadState';

export type NrmAlarmFeed = {
  items: NrmAlarmItem[];
  unreadCount: number;
  loading: boolean;
  refreshing: boolean;
  expandedIds: Set<number>;
  reload: (force?: boolean) => Promise<void>;
  pullToRefresh: () => Promise<void>;
  toggleExpanded: (id: number) => void;
  collapseAllExpanded: () => void;
};

async function applyItems(
  rows: NrmAlarmItem[],
  setItems: (v: NrmAlarmItem[]) => void,
  setUnreadCount: (n: number) => void,
): Promise<void> {
  setItems(rows);
  setUnreadCount(await getUnreadAlarmCount(rows));
}

export function useNrmAlarmFeed(): NrmAlarmFeed {
  const [items, setItems] = useState<NrmAlarmItem[]>(() => peekAlarmCache() ?? []);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(() => peekAlarmCache() === null);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(() => new Set());
  const lastFetchAt = useRef(0);

  const reload = useCallback(async (force = false) => {
    const shouldForce =
      force || Date.now() - lastFetchAt.current >= NRM_ALARM_POLL_INTERVAL_MS;
    if (!shouldForce && peekAlarmCache()) {
      const cached = peekAlarmCache()!;
      await applyItems(cached, setItems, setUnreadCount);
      return;
    }
    try {
      const rows = await fetchAlarmsForApp({ force: shouldForce });
      lastFetchAt.current = Date.now();
      await applyItems(rows, setItems, setUnreadCount);
    } catch {
      const cached = peekAlarmCache();
      if (cached) await applyItems(cached, setItems, setUnreadCount);
    }
  }, []);

  const toggleExpanded = useCallback((id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        void markAlarmRead(id).then((marked) => {
          if (marked) setUnreadCount((c) => Math.max(0, c - 1));
        });
      }
      return next;
    });
  }, []);

  const collapseAllExpanded = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await reload(true);
      setLoading(false);
    })();
  }, [reload]);

  useEffect(() => {
    const timer = setInterval(() => {
      void reload(true);
    }, NRM_ALARM_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [reload]);

  useEffect(() => {
    const onState = (state: AppStateStatus) => {
      if (state === 'active') void reload(false);
    };
    const sub = AppState.addEventListener('change', onState);
    return () => sub.remove();
  }, [reload]);

  const pullToRefresh = useCallback(async () => {
    setRefreshing(true);
    invalidateAlarmCache();
    await reload(true);
    setRefreshing(false);
  }, [reload]);

  return {
    items,
    unreadCount,
    loading,
    refreshing,
    expandedIds,
    reload,
    pullToRefresh,
    toggleExpanded,
    collapseAllExpanded,
  };
}
