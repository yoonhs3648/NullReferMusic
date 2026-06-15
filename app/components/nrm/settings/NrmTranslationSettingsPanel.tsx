import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';
import { isLibreTranslateOfflineReady } from '@/lib/nrmLibreTranslateModelNative';
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
  const [provider, setProvider] = useState<NrmTranslationProvider>('libretranslate');
  const [libreInstalled, setLibreInstalled] = useState(false);

  const reload = useCallback(async () => {
    setProvider(await loadTranslationProvider());
    setLibreInstalled(await isLibreTranslateOfflineReady());
  }, []);

  useEffect(() => {
    if (!active) return;
    void reload();
    const timer = setInterval(() => {
      void reload();
    }, 5000);
    return () => clearInterval(timer);
  }, [active, reload]);

  const selectProvider = useCallback(
    async (next: NrmTranslationProvider) => {
      if (next === 'libretranslate' && !libreInstalled) return;
      await saveTranslationProvider(next);
      setProvider(next);
    },
    [libreInstalled],
  );

  return (
    <View>
      {listTranslationProviders().map((id) => {
        const selected = provider === id;
        const disabled = id === 'libretranslate' && !libreInstalled;
        const hint =
          id === 'libretranslate' && !libreInstalled
            ? '앱 설정 → 오프라인 번역기 설치에서 영어→한국어 팩을 설치해주세요.'
            : undefined;
        return (
          <View key={id} style={styles.providerBlock}>
            <Pressable
              onPress={() => void selectProvider(id)}
              disabled={disabled}
              style={({ pressed }) => [
                styles.optionRow,
                selected && styles.optionRowSelected,
                disabled && styles.optionRowDisabled,
                pressed && !disabled && { backgroundColor: rowHover },
              ]}>
              <View style={styles.optionLabelWrap}>
                <Text
                  style={[
                    styles.optionLabel,
                    { color: disabled ? bodyColor : titleColor, opacity: disabled ? 0.55 : 1 },
                  ]}>
                  {NRM_TRANSLATION_PROVIDER_LABELS[id]}
                </Text>
                {hint ? (
                  <Text style={[styles.optionHint, { color: bodyColor }]}>{hint}</Text>
                ) : null}
              </View>
              <Ionicons
                name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                size={22}
                color={
                  disabled
                    ? bodyColor
                    : selected
                      ? nrmTokens.color.primary
                      : bodyColor
                }
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
  optionRowDisabled: {
    opacity: 0.92,
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
  optionHint: {
    fontSize: nrmTokens.font.caption,
    lineHeight: 18,
  },
});
