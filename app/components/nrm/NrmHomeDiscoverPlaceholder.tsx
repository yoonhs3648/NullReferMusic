import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';

type Props = {
  isDark: boolean;
};

/** Discover 탭 UI 플레이스홀더 */
export function NrmHomeDiscoverPlaceholder({ isDark }: Props) {
  const titleColor = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
  const bodyColor = isDark ? nrmTokens.color.textMuted : nrmTokens.color.inkMuted48;

  return (
    <View style={styles.wrap}>
      <Ionicons name="compass-outline" size={48} color="#C9A227" style={styles.icon} />
      <Text style={[styles.title, { color: titleColor }]}>Discover</Text>
      <Text style={[styles.hint, { color: bodyColor }]}>음악 추천 기능은 준비 중입니다.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: nrmTokens.space.lg,
  },
  icon: {
    marginBottom: nrmTokens.space.md,
    opacity: 0.9,
  },
  title: {
    fontSize: nrmTokens.font.leadAiry,
    fontWeight: '700',
    marginBottom: nrmTokens.space.xs,
  },
  hint: {
    fontSize: nrmTokens.font.body,
    textAlign: 'center',
    lineHeight: 22,
  },
});
