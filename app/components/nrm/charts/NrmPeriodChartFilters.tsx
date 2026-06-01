import { useMemo } from 'react';

import { Platform, StyleSheet, Text, View } from 'react-native';

import { NrmChartFilterChip } from '@/components/nrm/charts/NrmChartFilterChip';
import { NrmChartFilterScrollRow } from '@/components/nrm/charts/NrmChartFilterScrollRow';

import {

  NrmPeriodChartDropdownTrigger,

  PERIOD_FILTER_CONTROL_HEIGHT,

  type PeriodChartPickerOpenRequest,

} from '@/components/nrm/charts/NrmPeriodChartDropdown';
import type { NrmPeriodChartPickerControl } from '@/components/nrm/charts/useNrmPeriodChartPicker';

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

  pickerControl: NrmPeriodChartPickerControl;

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

  pickerControl,

  onGranularityChange,

  onYearChange,

  onMonthChange,

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

      <NrmChartFilterChip

        key={id}

        selected={selected}

        onPress={() => {

          closePicker();

          if (id !== region) onRegionChange(id);

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

        {GRANULARITY_TABS.map((tab) => {

          const selected = tab.id === granularity;

          return (

            <NrmChartFilterChip

              key={tab.id}

              selected={selected}

              onPress={() => {

                closePicker();

                onGranularityChange(tab.id);

              }}

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

        {granularity === 'month' ? (

          <NrmPeriodChartDropdownTrigger

            id="month"

            flex={!isWeb}

            boxWidth={isWeb ? 118 : undefined}

            label="월"

            value={month}

            options={monthOptions}

            onOpen={(draft) => openPicker(draft, onMonthChange)}

            isDark={isDark}

            titleColor={titleColor}

            bodyColor={bodyColor}

          />

        ) : null}

      </View>



      <View style={styles.regionRow} collapsable={false}>

        {renderRegionChip('kr', 'Korea')}

        {renderRegionChip('global', 'Global')}

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


