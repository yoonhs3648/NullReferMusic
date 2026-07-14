import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';

type Props = {
  isDark: boolean;
  onOpenDiscover: () => void;
};

/** AI Lab 탭 기본 화면 — LLM·음성 추천 (준비 중) */
export function NrmDiscoverAiLabScreen({ isDark, onOpenDiscover }: Props) {
  const titleColor = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
  const bodyColor = isDark ? nrmTokens.color.textMuted : nrmTokens.color.inkMuted80;
  const discoverBtnBg = isDark ? 'rgba(0, 102, 204, 0.28)' : 'rgba(0, 102, 204, 0.12)';
  const discoverBtnBorder = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;

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
            <Text style={[styles.title, { color: titleColor }]}>AI Lab</Text>
          </View>
          <Pressable
            onPress={onOpenDiscover}
            style={({ pressed }) => [
              styles.discoverBtn,
              { backgroundColor: discoverBtnBg, borderColor: discoverBtnBorder },
              pressed && styles.discoverBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Discover">
            <Ionicons
              name="compass"
              size={22}
              color={isDark ? nrmTokens.color.primaryOnDark : nrmTokens.color.primary}
            />
          </Pressable>
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
  discoverBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discoverBtnPressed: { opacity: 0.88, transform: [{ scale: 0.96 }] },
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
