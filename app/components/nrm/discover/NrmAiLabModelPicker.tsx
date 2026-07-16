import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';
import {
  NRM_AI_LAB_LLM_MODEL_OPTIONS,
  type NrmAiLabLlmModelId,
} from '@/lib/nrmAiLabChatUi';
import { getNrmModalScrimColor } from '@/lib/nrmUiAppearanceColors';

type Props = {
  isDark: boolean;
  value: NrmAiLabLlmModelId;
  onChange: (id: NrmAiLabLlmModelId) => void;
  /** chip: 상단 칩 / menuRow: 좌측 메뉴 행 */
  presentation?: 'chip' | 'menuRow';
};

/** AI Lab — LLM 모델 드롭다운 (비활성 옵션 선택 불가). */
export function NrmAiLabModelPicker({
  isDark,
  value,
  onChange,
  presentation = 'chip',
}: Props) {
  const [open, setOpen] = useState(false);
  const titleColor = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
  const bodyColor = isDark ? nrmTokens.color.textMuted : nrmTokens.color.inkMuted80;
  const hairline = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const chipBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';
  const sheetBg = isDark ? nrmTokens.color.surfaceTile2 : nrmTokens.color.canvas;
  const rowHover = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';

  const selectedLabel = useMemo(
    () => NRM_AI_LAB_LLM_MODEL_OPTIONS.find((o) => o.id === value)?.label ?? value,
    [value],
  );

  const onPick = useCallback(
    (id: NrmAiLabLlmModelId, disabled: boolean) => {
      if (disabled) return;
      setOpen(false);
      if (id !== value) onChange(id);
    },
    [onChange, value],
  );

  const trigger =
    presentation === 'menuRow' ? (
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.menuRowTrigger,
          pressed && { backgroundColor: rowHover },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`모델 ${selectedLabel}`}>
        <View style={styles.menuRowLeft}>
          <View style={styles.iconSlot}>
            <Ionicons name="hardware-chip-outline" size={22} color={titleColor} />
          </View>
          <Text style={[styles.menuRowLabel, { color: titleColor }]} numberOfLines={1}>
            {selectedLabel}
          </Text>
        </View>
      </Pressable>
    ) : (
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.trigger,
          { backgroundColor: chipBg, borderColor: hairline },
          pressed && styles.triggerPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`모델 ${selectedLabel}`}>
        <Text style={[styles.triggerValue, { color: titleColor }]} numberOfLines={1}>
          {selectedLabel}
        </Text>
        <Ionicons name="chevron-down" size={16} color={bodyColor} />
      </Pressable>
    );

  return (
    <>
      {trigger}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={[styles.backdrop, { backgroundColor: getNrmModalScrimColor(isDark) }]}
          onPress={() => setOpen(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: sheetBg, borderColor: hairline }]}
            onPress={(e) => e.stopPropagation()}>
            {NRM_AI_LAB_LLM_MODEL_OPTIONS.map((opt) => {
              const selected = opt.id === value;
              return (
                <Pressable
                  key={opt.id}
                  disabled={opt.disabled}
                  onPress={() => onPick(opt.id, opt.disabled)}
                  style={({ pressed }) => [
                    styles.optionRow,
                    selected && {
                      backgroundColor: isDark ? 'rgba(0,102,204,0.22)' : 'rgba(0,102,204,0.10)',
                    },
                    pressed && !opt.disabled && { backgroundColor: rowHover },
                    opt.disabled && styles.optionDisabled,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected, disabled: opt.disabled }}
                  accessibilityLabel={opt.label}>
                  <Text
                    style={[
                      styles.optionLabel,
                      {
                        color: opt.disabled ? bodyColor : titleColor,
                        fontWeight: selected && !opt.disabled ? '600' : '400',
                      },
                    ]}>
                    {opt.label}
                  </Text>
                  {selected && !opt.disabled ? (
                    <Ionicons name="checkmark" size={20} color={nrmTokens.color.primary} />
                  ) : null}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 36,
    maxWidth: 120,
    paddingHorizontal: nrmTokens.space.sm,
    borderRadius: nrmTokens.radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  triggerPressed: { opacity: 0.88 },
  triggerValue: {
    flexShrink: 1,
    fontSize: nrmTokens.font.caption,
    fontWeight: '600',
  },
  menuRowTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: nrmTokens.space.md,
    paddingHorizontal: nrmTokens.space.xs,
    borderRadius: nrmTokens.radius.sm,
  },
  menuRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.sm,
    flex: 1,
    minWidth: 0,
  },
  iconSlot: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuRowLabel: {
    fontSize: nrmTokens.font.body,
    fontWeight: '500',
  },
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: nrmTokens.space.lg,
  },
  sheet: {
    borderRadius: nrmTokens.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    paddingVertical: nrmTokens.space.xs,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: nrmTokens.space.md,
    paddingHorizontal: nrmTokens.space.md,
  },
  optionDisabled: { opacity: 0.42 },
  optionLabel: {
    fontSize: nrmTokens.font.body,
  },
});
