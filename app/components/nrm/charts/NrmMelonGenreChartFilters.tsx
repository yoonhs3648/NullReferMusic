import { useMemo } from 'react';

import { Platform, StyleSheet, View } from 'react-native';

import {
  NrmChartFilterSection,
  NrmChartSegmentedRow,
} from '@/components/nrm/charts/NrmChartSegmentedRow';
import {
  NrmPeriodChartDropdownTrigger,
  PERIOD_FILTER_CONTROL_HEIGHT,
} from '@/components/nrm/charts/NrmPeriodChartDropdown';
import { nrmTokens } from '@/constants/nrmTokens';
import {
  clampMelonMonth,
  clampMelonWeekOfMonth,
  defaultMelonWeekOfMonth,
  listMelonSelectableMonths,
  listMelonWeekOfMonthOptions,
  listPeriodChartSelectableYears,
  MELON_GENRE_OPTIONS,
  MELON_PERIOD_KIND_TABS,
  melonGenreByIndex,
  melonGenreIndex,
  type MelonGenreId,
  type MelonPeriodChartKind,
} from '@/lib/nrmMelonGenreChartCatalog';
import type { NrmPeriodChartPickerControl } from '@/components/nrm/charts/useNrmPeriodChartPicker';

type Props = {
  isDark: boolean;
  titleColor: string;
  bodyColor: string;
  kind: MelonPeriodChartKind;
  classCd: MelonGenreId;
  year: number;
  month: number;
  weekOfMonth: number;
  pickerControl: NrmPeriodChartPickerControl;
  onKindChange: (kind: MelonPeriodChartKind) => void;
  onGenreChange: (classCd: MelonGenreId) => void;
  onYearChange: (year: number) => void;
  onMonthChange: (month: number) => void;
  onWeekOfMonthChange: (week: number) => void;
  onReselect?: () => void;
};

export function NrmMelonGenreChartFilters({
  isDark,
  titleColor,
  bodyColor,
  kind,
  classCd,
  year,
  month,
  weekOfMonth,
  pickerControl,
  onKindChange,
  onGenreChange,
  onYearChange,
  onMonthChange,
  onWeekOfMonthChange,
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
    () => listMelonSelectableMonths(year, now),
    [year, now],
  );

  const weekOptions = useMemo(
    () => listMelonWeekOfMonthOptions(year, month, now),
    [year, month, now],
  );

  const genreOptions = useMemo(
    () =>
      MELON_GENRE_OPTIONS.map((g, index) => ({
        value: index,
        label: g.label,
      })),
    [],
  );

  const showMonth = kind === 'weekly' || kind === 'monthly';
  const showWeek = kind === 'weekly';

  const handleYearChange = (y: number) => {
    onYearChange(y);
    const m = clampMelonMonth(y, month, now);
    onMonthChange(m);
    onWeekOfMonthChange(defaultMelonWeekOfMonth(y, m, now));
  };

  const handleMonthChange = (m: number) => {
    onMonthChange(m);
    onWeekOfMonthChange(defaultMelonWeekOfMonth(year, m, now));
  };

  const applyKind = (next: MelonPeriodChartKind) => {
    closePicker();
    if (next === kind) {
      onReselect?.();
      return;
    }
    onKindChange(next);
    if (next !== 'yearly') {
      const m = clampMelonMonth(year, month, now);
      if (m !== month) onMonthChange(m);
    }
    if (next === 'weekly') {
      onWeekOfMonthChange(clampMelonWeekOfMonth(year, month, weekOfMonth, now));
    }
  };

  const applyGenreIndex = (index: number) => {
    closePicker();
    const next = melonGenreByIndex(index);
    if (next === classCd) {
      onReselect?.();
      return;
    }
    onGenreChange(next);
  };

  return (
    <View style={styles.root} collapsable={false} pointerEvents="auto">
      <NrmChartFilterSection>
        <NrmChartSegmentedRow
          options={MELON_PERIOD_KIND_TABS}
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
          {showMonth ? (
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
          ) : null}
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
        </View>
      </NrmChartFilterSection>

      <NrmChartFilterSection style={styles.genreSection}>
        <NrmPeriodChartDropdownTrigger
          id="genre"
          flex
          label="장르"
          value={melonGenreIndex(classCd)}
          options={genreOptions}
          onOpen={(draft) => openPicker(draft, applyGenreIndex)}
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
  genreSection: {
    marginBottom: 0,
  },
});
