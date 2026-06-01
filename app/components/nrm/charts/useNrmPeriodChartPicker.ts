import { useCallback, useState } from 'react';

import type {
  PeriodChartPickerOpenRequest,
  PeriodChartPickerState,
} from '@/components/nrm/charts/NrmPeriodChartDropdown';

export type NrmPeriodChartPickerControl = {
  picker: PeriodChartPickerState | null;
  openPicker: (
    draft: PeriodChartPickerOpenRequest,
    onChange: (value: number) => void,
  ) => void;
  closePicker: () => void;
};

/** 기간별 차트 화면당 Modal 1개 — Android 터치·Modal 잔존 방지 */
export function useNrmPeriodChartPicker(): NrmPeriodChartPickerControl {
  const [picker, setPicker] = useState<PeriodChartPickerState | null>(null);
  const closePicker = useCallback(() => setPicker(null), []);
  const openPicker = useCallback(
    (draft: PeriodChartPickerOpenRequest, onChange: (value: number) => void) => {
      setPicker({ ...draft, onChange });
    },
    [],
  );
  return { picker, openPicker, closePicker };
}
