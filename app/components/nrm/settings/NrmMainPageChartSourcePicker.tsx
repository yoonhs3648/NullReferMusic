import Ionicons from '@expo/vector-icons/Ionicons';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { NrmChartPlatformIcon } from '@/components/nrm/charts/NrmChartPlatformIcon';
import { nrmTokens } from '@/constants/nrmTokens';
import type { NrmMainPageChartSource } from '@/lib/nrmMainPageChartSettings';
import type { NrmMainPageChartSourceOption } from '@/lib/nrmMainPageChartSettings';

type Props = {
  options: readonly NrmMainPageChartSourceOption[];
  value: NrmMainPageChartSource;
  enabledMap: Record<NrmMainPageChartSource, boolean>;
  onChange: (id: NrmMainPageChartSource) => void;
  titleColor: string;
  bodyColor: string;
};

export function NrmMainPageChartSourcePicker({
  options,
  value,
  enabledMap,
  onChange,
  titleColor,
  bodyColor,
}: Props) {
  return (
    <View style={styles.col}>
      {options.map((opt) => {
        const enabled = enabledMap[opt.id] ?? false;
        const selected = value === opt.id;
        return (
          <Pressable
            key={opt.id}
            onPress={() => {
              if (enabled) onChange(opt.id);
            }}
            disabled={!enabled}
            style={({ pressed }) => [
              styles.card,
              {
                borderColor: selected ? nrmTokens.color.primary : 'rgba(128,128,128,0.28)',
                backgroundColor: selected
                  ? 'rgba(0,102,204,0.1)'
                  : Platform.OS === 'web'
                    ? 'rgba(255,255,255,0.02)'
                    : 'transparent',
                opacity: enabled ? 1 : 0.48,
              },
              pressed && enabled && styles.pressed,
            ]}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected, disabled: !enabled }}>
            <View style={styles.cardHeader}>
              <View
                style={[
                  styles.iconWrap,
                  {
                    backgroundColor: selected
                      ? 'rgba(0,102,204,0.16)'
                      : 'rgba(128,128,128,0.12)',
                  },
                ]}>
                <NrmChartPlatformIcon iconKey={opt.iconKey} size={20} />
              </View>
              <View style={styles.titleBlock}>
                <Text
                  style={[
                    styles.label,
                    {
                      color: selected
                        ? nrmTokens.color.primary
                        : enabled
                          ? titleColor
                          : bodyColor,
                    },
                  ]}>
                  {opt.label}
                </Text>
              </View>
              {selected ? (
                <Ionicons
                  name="checkmark-circle"
                  size={22}
                  color={enabled ? nrmTokens.color.primary : bodyColor}
                  style={styles.checkIcon}
                />
              ) : (
                <View style={styles.checkSpacer} />
              )}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  col: { gap: nrmTokens.space.sm },
  pressed: { opacity: 0.9 },
  card: {
    borderRadius: nrmTokens.radius.lg,
    borderWidth: Platform.OS === 'web' ? StyleSheet.hairlineWidth : 1,
    paddingVertical: 12,
    paddingHorizontal: nrmTokens.space.md,
    minHeight: 56,
    justifyContent: 'center',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.sm,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  label: {
    fontSize: nrmTokens.font.bodyStrong,
    fontWeight: '700',
    letterSpacing: -0.2,
    lineHeight: 22,
  },
  checkIcon: {
    flexShrink: 0,
  },
  checkSpacer: {
    width: 22,
    flexShrink: 0,
  },
});
