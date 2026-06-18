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

const OPTIONS: { id: NrmAlignLyricsLangDetectionMode; label: string; description: string }[] = [
  {
    id: 'manual',
    label: '수동',
    description:
      '멜론 가사 싱크 시 한국어·영어 wav2vec2 팩을 직접 선택합니다. (기본값)',
  },
  {
    id: 'auto',
    label: '자동',
    description: '멜론 plain 원문의 한글·영문 비율로 팩을 자동 선택합니다.',
  },
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
      <Text style={[styles.hint, { color: bodyColor }]}>
        wav2vec2-base 멜론 싱크 시 사용할 언어 팩 선택 방식입니다.
      </Text>
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
              <Text style={[styles.rowDesc, { color: bodyColor }]}>{opt.description}</Text>
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
  hint: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.88,
    marginBottom: nrmTokens.space.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.md,
    paddingVertical: nrmTokens.space.sm,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowLabel: { fontSize: nrmTokens.font.body, fontWeight: '600', marginBottom: 4 },
  rowDesc: { fontSize: 14, lineHeight: 20, opacity: 0.88 },
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
