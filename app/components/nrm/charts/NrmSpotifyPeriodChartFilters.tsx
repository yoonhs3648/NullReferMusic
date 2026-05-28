import { useMemo } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  NrmPeriodChartDropdown,
  PERIOD_FILTER_CONTROL_HEIGHT,
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
  onKindChange: (kind: SpotifyPeriodChartKind) => void;
  onYearChange: (year: number) => void;
  onMonthChange: (month: number) => void;
  onDayChange: (day: number) => void;
  onWeekOfMonthChange: (week: number) => void;
  onRegionChange: (region: PeriodChartRegion) => void;
};

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
  onKindChange,
  onYearChange,
  onMonthChange,
  onDayChange,
  onWeekOfMonthChange,
  onRegionChange,
}: Props) {
  const isWeb = Platform.OS === 'web';
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

  const showMonth = true;
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

  const handleKindChange = (next: SpotifyPeriodChartKind) => {
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

      <View style={styles.dateRow}>
        <NrmPeriodChartDropdown
          flex={!isWeb}
          boxWidth={isWeb ? 148 : undefined}
          label="연"
          value={year}
          options={yearOptions}
          onChange={handleYearChange}
          isDark={isDark}
          titleColor={titleColor}
          bodyColor={bodyColor}
        />
        {showMonth ? (
          <NrmPeriodChartDropdown
            flex={!isWeb}
            boxWidth={isWeb ? 118 : undefined}
            label="월"
            value={month}
            options={
              monthOptions.length > 0 ? monthOptions : [{ value: 1, label: '1월' }]
            }
            onChange={handleMonthChange}
            isDark={isDark}
            titleColor={titleColor}
            bodyColor={bodyColor}
          />
        ) : null}
        {showWeek ? (
          <NrmPeriodChartDropdown
            flex={!isWeb}
            boxWidth={isWeb ? 118 : undefined}
            label="주"
            value={weekOfMonth}
            options={
              weekOptions.length > 0 ? weekOptions : [{ value: 1, label: '1주' }]
            }
            onChange={onWeekOfMonthChange}
            isDark={isDark}
            titleColor={titleColor}
            bodyColor={bodyColor}
          />
        ) : null}
        {showDay ? (
          <NrmPeriodChartDropdown
            flex={!isWeb}
            boxWidth={isWeb ? 118 : undefined}
            label="일"
            value={day}
            options={
              dayOptions.length > 0 ? dayOptions : [{ value: 1, label: '1일' }]
            }
            onChange={onDayChange}
            isDark={isDark}
            titleColor={titleColor}
            bodyColor={bodyColor}
          />
        ) : null}
      </View>

      <View style={styles.regionRow}>{renderRegionChip('kr', 'Korea')}{renderRegionChip('global', 'Global')}</View>
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
  /** 연·월·(일|주) — 줄바꿈 없이 한 줄 */
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    gap: nrmTokens.space.xxs,
    width: '100%',
  },
  regionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.xs,
    marginTop: nrmTokens.space.sm,
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
