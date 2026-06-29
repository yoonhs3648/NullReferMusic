import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useRef } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  NrmMelonSearchRouter,
  type MelonSearchNavHandle,
  type MelonYoutubeNavigateParams,
} from '@/components/nrm/search/NrmMelonSearchRouter';
import { nrmTokens } from '@/constants/nrmTokens';

type Props = {
  isDark: boolean;
  paddingHorizontal: number;
  query: string;
  onBack: () => void;
  onNavigateYoutube: (params: MelonYoutubeNavigateParams) => void;
};

/** Discover → Melon 트랙 검색 (목록 상태는 부모 Discover 화면에 유지) */
export function NrmDiscoverAlbumSearchLayer({
  isDark,
  paddingHorizontal,
  query,
  onBack,
  onNavigateYoutube,
}: Props) {
  const navRef = useRef<MelonSearchNavHandle>(null);
  const titleColor = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;

  const handleBack = useCallback(() => {
    if (navRef.current?.goBack()) return;
    onBack();
  }, [onBack]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack();
      return true;
    });
    return () => sub.remove();
  }, [handleBack]);

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <Pressable
          onPress={handleBack}
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel="Discover로 돌아가기">
          <Ionicons name="chevron-back" size={24} color={nrmTokens.color.primary} />
        </Pressable>
        <Text style={[styles.title, { color: titleColor }]} numberOfLines={1}>
          트랙 검색
        </Text>
        <View style={styles.backSpacer} />
      </View>
      <NrmMelonSearchRouter
        key={query}
        ref={navRef}
        initialKind="track"
        initialQuery={query}
        isDark={isDark}
        paddingHorizontal={paddingHorizontal}
        onBackToHome={handleBack}
        onNavigateYoutube={onNavigateYoutube}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: nrmTokens.space.xs,
    paddingBottom: nrmTokens.space.xs,
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
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: nrmTokens.font.body,
    fontWeight: '700',
  },
});
