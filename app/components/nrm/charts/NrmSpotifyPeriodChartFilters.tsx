import { useMemo } from 'react';

import { Platform, StyleSheet, Text, View } from 'react-native';



import { NrmChartFilterChip } from '@/components/nrm/charts/NrmChartFilterChip';
import { NrmChartFilterScrollRow } from '@/components/nrm/charts/NrmChartFilterScrollRow';

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
import { logNrmDev } from '@/lib/nrmDevLog';
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

  pickerControl,

  onKindChange,

  onYearChange,

  onMonthChange,

  onDayChange,

  onWeekOfMonthChange,

  onRegionChange,

}: Props) {

  const { openPicker, closePicker } = pickerControl;



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

    closePicker();

    if (next === kind) return;

    logNrmDev('chart.spotify.filter', { event: 'kind', from: kind, to: next });

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

      <NrmChartFilterChip

        key={id}

        selected={selected}

        onPress={() => {

          closePicker();

          if (id !== region) {

            logNrmDev('chart.spotify.filter', { event: 'region', from: region, to: id });

            onRegionChange(id);

          }

        }}

        style={[

          styles.regionChip,

          {

            backgroundColor: selected ? tabActiveBg : regionBg,

            borderColor: selected ? nrmTokens.color.primary : tabBorder,

          },

        ]}

        accessibilityRole="button">

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

      </NrmChartFilterChip>

    );

  };



  return (

    <View style={styles.root} collapsable={false} pointerEvents="auto">

      <NrmChartFilterScrollRow>

        {SPOTIFY_PERIOD_KIND_TABS.map((tab) => {

          const selected = tab.id === kind;

          return (

            <NrmChartFilterChip

              key={tab.id}

              selected={selected}

              onPress={() => handleKindChange(tab.id)}

              style={[

                styles.tabChip,

                {

                  backgroundColor: selected ? tabActiveBg : tabBg,

                  borderColor: selected ? nrmTokens.color.primary : tabBorder,

                },

              ]}

              accessibilityRole="tab">

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

            </NrmChartFilterChip>

          );

        })}

      </NrmChartFilterScrollRow>



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

        <NrmPeriodChartDropdownTrigger

          id="week"

          flex={!isWeb}

          boxWidth={isWeb ? 118 : undefined}

          label="주"

          value={weekOfMonth}

          hidden={!showWeek}

          options={

            weekOptions.length > 0 ? weekOptions : [{ value: 1, label: '1주' }]

          }

          onOpen={(draft) => openPicker(draft, onWeekOfMonthChange)}

          isDark={isDark}

          titleColor={titleColor}

          bodyColor={bodyColor}

        />

        <NrmPeriodChartDropdownTrigger

          id="day"

          flex={!isWeb}

          boxWidth={isWeb ? 118 : undefined}

          label="일"

          value={day}

          hidden={!showDay}

          options={

            dayOptions.length > 0 ? dayOptions : [{ value: 1, label: '1일' }]

          }

          onOpen={(draft) => openPicker(draft, onDayChange)}

          isDark={isDark}

          titleColor={titleColor}

          bodyColor={bodyColor}

        />

      </View>



      <View style={styles.regionRow} collapsable={false}>

        {renderRegionChip('kr', 'Korea')}

        {renderRegionChip('global', 'Global')}

      </View>

    </View>

  );

}



const styles = StyleSheet.create({

  root: { marginBottom: nrmTokens.space.sm },

  tabChip: {

    paddingHorizontal: nrmTokens.space.md,

    paddingVertical: nrmTokens.space.sm,

    borderRadius: nrmTokens.radius.pill,

    borderWidth: StyleSheet.hairlineWidth,

  },

  tabChipPressed: { opacity: 0.9 },

  tabLabel: { fontSize: nrmTokens.font.caption },

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


