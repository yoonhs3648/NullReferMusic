import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';
import {
  listTranslationProviders,
  loadTranslationProvider,
  NRM_TRANSLATION_PROVIDER_LABELS,
  saveTranslationProvider,
  type NrmTranslationProvider,
} from '@/lib/nrmTranslationSettings';

type Props = {
  titleColor: string;
  bodyColor: string;
  rowHover: string;
  active?: boolean;
};

export function NrmTranslationSettingsPanel({
  titleColor,
  bodyColor,
  rowHover,
  active = true,
}: Props) {
  const [provider, setProvider] = useState<NrmTranslationProvider>('googletranslate');

  const reload = useCallback(async () => {
    setProvider(await loadTranslationProvider());
  }, []);

  useEffect(() => {
    if (!active) return;
    void reload();
  }, [active, reload]);

  const selectProvider = useCallback(async (next: NrmTranslationProvider) => {
    await saveTranslationProvider(next);
    setProvider(next);
  }, []);

  return (
    <View>
      {listTranslationProviders().map((id) => {
        const selected = provider === id;
        return (
          <View key={id} style={styles.providerBlock}>
            <Pressable
              onPress={() => void selectProvider(id)}
              style={({ pressed }) => [
                styles.optionRow,
                selected && styles.optionRowSelected,
                pressed && { backgroundColor: rowHover },
              ]}>
              <View style={styles.optionLabelWrap}>
                <Text style={[styles.optionLabel, { color: titleColor }]}>
                  {NRM_TRANSLATION_PROVIDER_LABELS[id]}
                </Text>
              </View>
              <Ionicons
                name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                size={22}
                color={selected ? nrmTokens.color.primary : bodyColor}
              />
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  providerBlock: {
    marginBottom: nrmTokens.space.sm,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: nrmTokens.space.md,
    paddingHorizontal: nrmTokens.space.sm,
    borderRadius: nrmTokens.radius.md,
  },
  optionRowSelected: {
    backgroundColor: 'rgba(0, 102, 204, 0.08)',
  },
  optionLabelWrap: {
    flex: 1,
    paddingRight: nrmTokens.space.md,
    gap: 4,
  },
  optionLabel: {
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
});
