import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useState } from 'react';
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
  boxWidth?: number;
};

function WebSelect({
  label,
  value,
  options,
  onChange,
  isDark,
  boxWidth,
}: {
  label: string;
  value: number;
  options: PeriodChartDropdownOption[];
  onChange: (value: number) => void;
  isDark: boolean;
  boxWidth: number;
}) {
  const border = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const bg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
  const color = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
  const optionBg = isDark ? '#1c1c1e' : '#ffffff';
  const optionColor = isDark ? '#f5f5f7' : '#111111';

  return (
    <select
      className="nrm-period-select"
      value={String(value)}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-label={label}
      style={{
        width: boxWidth,
        height: PERIOD_FILTER_CONTROL_HEIGHT,
        paddingLeft: 10,
        paddingRight: 26,
        borderRadius: nrmTokens.radius.sm,
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: border,
        backgroundColor: bg,
        color,
        fontSize: 14,
        fontWeight: '500',
        cursor: 'pointer',
        appearance: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 8px center',
      }}>
      {options.map((o) => (
        <option
          key={o.value}
          value={o.value}
          style={{ backgroundColor: optionBg, color: optionColor }}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function NrmPeriodChartDropdown({
  label,
  value,
  options,
  onChange,
  isDark,
  titleColor,
  bodyColor,
  boxWidth = 104,
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  const border = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const bg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';

  const close = useCallback(() => setOpen(false), []);

  const pick = useCallback(
    (v: number) => {
      onChange(v);
      close();
    },
    [close, onChange],
  );

  const control =
    Platform.OS === 'web' ? (
      <WebSelect
        label={label}
        value={value}
        options={options}
        onChange={onChange}
        isDark={isDark}
        boxWidth={boxWidth}
      />
    ) : (
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.trigger,
          { width: boxWidth, borderColor: border, backgroundColor: bg },
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
    <View style={styles.inlineRow}>
      <Text style={[styles.inlineLabel, { color: bodyColor }]}>{label}</Text>
      {control}
      {Platform.OS !== 'web' ? (
        <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
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
              <Text style={[styles.sheetTitle, { color: titleColor }]}>{label}</Text>
              <ScrollView style={styles.sheetScroll} keyboardShouldPersistTaps="handled">
                {options.map((o) => {
                  const active = o.value === value;
                  return (
                    <Pressable
                      key={o.value}
                      onPress={() => pick(o.value)}
                      style={({ pressed }) => [
                        styles.optionRow,
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
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.xs,
    flexShrink: 0,
  },
  inlineLabel: {
    fontSize: nrmTokens.font.caption,
    fontWeight: '600',
    minWidth: 28,
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
  },
  optionRowActive: {
    backgroundColor: 'rgba(0, 102, 204, 0.1)',
  },
  optionRowPressed: { opacity: 0.85 },
  optionText: { fontSize: nrmTokens.font.body },
  optionTextActive: { fontWeight: '600' },
});
