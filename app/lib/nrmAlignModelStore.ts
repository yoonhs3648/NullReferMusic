import { useCallback, useEffect, useState } from 'react';

import type { NrmAlignModelId } from '@/lib/nrmAlignModelCatalog';
import {
  fetchAlignModelStatuses,
  isAlignModelNativeAvailable,
  startAlignModelDownload,
  subscribeAlignModelDownloadEvents,
  type AlignModelStatusRow,
} from '@/lib/nrmAlignModelNative';

export function useAlignModelStatuses(active: boolean) {
  const [rows, setRows] = useState<AlignModelStatusRow[]>([]);
  const [ready, setReady] = useState(!isAlignModelNativeAvailable());

  const refresh = useCallback(async () => {
    if (!isAlignModelNativeAvailable()) {
      setReady(true);
      return;
    }
    const next = await fetchAlignModelStatuses();
    setRows(next);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!active) return;
    void refresh();
    const poll = setInterval(() => void refresh(), 5000);
    return () => clearInterval(poll);
  }, [active, refresh]);

  useEffect(() => {
    if (!active) return;
    return subscribeAlignModelDownloadEvents(() => {
      void refresh();
    });
  }, [active, refresh]);

  const downloadModel = useCallback(async (modelId: NrmAlignModelId) => {
    const { confirmLargeDownloadIfNotOnWifi } = await import('@/lib/nrmLargeDownloadGuard');
    if (!(await confirmLargeDownloadIfNotOnWifi())) return;
    await startAlignModelDownload(modelId);
    void refresh();
  }, [refresh]);

  const statusFor = useCallback(
    (modelId: NrmAlignModelId): AlignModelStatusRow | undefined =>
      rows.find((r) => r.modelId === modelId),
    [rows],
  );

  return { rows, ready, refresh, downloadModel, statusFor };
}
