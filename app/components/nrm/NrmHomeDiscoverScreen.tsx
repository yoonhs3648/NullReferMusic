import { StyleSheet, View } from 'react-native';

import { NrmDiscoverAiLabScreen } from '@/components/nrm/discover/NrmDiscoverAiLabScreen';

type Props = {
  isDark: boolean;
  /** 하단 탭에서 AI Lab이 보일 때 true — 숨김 keep-alive 중 스트리밍은 유지하고, 재진입 시 메시지 동기화 */
  isActive?: boolean;
};

/** 홈 하단 탭 AI Lab 셸 (구 Discover 큐레이션 목록은 제거됨). */
export function NrmHomeDiscoverScreen({ isDark, isActive = true }: Props) {
  return (
    <View style={styles.root}>
      <NrmDiscoverAiLabScreen isDark={isDark} isActive={isActive} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
