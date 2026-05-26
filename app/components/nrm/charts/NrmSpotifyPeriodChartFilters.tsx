import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  NrmPeriodChartDropdown,
  PERIOD_FILTER_CONTROL_HEIGHT,
} from '@/components/nrm/charts/NrmPeriodChartDropdown';
import { nrmTokens } from '@/constants/nrmTokens';
import type { PeriodChartRegion } from '@/lib/nrmPeriodChartCatalog';
import {
  clampPeriodChartMonth,
  clampSpotifyPeriodChartDay,
  clampSpotifyWeekOfMonth,
  createInitialSpotifyPeriodDate,
  defaultSpotifyWeekOfMonth,
  listPeriodChartSelectableMonths,
  listPeriodChartSelectableYears,
  listSpotifyPeriodChartSelectableDays,
  listSpotifyWeekOfMonthOptions,
  SPOTIFY_PERIOD_KIND_TABS,
  type SpotifyPeriodChartKind,
} from '@/lib/nrmSpotifyPeriodChartCatalog';

type Props = {
  isDark: boolean;
  titleColor: string;
  bodyColor: string;
  kind: SpotifyPeriodChartKind;
  year: number;
  month: number;
  day: number;
  weekOfMonth: number;
  region: PeriodChartRegion;
  onKindChange: (kind: SpotifyPeriodChartKind) => void;
  onYearChange: (year: number) => void;
  onMonthChange: (month: number) => void;
  onDayChange: (day: number) => void;
  onWeekOfMonthChange: (week: number) => void;
  onRegionChange: (region: PeriodChartRegion) => void;
};

export function createInitialSpotifyPeriodChartDate() {
  return createInitialSpotifyPeriodDate();
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
  region,
  onKindChange,
  onYearChange,
  onMonthChange,
  onDayChange,
  onWeekOfMonthChange,
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
  const weekOptions = useMemo(
    () => listSpotifyWeekOfMonthOptions(year, month, now),
    [year, month, now],
  );
  const dayOptions = useMemo(
    () => listSpotifyPeriodChartSelectableDays(year, month, now),
    [year, month, now],
  );

  const showMonth = kind !== 'yearly';
  const showWeek = kind === 'weekly';
  const showDay = kind === 'daily';

  const handleYearChange = (y: number) => {
    onYearChange(y);
    const m = clampPeriodChartMonth(y, month, now);
    onMonthChange(m);
    onWeekOfMonthChange(defaultSpotifyWeekOfMonth(y, m, now));
    onDayChange(clampSpotifyPeriodChartDay(y, m, day, now));
  };

  const handleMonthChange = (m: number) => {
    onMonthChange(m);
    onWeekOfMonthChange(defaultSpotifyWeekOfMonth(year, m, now));
    onDayChange(clampSpotifyPeriodChartDay(year, m, day, now));
  };

  const handleKindChange = (next: SpotifyPeriodChartKind) => {
    onKindChange(next);
    if (next === 'weekly') {
      onWeekOfMonthChange(clampSpotifyWeekOfMonth(year, month, weekOfMonth, now));
    } else if (next === 'daily') {
      onDayChange(clampSpotifyPeriodChartDay(year, month, day, now));
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
        {SPOTIFY_PERIOD_KIND_TABS.map((tab) => {
          const selected = tab.id === kind;
          return (
            <Pressable
              key={tab.id}
              onPress={() => handleKindChange(tab.id)}
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

      {kind === 'yearly' ? (
        <Text style={[styles.hint, { color: bodyColor }]}>
          연간 = 12개월 월간(주간 합산) 스트림 합계. 첫 로딩에 시간이 걸릴 수 있습니다.
        </Text>
      ) : null}
      {kind === 'monthly' ? (
        <Text style={[styles.hint, { color: bodyColor }]}>
          월간 = 해당 월의 주간 차트(금요일 기준)를 합산합니다.
        </Text>
      ) : null}
      {kind === 'weekly' ? (
        <Text style={[styles.hint, { color: bodyColor }]}>
          주간 = 선택한 주의 금요일 차트 1회만 조회합니다.
        </Text>
      ) : null}

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
        {showMonth ? (
          <NrmPeriodChartDropdown
            label="월"
            value={month}
            options={monthOptions}
            onChange={handleMonthChange}
            isDark={isDark}
            titleColor={titleColor}
            bodyColor={bodyColor}
            boxWidth={84}
          />
        ) : null}
        {showWeek ? (
          <NrmPeriodChartDropdown
            label="주"
            value={weekOfMonth}
            options={weekOptions.length > 0 ? weekOptions : [{ value: 1, label: '1주' }]}
            onChange={onWeekOfMonthChange}
            isDark={isDark}
            titleColor={titleColor}
            bodyColor={bodyColor}
            boxWidth={72}
          />
        ) : null}
        {showDay ? (
          <NrmPeriodChartDropdown
            label="일"
            value={day}
            options={dayOptions}
            onChange={onDayChange}
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
  hint: {
    fontSize: nrmTokens.font.caption,
    lineHeight: 18,
    marginBottom: nrmTokens.space.sm,
  },
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
