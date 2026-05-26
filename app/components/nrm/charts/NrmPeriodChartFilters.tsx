import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  NrmPeriodChartDropdown,
  PERIOD_FILTER_CONTROL_HEIGHT,
} from '@/components/nrm/charts/NrmPeriodChartDropdown';
import { nrmTokens } from '@/constants/nrmTokens';
import {
  clampPeriodChartMonth,
  getPeriodChartCurrentDate,
  listPeriodChartSelectableMonths,
  listPeriodChartSelectableYears,
  type PeriodChartGranularity,
  type PeriodChartRegion,
} from '@/lib/nrmPeriodChartCatalog';

const GRANULARITY_TABS: { id: PeriodChartGranularity; label: string }[] = [
  { id: 'year', label: '연도' },
  { id: 'month', label: '연·월' },
];

type Props = {
  isDark: boolean;
  titleColor: string;
  bodyColor: string;
  granularity: PeriodChartGranularity;
  year: number;
  month: number;
  region: PeriodChartRegion;
  onGranularityChange: (g: PeriodChartGranularity) => void;
  onYearChange: (year: number) => void;
  onMonthChange: (month: number) => void;
  onRegionChange: (region: PeriodChartRegion) => void;
};

export function NrmPeriodChartFilters({
  isDark,
  titleColor,
  bodyColor,
  granularity,
  year,
  month,
  region,
  onGranularityChange,
  onYearChange,
  onMonthChange,
  onRegionChange,
}: Props) {
  const tabBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';
  const tabActiveBg = isDark
    ? 'rgba(0, 102, 204, 0.28)'
    : 'rgba(0, 102, 204, 0.12)';
  const tabBorder = isDark
    ? nrmTokens.color.borderOnDark
    : nrmTokens.color.hairline;
  const regionBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';

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
    () => listPeriodChartSelectableMonths(year, now),
    [year, now],
  );

  const handleYearChange = (y: number) => {
    onYearChange(y);
    if (granularity === 'month') {
      onMonthChange(clampPeriodChartMonth(y, month, now));
    }
  };

  const renderRegionChip = (id: PeriodChartRegion, label: string) => {
    const selected = region === id;
    return (
      <Pressable
        key={id}
        onPress={() => onRegionChange(id)}
        style={({ pressed }) => [
          styles.regionChip,
          {
            backgroundColor: selected ? tabActiveBg : regionBg,
            borderColor: selected ? nrmTokens.color.primary : tabBorder,
          },
          pressed && styles.regionChipPressed,
        ]}
        accessibilityRole="button"
        accessibilityState={{ selected }}>
        <Text
          style={[
            styles.regionLabel,
            {
              color: selected ? titleColor : bodyColor,
              fontWeight: selected ? '600' : '500',
            },
          ]}>
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.root}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabRow}
        style={styles.tabScroll}>
        {GRANULARITY_TABS.map((tab) => {
          const selected = tab.id === granularity;
          return (
            <Pressable
              key={tab.id}
              onPress={() => onGranularityChange(tab.id)}
              style={({ pressed }) => [
                styles.tabChip,
                {
                  backgroundColor: selected ? tabActiveBg : tabBg,
                  borderColor: selected ? nrmTokens.color.primary : tabBorder,
                },
                pressed && styles.tabChipPressed,
              ]}
              accessibilityRole="tab"
              accessibilityState={{ selected }}>
              <Text
                style={[
                  styles.tabLabel,
                  {
                    color: selected ? titleColor : bodyColor,
                    fontWeight: selected ? '600' : '500',
                  },
                ]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.filterRow}>
        <NrmPeriodChartDropdown
          label="연도"
          value={year}
          options={yearOptions}
          onChange={handleYearChange}
          isDark={isDark}
          titleColor={titleColor}
          bodyColor={bodyColor}
          boxWidth={108}
        />
        {granularity === 'month' ? (
          <NrmPeriodChartDropdown
            label="월"
            value={month}
            options={monthOptions}
            onChange={onMonthChange}
            isDark={isDark}
            titleColor={titleColor}
            bodyColor={bodyColor}
            boxWidth={84}
          />
        ) : null}
        <View style={styles.regionGroup}>
          {renderRegionChip('kr', 'Korea')}
          {renderRegionChip('global', 'Global')}
        </View>
      </View>
    </View>
  );
}

/** 초기 연·월 상태 (현재 날짜) */
export function createInitialPeriodChartDate() {
  return getPeriodChartCurrentDate();
}

const styles = StyleSheet.create({
  root: { marginBottom: nrmTokens.space.sm },
  tabScroll: { marginBottom: nrmTokens.space.sm, flexGrow: 0 },
  tabRow: {
    gap: nrmTokens.space.xs,
    paddingBottom: nrmTokens.space.xs,
  },
  tabChip: {
    paddingHorizontal: nrmTokens.space.md,
    paddingVertical: nrmTokens.space.sm,
    borderRadius: nrmTokens.radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tabChipPressed: { opacity: 0.9 },
  tabLabel: { fontSize: nrmTokens.font.caption },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: nrmTokens.space.sm,
  },
  regionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.xs,
    flexShrink: 0,
  },
  regionChip: {
    paddingHorizontal: nrmTokens.space.md,
    height: PERIOD_FILTER_CONTROL_HEIGHT,
    borderRadius: nrmTokens.radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
  regionChipPressed: { opacity: 0.9 },
  regionLabel: { fontSize: nrmTokens.font.caption },
});
