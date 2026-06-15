import { useCallback, useEffect, useRef, useState } from 'react';

import type { NrmLibreTranslatePackageId } from '@/lib/nrmLibreTranslateCatalog';
import {
  fetchLibreTranslatePackageStatuses,
  startLibreTranslatePackageDownload,
  type LibreTranslatePackageStatusRow,
} from '@/lib/nrmLibreTranslateModelNative';

export function useLibreTranslatePackageStatuses(active: boolean) {
  const [rows, setRows] = useState<LibreTranslatePackageStatusRow[]>([]);
  const [ready, setReady] = useState(!active);
  const activeRef = useRef(active);
  activeRef.current = active;

  const refresh = useCallback(async () => {
    if (!activeRef.current) return;
    const next = await fetchLibreTranslatePackageStatuses();
    if (!activeRef.current) return;
    setRows(next);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!active) {
      setReady(true);
      return;
    }
    setReady(false);
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 5000);
    return () => clearInterval(timer);
  }, [active, refresh]);

  const statusFor = useCallback(
    (id: NrmLibreTranslatePackageId) => rows.find((r) => r.packageId === id),
    [rows],
  );

  const downloadPackage = useCallback(async (id: NrmLibreTranslatePackageId) => {
    await startLibreTranslatePackageDownload(id);
    await refresh();
  }, [refresh]);

  return { rows, ready, refresh, downloadPackage, statusFor };
}
