import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';
import { useNrmUiAppearance } from '@/context/NrmUiAppearanceContext';
import { registerNrmOAuthUserIfNeeded } from '@/lib/nrmOAuthRegister';
import { getNrmRootBackgroundColor } from '@/lib/nrmUiAppearanceColors';

type Props = {
  onRegistered: () => void;
};

export function NrmOAuthRegisterGate({ onRegistered }: Props) {
  const { isDark } = useNrmUiAppearance();
  const [error, setError] = useState('');
  const bg = getNrmRootBackgroundColor(isDark);
  const ink = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
  const muted = isDark ? nrmTokens.color.bodyMuted : nrmTokens.color.inkMuted48;

  const run = async () => {
    setError('');
    try {
      await registerNrmOAuthUserIfNeeded();
      onRegistered();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || '사용자 등록에 실패했습니다.');
    }
  };

  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 최초 1회 등록
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      {error ? (
        <View style={styles.card}>
          <Text style={[styles.title, { color: ink }]}>계정 등록 실패</Text>
          <Text style={[styles.body, { color: muted }]}>{error}</Text>
          <Pressable onPress={() => void run()} style={styles.retry}>
            <Text style={styles.retryText}>다시 시도</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ActivityIndicator size="large" color="#ffffff" />
          <Text style={styles.loading}>계정 정보를 준비하는 중...</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: nrmTokens.space.xl,
  },
  loading: {
    marginTop: nrmTokens.space.lg,
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
    fontWeight: '500',
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#1c1c1e',
    borderRadius: nrmTokens.radius.lg,
    padding: nrmTokens.space.xl,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: nrmTokens.space.sm,
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: nrmTokens.space.lg,
  },
  retry: {
    height: 48,
    borderRadius: nrmTokens.radius.pill,
    backgroundColor: nrmTokens.color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
