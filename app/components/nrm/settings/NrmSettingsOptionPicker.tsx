import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';

export type NrmSettingsOptionItem = {
  id: string;
  label: string;
  disabled?: boolean;
};

type Props = {
  options: readonly NrmSettingsOptionItem[];
  value: string;
  onChange: (id: string) => void;
  titleColor: string;
  bodyColor: string;
  rowHover: string;
};

/** 앱 설정 › 검색 설정과 동일한 단일 선택 행 UI */
export function NrmSettingsOptionPicker({
  options,
  value,
  onChange,
  titleColor,
  bodyColor,
  rowHover,
}: Props) {
  return (
    <View>
      {options.map((opt) => {
        const selected = value === opt.id;
        const disabled = opt.disabled === true;
        return (
          <Pressable
            key={opt.id}
            disabled={disabled}
            onPress={() => {
              if (disabled) return;
              onChange(opt.id);
            }}
            style={({ pressed }) => [
              styles.optionRow,
              selected && !disabled && styles.optionRowSelected,
              pressed && !disabled && { backgroundColor: rowHover },
              disabled && styles.optionRowDisabled,
            ]}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected, disabled }}>
            <Text
              style={[
                styles.optionLabel,
                {
                  color: disabled
                    ? bodyColor
                    : selected
                      ? titleColor
                      : titleColor,
                },
                disabled && styles.optionLabelDisabled,
              ]}>
              {opt.label}
            </Text>
            <Ionicons
              name={selected && !disabled ? 'checkmark-circle' : 'ellipse-outline'}
              size={22}
              color={
                disabled
                  ? 'rgba(128,128,128,0.28)'
                  : selected
                    ? nrmTokens.color.primary
                    : bodyColor
              }
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: nrmTokens.space.md,
    paddingHorizontal: nrmTokens.space.sm,
    borderRadius: nrmTokens.radius.sm,
    marginBottom: nrmTokens.space.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  optionRowSelected: {
    borderColor: 'rgba(0, 102, 204, 0.35)',
    backgroundColor: 'rgba(0, 102, 204, 0.06)',
  },
  optionRowDisabled: {
    opacity: 0.42,
  },
  optionLabel: {
    fontSize: nrmTokens.font.body,
    fontWeight: '500',
    flex: 1,
    paddingRight: nrmTokens.space.sm,
  },
  optionLabelDisabled: {
    opacity: 0.85,
  },
});
