import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';

export const PERIOD_FILTER_CONTROL_HEIGHT = 40;

export type PeriodChartDropdownOption = {
  value: number;
  label: string;
};

type Props = {
  label: string;
  value: number;
  options: PeriodChartDropdownOption[];
  onChange: (value: number) => void;
  isDark: boolean;
  titleColor: string;
  bodyColor: string;
  /** 연·월·주·일 탭/리전 전환 시 열린 모달을 닫기 위한 토큰 */
  dismissToken?: string;
  /** 고정 너비 (flex 미사용 시) */
  boxWidth?: number;
  /** true면 한 줄 dateRow 안에서 균등 분할 (모바일 전체 너비) */
  flex?: boolean;
};

export function NrmPeriodChartDropdown({
  label,
  value,
  options,
  onChange,
  isDark,
  titleColor,
  bodyColor,
  dismissToken,
  boxWidth = 104,
  flex = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    setOpen(false);
  }, [dismissToken]);

  useEffect(() => () => setOpen(false), []);

  const border = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const bg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
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

  const close = useCallback(() => setOpen(false), []);

  const pick = useCallback(
    (v: number) => {
      onChange(v);
      close();
    },
    [close, onChange],
  );

  const control = (
    <Pressable
      onPress={() => setOpen(true)}
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
  );

  return (
    <View style={[styles.inlineRow, flex && styles.inlineRowFlex]}>
      <Text style={[styles.inlineLabel, { color: bodyColor }]}>{label}</Text>
      {control}
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={close}
        onDismiss={close}>
        <Pressable style={styles.modalScrim} onPress={close}>
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
            <ScrollView
              style={[styles.sheetScroll, webScrollbarStyle as object]}
              keyboardShouldPersistTaps="handled">
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
        </Pressable>
      </Modal>
    </View>
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
  sheet: {
    maxHeight: '70%',
    borderRadius: nrmTokens.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: nrmTokens.space.md,
  },
  sheetTitle: {
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
    paddingHorizontal: nrmTokens.space.lg,
    marginBottom: nrmTokens.space.sm,
  },
  sheetScroll: { maxHeight: 360 },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
