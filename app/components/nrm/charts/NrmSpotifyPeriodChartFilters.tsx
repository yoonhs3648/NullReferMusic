import { useMemo } from 'react';

import { Platform, StyleSheet, View } from 'react-native';

import {
  NrmChartFilterSection,
  NrmChartSegmentedRow,
} from '@/components/nrm/charts/NrmChartSegmentedRow';
import {
  NrmPeriodChartDropdownTrigger,
  PERIOD_FILTER_CONTROL_HEIGHT,
  type PeriodChartPickerOpenRequest,
} from '@/components/nrm/charts/NrmPeriodChartDropdown';
import { nrmTokens } from '@/constants/nrmTokens';
import type { PeriodChartRegion } from '@/lib/nrmPeriodChartCatalog';
import {
  clampSpotifyPeriodChartDay,
  clampSpotifyPeriodChartMonth,
  clampSpotifyWeekOfMonth,
  createInitialSpotifyPeriodDate,
  defaultSpotifyWeekOfMonth,
  listPeriodChartSelectableYears,
  listSpotifyPeriodChartSelectableDays,
  listSpotifyPeriodChartSelectableMonths,
  listSpotifyWeekOfMonthOptions,
  SPOTIFY_PERIOD_KIND_TABS,
  type SpotifyPeriodChartKind,
} from '@/lib/nrmSpotifyPeriodChartCatalog';
import { DEFAULT_WEEKLY_SNAPSHOT_DAY } from '@/lib/nrmWeeklySnapshotSettings';
import type { NrmPeriodChartPickerControl } from '@/components/nrm/charts/useNrmPeriodChartPicker';

type Props = {
  isDark: boolean;
  titleColor: string;
  bodyColor: string;
  kind: SpotifyPeriodChartKind;
  year: number;
  month: number;
  day: number;
  weekOfMonth: number;
  snapshotDow: number;
  region: PeriodChartRegion;
  pickerControl: NrmPeriodChartPickerControl;
  onKindChange: (kind: SpotifyPeriodChartKind) => void;
  onYearChange: (year: number) => void;
  onMonthChange: (month: number) => void;
  onDayChange: (day: number) => void;
  onWeekOfMonthChange: (week: number) => void;
  onRegionChange: (region: PeriodChartRegion) => void;
  onReselect?: () => void;
};

const REGION_OPTIONS: { id: PeriodChartRegion; label: string }[] = [
  { id: 'kr', label: 'Korea' },
  { id: 'global', label: 'Global' },
];

export function createInitialSpotifyPeriodChartDate() {
  return createInitialSpotifyPeriodDate(DEFAULT_WEEKLY_SNAPSHOT_DAY);
}

export function NrmSpotifyPeriodChartFilters({
  isDark,
  titleColor,
  bodyColor,
  kind,
  year,
  month,
  day,
  weekOfMonth,
  snapshotDow,
  region,
  pickerControl,
  onKindChange,
  onYearChange,
  onMonthChange,
  onDayChange,
  onWeekOfMonthChange,
  onRegionChange,
  onReselect,
}: Props) {
  const { openPicker, closePicker } = pickerControl;
  const isWeb = Platform.OS === 'web';
  const now = useMemo(() => new Date(), []);

  const yearOptions = useMemo(
    () =>
      listPeriodChartSelectableYears(now).map((y) => ({
        value: y,
        label: `${y}년`,
      })),
    [now],
  );

  const monthOptions = useMemo(
    () => listSpotifyPeriodChartSelectableMonths(year, kind, snapshotDow, now),
    [year, kind, snapshotDow, now],
  );

  const weekOptions = useMemo(
    () => listSpotifyWeekOfMonthOptions(year, month, snapshotDow, now),
    [year, month, snapshotDow, now],
  );

  const dayOptions = useMemo(
    () => listSpotifyPeriodChartSelectableDays(year, month, now),
    [year, month, now],
  );

  const showWeek = kind === 'weekly';
  const showDay = kind === 'daily';

  const handleYearChange = (y: number) => {
    onYearChange(y);
    const m = clampSpotifyPeriodChartMonth(y, month, kind, snapshotDow, now);
    onMonthChange(m);
    onWeekOfMonthChange(defaultSpotifyWeekOfMonth(y, m, snapshotDow, now));
    onDayChange(clampSpotifyPeriodChartDay(y, m, day, now));
  };

  const handleMonthChange = (m: number) => {
    onMonthChange(m);
    onWeekOfMonthChange(defaultSpotifyWeekOfMonth(year, m, snapshotDow, now));
    onDayChange(clampSpotifyPeriodChartDay(year, m, day, now));
  };

  const applyKind = (next: SpotifyPeriodChartKind) => {
    closePicker();
    if (next === kind) {
      onReselect?.();
      return;
    }
    onKindChange(next);
    const m = clampSpotifyPeriodChartMonth(year, month, next, snapshotDow, now);
    if (m !== month) onMonthChange(m);
    if (next === 'weekly') {
      onWeekOfMonthChange(
        clampSpotifyWeekOfMonth(year, m, weekOfMonth, snapshotDow, now),
      );
    } else if (next === 'daily') {
      onDayChange(clampSpotifyPeriodChartDay(year, m, day, now));
    }
  };

  const applyRegion = (next: PeriodChartRegion) => {
    closePicker();
    if (next === region) {
      onReselect?.();
      return;
    }
    onRegionChange(next);
  };

  return (
    <View style={styles.root} collapsable={false} pointerEvents="auto">
      <NrmChartFilterSection>
        <NrmChartSegmentedRow
          options={SPOTIFY_PERIOD_KIND_TABS}
          value={kind}
          onChange={applyKind}
          isDark={isDark}
          titleColor={titleColor}
          bodyColor={bodyColor}
          accessibilityRole="tab"
        />
      </NrmChartFilterSection>

      <NrmChartFilterSection>
        <View style={styles.dateRow} collapsable={false}>
          <NrmPeriodChartDropdownTrigger
            id="year"
            flex={!isWeb}
            boxWidth={isWeb ? 148 : undefined}
            label="연"
            value={year}
            options={yearOptions}
            onOpen={(draft) => openPicker(draft, handleYearChange)}
            isDark={isDark}
            titleColor={titleColor}
            bodyColor={bodyColor}
          />
          <NrmPeriodChartDropdownTrigger
            id="month"
            flex={!isWeb}
            boxWidth={isWeb ? 118 : undefined}
            label="월"
            value={month}
            options={
              monthOptions.length > 0 ? monthOptions : [{ value: 1, label: '1월' }]
            }
            onOpen={(draft) => openPicker(draft, handleMonthChange)}
            isDark={isDark}
            titleColor={titleColor}
            bodyColor={bodyColor}
          />
          {showWeek ? (
            <NrmPeriodChartDropdownTrigger
              id="week"
              flex={!isWeb}
              boxWidth={isWeb ? 118 : undefined}
              label="주"
              value={weekOfMonth}
              options={
                weekOptions.length > 0 ? weekOptions : [{ value: 1, label: '1주' }]
              }
              onOpen={(draft) => openPicker(draft, onWeekOfMonthChange)}
              isDark={isDark}
              titleColor={titleColor}
              bodyColor={bodyColor}
            />
          ) : null}
          {showDay ? (
            <NrmPeriodChartDropdownTrigger
              id="day"
              flex={!isWeb}
              boxWidth={isWeb ? 118 : undefined}
              label="일"
              value={day}
              options={
                dayOptions.length > 0 ? dayOptions : [{ value: 1, label: '1일' }]
              }
              onOpen={(draft) => openPicker(draft, onDayChange)}
              isDark={isDark}
              titleColor={titleColor}
              bodyColor={bodyColor}
            />
          ) : null}
        </View>
      </NrmChartFilterSection>

      <NrmChartFilterSection style={styles.regionSection}>
        <NrmChartSegmentedRow
          options={REGION_OPTIONS}
          value={region}
          onChange={applyRegion}
          isDark={isDark}
          titleColor={titleColor}
          bodyColor={bodyColor}
        />
      </NrmChartFilterSection>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginBottom: nrmTokens.space.xs,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    gap: nrmTokens.space.xxs,
    width: '100%',
    overflow: 'hidden',
    minHeight: PERIOD_FILTER_CONTROL_HEIGHT,
  },
  regionSection: {
    marginBottom: 0,
  },
});
