import { StyleSheet, Pressable, Text, View } from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';
import {
  DEFAULT_ALIGN_LYRICS_LANG_DETECTION,
  loadAlignLyricsLangDetectionMode,
  saveAlignLyricsLangDetectionMode,
  type NrmAlignLyricsLangDetectionMode,
} from '@/lib/nrmAlignLyricsLangDetectionSettings';
import { useEffect, useState } from 'react';

type Props = {
  titleColor: string;
  bodyColor: string;
  rowHover: string;
};

const OPTIONS: { id: NrmAlignLyricsLangDetectionMode; label: string }[] = [
  { id: 'manual', label: '수동' },
  { id: 'auto', label: '자동' },
];

export function NrmAlignLyricsLangDetectionPanel({
  titleColor,
  bodyColor,
  rowHover,
}: Props) {
  const [mode, setMode] = useState<NrmAlignLyricsLangDetectionMode>(
    DEFAULT_ALIGN_LYRICS_LANG_DETECTION,
  );

  useEffect(() => {
    void loadAlignLyricsLangDetectionMode().then(setMode);
  }, []);

  const select = (next: NrmAlignLyricsLangDetectionMode) => {
    setMode(next);
    void saveAlignLyricsLangDetectionMode(next);
  };

  return (
    <View style={styles.root}>
      {OPTIONS.map((opt) => {
        const active = mode === opt.id;
        return (
          <Pressable
            key={opt.id}
            onPress={() => select(opt.id)}
            style={({ pressed }) => [
              styles.row,
              pressed && { backgroundColor: rowHover },
            ]}>
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { color: titleColor }]}>{opt.label}</Text>
            </View>
            <View
              style={[
                styles.radio,
                active && styles.radioActive,
                { borderColor: active ? nrmTokens.color.primary : bodyColor },
              ]}>
              {active ? <View style={styles.radioDot} /> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: nrmTokens.space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.md,
    paddingVertical: nrmTokens.space.sm,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowLabel: { fontSize: nrmTokens.font.body, fontWeight: '600' },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: {},
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: nrmTokens.color.primary,
  },
});
