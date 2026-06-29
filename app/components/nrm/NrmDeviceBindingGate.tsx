import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';
import { logNrmRunError } from '@/lib/nrmDevLog';
import { runDeviceBindingCheck, type DeviceBindingResult } from '@/lib/nrmDeviceBinding';

type Phase =
  | 'checking'
  | 'mismatch'
  | 'unregistered'
  | { kind: 'error'; message: string };

type Props = {
  onVerified: () => void;
};

/**
 * 커스텀 APK 디바이스 바인딩 게이트.
 * - SerialNo 없음(일반 APK) → 즉시 onVerified() 통과
 * - 최초 설치 또는 일치 → onVerified()
 * - 불일치 → 경고 팝업 → 앱 종료
 * - 오류(네트워크 등) → 오류 화면 + 다시 시도
 */
export function NrmDeviceBindingGate({ onVerified }: Props) {
  const [phase, setPhase] = useState<Phase>('checking');

  const runCheck = useCallback(() => {
    setPhase('checking');
    void (async () => {
      let result: DeviceBindingResult;
      try {
        result = await runDeviceBindingCheck();
      } catch (e) {
        logNrmRunError('device-binding.gate', e);
        const msg = e instanceof Error ? e.message : String(e);
        setPhase({ kind: 'error', message: msg });
        return;
      }

      switch (result.status) {
        case 'skip':
        case 'ok':
          onVerified();
          break;
        case 'mismatch':
          setPhase('mismatch');
          break;
        case 'unregistered':
          setPhase('unregistered');
          break;
        case 'error':
          setPhase({ kind: 'error', message: result.message });
          break;
      }
    })();
  }, [onVerified]);

  useEffect(() => {
    runCheck();
  }, [runCheck]);

  // ── 로딩 화면 ──────────────────────────────────────────────
  if (phase === 'checking') {
    return (
      <View style={styles.root}>
        <ActivityIndicator size="large" color="#ffffff" style={styles.spinner} />
        <Text style={styles.loadingLabel}>앱 시작 준비중...</Text>
      </View>
    );
  }

  // ── 디바이스 불일치 경고 ────────────────────────────────────
  if (phase === 'mismatch') {
    return (
      <View style={styles.root}>
        <View style={styles.dialog}>
          <View style={styles.dialogIconRow}>
            <View style={styles.warnIcon}>
              <Text style={styles.warnIconText}>!</Text>
            </View>
          </View>
          <Text style={styles.dialogTitle}>디바이스 불일치</Text>
          <Text style={styles.dialogBody}>
            제품 시리얼번호와 일치하지 않는 디바이스입니다.{'\n'}앱을 종료합니다.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.exitBtn, pressed && { opacity: 0.8 }]}
            onPress={() => BackHandler.exitApp()}>
            <Text style={styles.exitBtnText}>앱 종료</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── SerialNo 미등록 경고 ────────────────────────────────────
  if (phase === 'unregistered') {
    return (
      <View style={styles.root}>
        <View style={styles.dialog}>
          <View style={styles.dialogIconRow}>
            <View style={styles.warnIcon}>
              <Text style={styles.warnIconText}>!</Text>
            </View>
          </View>
          <Text style={styles.dialogTitle}>미등록 기기</Text>
          <Text style={styles.dialogBody}>
            제품 시리얼번호가 등록되지 않았습니다.{'\n'}앱을 종료합니다.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.exitBtn, pressed && { opacity: 0.8 }]}
            onPress={() => BackHandler.exitApp()}>
            <Text style={styles.exitBtnText}>앱 종료</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── 오류 화면 ───────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <View style={styles.dialog}>
        <Text style={styles.dialogTitle}>연결 오류</Text>
        <Text style={styles.dialogBody}>
          {`앱 시작 중 오류가 발생했습니다.\n네트워크 연결을 확인한 후 다시 시도하세요.\n\n${(phase as { kind: 'error'; message: string }).message}`}
        </Text>
        <Pressable
          style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.8 }]}
          onPress={runCheck}>
          <Text style={styles.retryBtnText}>다시 시도</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: nrmTokens.space.xl,
  },
  spinner: {
    transform: [{ scale: 1.4 }],
  },
  loadingLabel: {
    marginTop: nrmTokens.space.lg,
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
    fontWeight: '500',
  },

  // 다이얼로그 카드
  dialog: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#1c1c1e',
    borderRadius: nrmTokens.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.15)',
    padding: nrmTokens.space.xl,
    alignItems: 'center',
  },
  dialogIconRow: {
    marginBottom: nrmTokens.space.md,
  },
  warnIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255, 59, 48, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  warnIconText: {
    color: '#ff3b30',
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 32,
  },
  dialogTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: nrmTokens.space.sm,
    textAlign: 'center',
  },
  dialogBody: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: nrmTokens.space.xl,
  },

  // 앱 종료 버튼 (붉은 강조)
  exitBtn: {
    width: '100%',
    height: 48,
    borderRadius: nrmTokens.radius.pill,
    backgroundColor: '#ff3b30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exitBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },

  // 재시도 버튼 (기본 파란색)
  retryBtn: {
    width: '100%',
    height: 48,
    borderRadius: nrmTokens.radius.pill,
    backgroundColor: nrmTokens.color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
