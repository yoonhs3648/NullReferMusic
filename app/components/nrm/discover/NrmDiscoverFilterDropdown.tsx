import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';

export type NrmDiscoverDropdownOption<T extends string | number> = {
  value: T;
  label: string;
  disabled?: boolean;
};

type Props<T extends string | number> = {
  label: string;
  value: T;
  options: NrmDiscoverDropdownOption<T>[];
  onChange: (value: T) => void;
  isDark: boolean;
  titleColor: string;
  bodyColor: string;
};

export function NrmDiscoverFilterDropdown<T extends string | number>({
  label,
  value,
  options,
  onChange,
  isDark,
  titleColor,
  bodyColor,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const selectedLabel = useMemo(
    () => options.find((o) => o.value === value)?.label ?? String(value),
    [options, value],
  );

  const sheetBg = isDark ? nrmTokens.color.surfaceTile2 : nrmTokens.color.canvas;
  const border = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const chipBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';

  const onPick = useCallback(
    (next: T) => {
      setOpen(false);
      if (next !== value) onChange(next);
    },
    [onChange, value],
  );

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.trigger,
          { backgroundColor: chipBg, borderColor: border },
          pressed && styles.triggerPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${label} ${selectedLabel}`}>
        <Text style={[styles.triggerLabel, { color: bodyColor }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.triggerValue, { color: titleColor }]} numberOfLines={1}>
          {selectedLabel}
        </Text>
        <Ionicons name="chevron-down" size={16} color={bodyColor} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: sheetBg, borderColor: border }]}
            onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.sheetTitle, { color: titleColor }]}>{label}</Text>
            <ScrollView style={styles.sheetScroll} keyboardShouldPersistTaps="handled">
              {options.map((opt) => {
                const selected = opt.value === value;
                const disabled = opt.disabled === true;
                return (
                  <Pressable
                    key={String(opt.value)}
                    disabled={disabled}
                    onPress={() => {
                      if (disabled) return;
                      onPick(opt.value);
                    }}
                    style={({ pressed }) => [
                      styles.option,
                      selected && !disabled && { backgroundColor: chipBg },
                      pressed && !disabled && styles.optionPressed,
                      disabled && styles.optionDisabled,
                    ]}
                    accessibilityRole="menuitem"
                    accessibilityState={{ selected, disabled }}>
                    <Text
                      style={[
                        styles.optionText,
                        {
                          color: disabled
                            ? bodyColor
                            : selected
                              ? titleColor
                              : bodyColor,
                          fontWeight: selected && !disabled ? '600' : '500',
                        },
                        disabled && styles.optionTextDisabled,
                      ]}>
                      {opt.label}
                    </Text>
                    {selected && !disabled ? (
                      <Ionicons name="checkmark" size={18} color={nrmTokens.color.primary} />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.xs,
    paddingHorizontal: nrmTokens.space.sm,
    paddingVertical: nrmTokens.space.sm,
    borderRadius: nrmTokens.radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  triggerPressed: { opacity: 0.9 },
  triggerLabel: {
    fontSize: 11,
    flexShrink: 0,
  },
  triggerValue: {
    flex: 1,
    minWidth: 0,
    fontSize: nrmTokens.font.caption,
    textAlign: 'right',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    paddingHorizontal: nrmTokens.space.lg,
  },
  sheet: {
    maxHeight: '70%',
    borderRadius: nrmTokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: nrmTokens.space.md,
  },
  sheetTitle: {
    fontSize: nrmTokens.font.body,
    fontWeight: '700',
    paddingHorizontal: nrmTokens.space.md,
    marginBottom: nrmTokens.space.sm,
  },
  sheetScroll: {
    maxHeight: 360,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: nrmTokens.space.md,
    paddingVertical: nrmTokens.space.sm,
  },
  optionPressed: { opacity: 0.88 },
  optionDisabled: { opacity: 0.42 },
  optionText: {
    flex: 1,
    fontSize: nrmTokens.font.body,
  },
  optionTextDisabled: { opacity: 0.85 },
});
