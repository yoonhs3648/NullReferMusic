import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';

type Props = {
  isDark: boolean;
  onBack: () => void;
};

/** Discover 자식 화면 — LLM·음성 추천 (준비 중) */
export function NrmDiscoverAiLabScreen({ isDark, onBack }: Props) {
  const titleColor = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;

  const handleBack = useCallback(() => {
    onBack();
    return true;
  }, [onBack]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', handleBack);
    return () => sub.remove();
  }, [handleBack]);

  return (
    <View style={styles.root}>
      <View style={styles.titleRow}>
        <Pressable
          onPress={onBack}
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel="뒤로">
          <Ionicons name="chevron-back" size={24} color={nrmTokens.color.primary} />
        </Pressable>
        <View style={styles.titleBlock}>
          <Ionicons
            name="sparkles"
            size={28}
            color={isDark ? nrmTokens.color.primaryOnDark : nrmTokens.color.primary}
          />
          <Text style={[styles.title, { color: titleColor }]}>AI 실험실</Text>
        </View>
        <View style={styles.backSpacer} />
      </View>
      <View style={styles.center}>
        <Text style={[styles.message, { color: titleColor }]}>LLM 도입중입니다.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: nrmTokens.space.xs,
    paddingBottom: nrmTokens.space.sm,
    gap: nrmTokens.space.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  backBtnPressed: { opacity: 0.85 },
  backSpacer: { width: 40 },
  titleBlock: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: nrmTokens.space.sm,
    minWidth: 0,
  },
  title: {
    fontSize: nrmTokens.font.lead,
    fontWeight: '700',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: nrmTokens.space.lg,
  },
  message: {
    fontSize: nrmTokens.font.lead,
    fontWeight: '600',
    textAlign: 'center',
  },
});
