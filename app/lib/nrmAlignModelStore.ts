import { useCallback, useEffect, useState } from 'react';

import type { NrmAlignModelId } from '@/lib/nrmAlignModelCatalog';
import {
  NRM_ALIGN_WAV2VEC2_BASE_ID,
  isAlignModelInstallDisabled,
} from '@/lib/nrmAlignModelCatalog';
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
    // 이벤트 구독(subscribeAlignModelDownloadEvents)이 실시간 변경을 처리하므로
    // 폴백 폴링은 30초로 늘려 중복 요청을 최소화한다.
    const poll = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(poll);
  }, [active, refresh]);

  useEffect(() => {
    if (!active) return;
    return subscribeAlignModelDownloadEvents(() => {
      void refresh();
    });
  }, [active, refresh]);

  const downloadModel = useCallback(async (modelId: NrmAlignModelId) => {
    if (isAlignModelInstallDisabled(modelId)) return;

    const { confirmLargeDownloadIfNotOnWifi } = await import('@/lib/nrmLargeDownloadGuard');
    if (!(await confirmLargeDownloadIfNotOnWifi())) return;

    setRows((prev) =>
      prev.map((row) => {
        if (row.modelId !== modelId) return row;
        if (modelId === NRM_ALIGN_WAV2VEC2_BASE_ID) {
          return {
            ...row,
            downloading: true,
            bundlePackProgress: { step: 1 as const, koProgress: 0, enProgress: 0 },
          };
        }
        return { ...row, downloading: true, progress: 0 };
      }),
    );

    const ok = await startAlignModelDownload(modelId);
    if (!ok) {
      const { notifyUser } = await import('@/lib/nrmUserNotify');
      notifyUser('Forced Alignment 모델 설치를 시작하지 못했습니다.');
    }
    void refresh();
  }, [refresh]);

  const statusFor = useCallback(
    (modelId: NrmAlignModelId): AlignModelStatusRow | undefined =>
      rows.find((r) => r.modelId === modelId),
    [rows],
  );

  return { rows, ready, refresh, downloadModel, statusFor };
}
