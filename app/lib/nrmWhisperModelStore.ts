import { useCallback, useEffect, useState } from 'react';

import type { NrmWhisperModelId } from '@/lib/nrmWhisperCatalog';
import {
  fetchWhisperModelStatuses,
  isWhisperModelNativeAvailable,
  startWhisperModelDownloadOnDevice,
  subscribeWhisperModelDownloadEvents,
  type WhisperModelStatusRow,
} from '@/lib/nrmWhisperModelNative';

export function useWhisperModelStatuses(active: boolean) {
  const [rows, setRows] = useState<WhisperModelStatusRow[]>([]);
  const [ready, setReady] = useState(!isWhisperModelNativeAvailable());

  const refresh = useCallback(async () => {
    if (!isWhisperModelNativeAvailable()) {
      setReady(true);
      return;
    }
    const next = await fetchWhisperModelStatuses();
    setRows(next);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!active) return;
    void refresh();
    // 이벤트 구독(subscribeWhisperModelDownloadEvents)이 실시간 변경을 처리하므로
    // 폴백 폴링은 30초로 늘려 중복 요청을 최소화한다.
    const poll = setInterval(() => {
      void refresh();
    }, 30_000);
    return () => clearInterval(poll);
  }, [active, refresh]);

  useEffect(() => {
    if (!active) return;
    return subscribeWhisperModelDownloadEvents(() => {
      void refresh();
    });
  }, [active, refresh]);

  const downloadModel = useCallback(async (modelId: NrmWhisperModelId) => {
    const { confirmLargeDownloadIfNotOnWifi } = await import('@/lib/nrmLargeDownloadGuard');
    if (!(await confirmLargeDownloadIfNotOnWifi())) return;
    await startWhisperModelDownloadOnDevice(modelId);
    void refresh();
  }, [refresh]);

  const statusFor = useCallback(
    (modelId: NrmWhisperModelId): WhisperModelStatusRow | undefined =>
      rows.find((r) => r.modelId === modelId),
    [rows],
  );

  return { rows, ready, refresh, downloadModel, statusFor };
}
