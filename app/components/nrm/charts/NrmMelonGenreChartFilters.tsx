import { useMemo } from 'react';

import { Platform, StyleSheet, View } from 'react-native';

import { NrmChartSegmentedRow } from '@/components/nrm/charts/NrmChartSegmentedRow';
import {
  NrmPeriodChartDropdownTrigger,
  PERIOD_FILTER_CONTROL_HEIGHT,
} from '@/components/nrm/charts/NrmPeriodChartDropdown';
import { nrmTokens } from '@/constants/nrmTokens';
import {
  clampMelonGenreForKind,
  clampMelonMonth,
  clampMelonWeekOfMonth,
  defaultMelonWeekOfMonth,
  listMelonGenreOptionsForKind,
  listMelonSelectableMonths,
  listMelonSelectableYears,
  listMelonWeekOfMonthOptions,
  MELON_PERIOD_KIND_TABS,
  melonGenreByIndexForKind,
  melonGenreIndexForKind,
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

  const panelBg = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)';
  const panelBorder = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;

  const yearOptions = useMemo(
    () =>
      listMelonSelectableYears(kind, now).map((y) => ({
        value: y,
        label: `${y}년`,
      })),
    [kind, now],
  );

  const monthOptions = useMemo(
    () => listMelonSelectableMonths(year, now, kind),
    [year, now, kind],
  );

  const weekOptions = useMemo(
    () => listMelonWeekOfMonthOptions(year, month, now),
    [year, month, now],
  );

  const genreOptions = useMemo(
    () =>
      listMelonGenreOptionsForKind(kind).map((g, index) => ({
        value: index,
        label: g.label,
      })),
    [kind],
  );

  const genrePickerValue = useMemo(
    () => melonGenreIndexForKind(classCd, kind),
    [classCd, kind],
  );

  const showMonth = kind === 'weekly' || kind === 'monthly';
  const showWeek = kind === 'weekly';

  const handleYearChange = (y: number) => {
    onYearChange(y);
    const m = clampMelonMonth(y, month, now, kind);
    onMonthChange(m);
    if (kind === 'weekly') {
      onWeekOfMonthChange(defaultMelonWeekOfMonth(y, m, now));
    }
  };

  const handleMonthChange = (m: number) => {
    onMonthChange(m);
    if (kind === 'weekly') {
      onWeekOfMonthChange(defaultMelonWeekOfMonth(year, m, now));
    }
  };

  const applyKind = (next: MelonPeriodChartKind) => {
    closePicker();
    if (next === kind) {
      onReselect?.();
      return;
    }
    onKindChange(next);
    const nextGenre = clampMelonGenreForKind(classCd, next);
    if (nextGenre !== classCd) onGenreChange(nextGenre);
  };

  const applyGenreIndex = (index: number) => {
    closePicker();
    const next = melonGenreByIndexForKind(index, kind);
    if (next === classCd) {
      onReselect?.();
      return;
    }
    onGenreChange(next);
  };

  return (
    <View style={styles.root} collapsable={false} pointerEvents="auto">
      <NrmChartSegmentedRow
        options={MELON_PERIOD_KIND_TABS}
        value={kind}
        onChange={applyKind}
        isDark={isDark}
        titleColor={titleColor}
        bodyColor={bodyColor}
        accessibilityRole="tab"
      />

      <View
        style={[styles.panel, { backgroundColor: panelBg, borderColor: panelBorder }]}
        collapsable={false}>
        <View style={styles.dateRow} collapsable={false}>
          <NrmPeriodChartDropdownTrigger
            id="year"
            flex
            minTriggerWidth={isWeb ? 108 : 96}
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
              flex
              minTriggerWidth={isWeb ? 92 : 84}
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
              flex
              minTriggerWidth={isWeb ? 92 : 84}
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

        <View style={styles.genreDivider} />

        <View style={styles.genreRow} collapsable={false}>
          <NrmPeriodChartDropdownTrigger
            id="genre"
            fillWidth
            label="장르"
            value={genrePickerValue}
            options={genreOptions}
            onOpen={(draft) => openPicker(draft, applyGenreIndex)}
            isDark={isDark}
            titleColor={titleColor}
            bodyColor={bodyColor}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: nrmTokens.space.sm,
    marginBottom: nrmTokens.space.sm,
  },
  panel: {
    width: '100%',
    borderRadius: nrmTokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: nrmTokens.space.sm,
    paddingVertical: nrmTokens.space.sm,
    gap: nrmTokens.space.sm,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: nrmTokens.space.xs,
    width: '100%',
    minHeight: PERIOD_FILTER_CONTROL_HEIGHT,
  },
  genreDivider: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
    backgroundColor: 'rgba(128,128,128,0.28)',
  },
  genreRow: {
    width: '100%',
    minHeight: PERIOD_FILTER_CONTROL_HEIGHT,
    flexShrink: 0,
  },
});
