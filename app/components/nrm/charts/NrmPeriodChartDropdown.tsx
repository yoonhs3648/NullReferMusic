import Ionicons from '@expo/vector-icons/Ionicons';

import { useCallback, useEffect, useMemo, useRef } from 'react';

import {

  Modal,

  Platform,

  Pressable,

  ScrollView,

  StyleSheet,

  Text,

  View,

  type ScrollView as ScrollViewType,

} from 'react-native';



import { nrmTokens } from '@/constants/nrmTokens';
import {
  PERIOD_CHART_DROPDOWN_OPTION_ROW_HEIGHT,
  PERIOD_CHART_DROPDOWN_SHEET_SCROLL_HEIGHT,
} from '@/lib/nrmPeriodChartDropdownLayout';



export const PERIOD_FILTER_CONTROL_HEIGHT = 40;

export {
  PERIOD_CHART_DROPDOWN_MIN_VISIBLE_OPTIONS,
  PERIOD_CHART_DROPDOWN_OPTION_ROW_HEIGHT,
  PERIOD_CHART_DROPDOWN_SHEET_SCROLL_HEIGHT,
} from '@/lib/nrmPeriodChartDropdownLayout';



export type PeriodChartDropdownOption = {

  value: number;

  label: string;

};



export type PeriodChartPickerOpenRequest = {
  id: string;
  label: string;
  value: number;
  options: PeriodChartDropdownOption[];
};

export type PeriodChartPickerState = PeriodChartPickerOpenRequest & {
  onChange: (value: number) => void;
};



type TriggerProps = {

  id: string;

  label: string;

  value: number;

  options: PeriodChartDropdownOption[];

  onOpen: (picker: PeriodChartPickerOpenRequest) => void;

  isDark: boolean;

  titleColor: string;

  bodyColor: string;

  /** true면 UI 숨김 */

  hidden?: boolean;

  boxWidth?: number;

  flex?: boolean;

};



/** 드롭다운 트리거만 — Modal은 부모에서 1개만 마운트 */

export function NrmPeriodChartDropdownTrigger({

  id,

  label,

  value,

  options,

  onOpen,

  isDark,

  titleColor,

  bodyColor,

  hidden = false,

  boxWidth = 104,

  flex = false,

}: TriggerProps) {

  const selected = options.find((o) => o.value === value);

  const border = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;

  const bg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';



  if (hidden) {

    return null;

  }



  return (

    <View

      style={[styles.inlineRow, flex && styles.inlineRowFlex]}

      collapsable={false}

      pointerEvents="auto">

      <Text style={[styles.inlineLabel, { color: bodyColor }]}>{label}</Text>

      <Pressable

        onPress={() => onOpen({ id, label, value, options })}

        style={({ pressed }) => [

          styles.trigger,

          flex ? styles.triggerFlex : { width: boxWidth },

          { borderColor: border, backgroundColor: bg },

          pressed && styles.triggerPressed,

        ]}

        accessibilityRole="button"

        accessibilityLabel={`${label} ${selected?.label ?? value}`}>

        <Text style={[styles.triggerText, { color: titleColor }]} numberOfLines={1}>

          {selected?.label ?? String(value)}

        </Text>

        <Ionicons name="chevron-down" size={16} color={bodyColor} />

      </Pressable>

    </View>

  );

}



type SharedModalProps = {

  picker: PeriodChartPickerState | null;

  onClose: () => void;

  isDark: boolean;

  titleColor: string;

  bodyColor: string;

};



/**

 * 필터 바당 Modal 1개만 사용 (Android invisible Modal 다중 마운트 → 터치 차단 방지).

 * visible prop만 토글하고 언마운트하지 않음.

 */

export function NrmPeriodChartSharedPickerModal({

  picker,

  onClose,

  isDark,

  titleColor,

  bodyColor,

}: SharedModalProps) {

  const scrollRef = useRef<ScrollViewType>(null);

  const border = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;

  const optionRowBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';

  const webScrollbarStyle = useMemo(

    () =>

      Platform.OS === 'web'

        ? ({

            colorScheme: isDark ? 'dark' : 'light',

            scrollbarWidth: 'thin',

            scrollbarColor: isDark

              ? 'rgba(170,170,170,0.55) rgba(255,255,255,0.08)'

              : 'rgba(120,120,120,0.6) rgba(0,0,0,0.08)',

          } as const)

        : null,

    [isDark],

  );



  const visible = picker !== null;

  const value = picker?.value ?? 0;

  const options = picker?.options ?? [];

  const label = picker?.label ?? '';



  useEffect(() => {

    if (!visible || options.length === 0) return;

    const idx = Math.max(0, options.findIndex((o) => o.value === value));

    const offset = Math.max(0, idx * PERIOD_CHART_DROPDOWN_OPTION_ROW_HEIGHT - PERIOD_CHART_DROPDOWN_OPTION_ROW_HEIGHT);

    requestAnimationFrame(() => {

      scrollRef.current?.scrollTo({ y: offset, animated: false });

    });

  }, [visible, value, options]);



  const pick = useCallback(

    (v: number) => {

      picker?.onChange(v);

      onClose();

    },

    [onClose, picker],

  );



  return (

    <Modal

      visible={visible}

      transparent

      animationType="fade"

      statusBarTranslucent

      onRequestClose={onClose}

      onDismiss={onClose}>

      <Pressable style={styles.modalScrim} onPress={onClose}>

        <Pressable

          style={styles.sheetPressable}

          onPress={() => {

            /* 시트 탭이 스크림 닫기로 전달되지 않도록 */

          }}>

          <View

            style={[

              styles.sheet,

              {

                backgroundColor: isDark

                  ? nrmTokens.color.surfaceTile1

                  : nrmTokens.color.canvas,

                borderColor: border,

              },

            ]}>

            <Text style={[styles.sheetTitle, { color: titleColor }]}>

              {label.length === 1 ? `${label} 선택` : label}

            </Text>

            <View style={styles.sheetScrollHost}>

              <ScrollView

                ref={scrollRef}

                style={[styles.sheetScroll, webScrollbarStyle as object]}

                contentContainerStyle={styles.sheetScrollContent}

                keyboardShouldPersistTaps="handled"

                nestedScrollEnabled

                showsVerticalScrollIndicator>

                {options.map((o) => {

                  const active = o.value === value;

                  return (

                    <Pressable

                      key={o.value}

                      onPress={() => pick(o.value)}

                      style={({ pressed }) => [

                        styles.optionRow,

                        { borderBottomColor: optionRowBorder },

                        active && styles.optionRowActive,

                        pressed && styles.optionRowPressed,

                      ]}>

                      <Text

                        style={[

                          styles.optionText,

                          { color: active ? nrmTokens.color.primary : titleColor },

                          active && styles.optionTextActive,

                        ]}>

                        {o.label}

                      </Text>

                      {active ? (

                        <Ionicons

                          name="checkmark"

                          size={20}

                          color={nrmTokens.color.primary}

                        />

                      ) : null}

                    </Pressable>

                  );

                })}

              </ScrollView>

            </View>

          </View>

        </Pressable>

      </Pressable>

    </Modal>

  );

}



/** @deprecated NrmPeriodChartDropdownTrigger + NrmPeriodChartSharedPickerModal 사용 */

export function NrmPeriodChartDropdown(props: {

  label: string;

  value: number;

  options: PeriodChartDropdownOption[];

  onChange: (value: number) => void;

  isDark: boolean;

  titleColor: string;

  bodyColor: string;

  dismissToken?: string;

  hidden?: boolean;

  boxWidth?: number;

  flex?: boolean;

}) {

  return (

    <NrmPeriodChartDropdownTrigger

      id={props.label}

      label={props.label}

      value={props.value}

      options={props.options}

      onOpen={() => {}}

      isDark={props.isDark}

      titleColor={props.titleColor}

      bodyColor={props.bodyColor}

      hidden={props.hidden}

      boxWidth={props.boxWidth}

      flex={props.flex}

    />

  );

}



const styles = StyleSheet.create({

  inlineRow: {

    flexDirection: 'row',

    alignItems: 'center',

    gap: nrmTokens.space.xxs,

    flexShrink: 0,

  },

  inlineRowFlex: {

    flex: 1,

    minWidth: 0,

    flexShrink: 1,

  },

  inlineLabel: {

    fontSize: nrmTokens.font.caption,

    fontWeight: '600',

    minWidth: 18,

    textAlign: 'center',

  },

  trigger: {

    flexDirection: 'row',

    alignItems: 'center',

    justifyContent: 'space-between',

    height: PERIOD_FILTER_CONTROL_HEIGHT,

    paddingHorizontal: nrmTokens.space.sm,

    borderRadius: nrmTokens.radius.sm,

    borderWidth: StyleSheet.hairlineWidth,

    gap: 4,

  },

  triggerFlex: {

    flex: 1,

    minWidth: 0,

  },

  triggerPressed: { opacity: 0.9 },

  triggerText: {

    flex: 1,

    fontSize: nrmTokens.font.caption,

    fontWeight: '500',

  },

  modalScrim: {

    flex: 1,

    backgroundColor: 'rgba(0,0,0,0.45)',

    justifyContent: 'center',

    paddingHorizontal: nrmTokens.space.lg,

  },

  sheetPressable: {

    width: '100%',

  },

  sheet: {

    borderRadius: nrmTokens.radius.lg,

    borderWidth: StyleSheet.hairlineWidth,

    paddingTop: nrmTokens.space.md,

    paddingBottom: nrmTokens.space.md,

    overflow: 'hidden',

  },

  sheetTitle: {

    fontSize: nrmTokens.font.body,

    fontWeight: '600',

    paddingHorizontal: nrmTokens.space.lg,

    marginBottom: nrmTokens.space.sm,

  },

  /** Android: ScrollView 단독 height가 content에 줄어드는 문제 방지 */

  sheetScrollHost: {

    height: PERIOD_CHART_DROPDOWN_SHEET_SCROLL_HEIGHT,

    minHeight: PERIOD_CHART_DROPDOWN_SHEET_SCROLL_HEIGHT,

    maxHeight: PERIOD_CHART_DROPDOWN_SHEET_SCROLL_HEIGHT,

  },

  sheetScroll: {

    flex: 1,

  },

  sheetScrollContent: {

    flexGrow: 1,

  },

  optionRow: {

    flexDirection: 'row',

    alignItems: 'center',

    justifyContent: 'space-between',

    minHeight: PERIOD_CHART_DROPDOWN_OPTION_ROW_HEIGHT,

    paddingVertical: nrmTokens.space.md,

    paddingHorizontal: nrmTokens.space.lg,

    borderBottomWidth: StyleSheet.hairlineWidth,

  },

  optionRowActive: {

    backgroundColor: 'rgba(0, 102, 204, 0.1)',

  },

  optionRowPressed: { opacity: 0.85 },

  optionText: { fontSize: nrmTokens.font.body },

  optionTextActive: { fontWeight: '600' },

});


