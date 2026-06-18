import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { nrmTokens } from '@/constants/nrmTokens';
import { useNrmUiAppearance } from '@/context/NrmUiAppearanceContext';
import { getNrmRootBackgroundColor } from '@/lib/nrmUiAppearanceColors';
import {
  checkRequiredPermissions,
  requestAllRequiredPermissions,
  type NrmRequiredPermissionState,
} from '@/lib/nrmRequiredPermissions';

type PermissionRow = {
  key: keyof NrmRequiredPermissionState;
  title: string;
  body: string;
};

const PERMISSION_ROWS: PermissionRow[] = [
  {
    key: 'notifications',
    title: '알림',
    body: '다운로드 진행·완료 상태를 알림창으로 안내합니다.',
  },
  {
    key: 'media',
    title: '오디오 접근',
    body: '다운로드한 음악을 기기 미디어 라이브러리에 등록·관리합니다.',
  },
];

type Props = {
  onGranted: () => void;
};

export function NrmAppPermissionGate({ onGranted }: Props) {
  const { isDark } = useNrmUiAppearance();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<'checking' | 'prompt' | 'requesting'>('checking');
  const [snapshot, setSnapshot] = useState<NrmRequiredPermissionState | null>(null);

  const bg = getNrmRootBackgroundColor(isDark);
  const ink = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
  const muted = isDark ? nrmTokens.color.bodyMuted : nrmTokens.color.inkMuted48;
  const cardBg = isDark ? nrmTokens.color.surfaceTile2 : nrmTokens.color.cardLightBg;
  const border = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.cardLightBorder;

  const finishIfGranted = useCallback(
    (state: NrmRequiredPermissionState) => {
      if (state.notifications && state.media) {
        onGranted();
        return true;
      }
      return false;
    },
    [onGranted],
  );

  const requestingRef = useRef(false);

  const syncPermissionSnapshot = useCallback(async (): Promise<NrmRequiredPermissionState> => {
    const state = await checkRequiredPermissions();
    setSnapshot(state);
    return state;
  }, []);

  const showPromptIfNeeded = useCallback(
    async (opts?: { skipCheckingPhase?: boolean }) => {
      if (!opts?.skipCheckingPhase) {
        setPhase('checking');
      }
      const state = await syncPermissionSnapshot();
      if (finishIfGranted(state)) return;
      requestingRef.current = false;
      setPhase('prompt');
    },
    [finishIfGranted, syncPermissionSnapshot],
  );

  useEffect(() => {
    if (Platform.OS !== 'android') {
      onGranted();
      return;
    }
    void showPromptIfNeeded();
  }, [onGranted, showPromptIfNeeded]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') {
        if (requestingRef.current) {
          setPhase('prompt');
        }
        return;
      }
      void showPromptIfNeeded({ skipCheckingPhase: true });
    });
    return () => sub.remove();
  }, [showPromptIfNeeded]);

  const onRequestPress = useCallback(() => {
    if (Platform.OS !== 'android' || requestingRef.current) return;
    requestingRef.current = true;
    setPhase('requesting');
    void (async () => {
      let granted = false;
      try {
        const state = await requestAllRequiredPermissions();
        setSnapshot(state);
        granted = finishIfGranted(state);
      } finally {
        requestingRef.current = false;
        if (!granted) {
          setPhase('prompt');
        }
      }
      if (!granted) {
        BackHandler.exitApp();
      }
    })();
  }, [finishIfGranted]);

  if (phase === 'checking') {
    return (
      <View style={[styles.centered, { backgroundColor: bg, paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={nrmTokens.color.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: bg, paddingTop: insets.top + 24 }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: ink }]}>앱 사용에 필요한 권한</Text>
        <Text style={[styles.lead, { color: muted }]}>
          아래 권한을 모두 허용해야 앱을 사용할 수 있습니다. 거부 시 앱이 종료됩니다.
        </Text>

        <View style={styles.cardList}>
          {PERMISSION_ROWS.map((row) => {
            const granted = snapshot?.[row.key] ?? false;
            return (
              <View
                key={row.key}
                style={[styles.card, { backgroundColor: cardBg, borderColor: border }]}>
                <View style={styles.cardHeader}>
                  <Text style={[styles.cardTitle, { color: ink }]}>{row.title}</Text>
                  <View
                    style={[
                      styles.badge,
                      {
                        backgroundColor: granted
                          ? 'rgba(29, 130, 56, 0.14)'
                          : isDark
                            ? 'rgba(255,255,255,0.08)'
                            : nrmTokens.color.dividerSoft,
                      },
                    ]}>
                    <Text
                      style={[
                        styles.badgeText,
                        { color: granted ? nrmTokens.color.success : muted },
                      ]}>
                      {granted ? '허용됨' : '필요'}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.cardBody, { color: muted }]}>{row.body}</Text>
              </View>
            );
          })}
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={phase === 'requesting'}
          onPress={onRequestPress}
          style={({ pressed }) => [
            styles.primaryBtn,
            {
              backgroundColor: nrmTokens.color.primary,
              opacity: phase === 'requesting' ? 0.7 : pressed ? 0.92 : 1,
              transform: [{ scale: pressed ? 0.95 : 1 }],
            },
          ]}>
          {phase === 'requesting' ? (
            <ActivityIndicator color={nrmTokens.color.onPrimary} />
          ) : (
            <Text style={styles.primaryBtnText}>권한 허용하고 시작</Text>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    paddingHorizontal: nrmTokens.space.lg,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    lineHeight: 34,
    marginBottom: nrmTokens.space.sm,
  },
  lead: {
    fontSize: 17,
    lineHeight: 24,
    marginBottom: nrmTokens.space.xl,
  },
  cardList: {
    gap: nrmTokens.space.sm,
    marginBottom: nrmTokens.space.xl,
  },
  card: {
    borderRadius: nrmTokens.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: nrmTokens.space.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: nrmTokens.space.xs,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  badge: {
    borderRadius: nrmTokens.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  cardBody: {
    fontSize: 15,
    lineHeight: 22,
  },
  primaryBtn: {
    borderRadius: nrmTokens.radius.pill,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: nrmTokens.space.lg,
  },
  primaryBtnText: {
    color: nrmTokens.color.onPrimary,
    fontSize: 17,
    fontWeight: '600',
  },
});
