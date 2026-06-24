import Ionicons from '@expo/vector-icons/Ionicons';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';

export type EncodeOptionItem = {
  id: string;
  label: string;
  description: string;
  hint?: string;
  icon?: keyof typeof Ionicons.glyphMap;
};

type Props = {
  options: readonly EncodeOptionItem[];
  value: string;
  onChange: (id: string) => void;
  titleColor: string;
  bodyColor: string;
};

export function NrmDownloadEncodeOptionPicker({
  options,
  value,
  onChange,
  titleColor,
  bodyColor,
}: Props) {
  return (
    <View style={styles.col}>
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <Pressable
            key={opt.id}
            onPress={() => onChange(opt.id)}
            style={({ pressed }) => [
              styles.card,
              {
                borderColor: active ? nrmTokens.color.primary : 'rgba(128,128,128,0.28)',
                backgroundColor: active
                  ? 'rgba(0,102,204,0.1)'
                  : Platform.OS === 'web'
                    ? 'rgba(255,255,255,0.02)'
                    : 'transparent',
              },
              pressed && styles.pressed,
            ]}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}>
            <View style={styles.cardHeader}>
              {opt.icon ? (
                <View
                  style={[
                    styles.iconWrap,
                    {
                      backgroundColor: active
                        ? 'rgba(0,102,204,0.16)'
                        : 'rgba(128,128,128,0.12)',
                    },
                  ]}>
                  <Ionicons
                    name={opt.icon}
                    size={18}
                    color={active ? nrmTokens.color.primary : bodyColor}
                  />
                </View>
              ) : null}
              <View style={styles.titleBlock}>
                <View style={styles.titleRow}>
                  <Text
                    style={[
                      styles.label,
                      { color: active ? nrmTokens.color.primary : titleColor },
                    ]}>
                    {opt.label}
                  </Text>
                  {opt.hint ? (
                    <View style={styles.hintBadge}>
                      <Text style={styles.hintBadgeText}>{opt.hint}</Text>
                    </View>
                  ) : null}
                </View>
                {opt.description ? (
                  <Text style={[styles.desc, { color: bodyColor }]}>{opt.description}</Text>
                ) : null}
              </View>
              {active ? (
                <Ionicons
                  name="checkmark-circle"
                  size={22}
                  color={nrmTokens.color.primary}
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
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: nrmTokens.space.sm,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  titleBlock: { flex: 1, gap: 4 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  label: {
    fontSize: nrmTokens.font.bodyStrong,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  hintBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: nrmTokens.radius.pill,
    backgroundColor: 'rgba(29, 130, 56, 0.14)',
  },
  hintBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: nrmTokens.color.success,
  },
  desc: {
    fontSize: nrmTokens.font.caption,
    lineHeight: 18,
    opacity: 0.9,
  },
  checkSpacer: { width: 22 },
});
