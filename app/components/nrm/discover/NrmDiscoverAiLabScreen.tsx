import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect } from 'react';
import { BackHandler, StyleSheet, Text, View } from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';

type Props = {
  isDark: boolean;
  onBack: () => void;
};

/** Discover 자식 화면 — LLM·음성 추천 (준비 중) */
export function NrmDiscoverAiLabScreen({ isDark, onBack }: Props) {
  const titleColor = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
  const bodyColor = isDark ? nrmTokens.color.textMuted : nrmTokens.color.inkMuted80;

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
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.titleBlock}>
            <Ionicons
              name="sparkles"
              size={28}
              color={isDark ? nrmTokens.color.primaryOnDark : nrmTokens.color.primary}
            />
            <Text style={[styles.title, { color: titleColor }]}>AI 실험실</Text>
          </View>
        </View>
      </View>
      <View style={styles.body}>
        <Text style={[styles.message, { color: bodyColor }]}>LLM 도입중입니다.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingTop: nrmTokens.space.sm,
    paddingBottom: nrmTokens.space.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: nrmTokens.space.md,
    gap: nrmTokens.space.sm,
  },
  titleBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.sm,
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: nrmTokens.font.lead,
    fontWeight: '700',
  },
  message: {
    fontSize: nrmTokens.font.caption,
    lineHeight: 20,
    textAlign: 'center',
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
