import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type AppStateStatus,
} from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';
import { logNrmDev, logNrmRunError } from '@/lib/nrmDevLog';
import { checkNrmApkUpdate } from '@/lib/nrmApkUpdate';
import {
  canNrmInstallPackages,
  downloadNrmApkUpdate,
  installNrmApkUpdate,
  isNrmApkUpdateNativeAvailable,
  openNrmInstallUnknownAppsSettings,
  subscribeNrmApkDownloadProgress,
} from '@/lib/nrmApkUpdateNative';
import { getNrmAppVersion } from '@/lib/nrmAppInfo';

type Phase =
  | 'checking'
  | 'prompt'
  | 'awaiting_install_permission'
  | 'downloading'
  | 'installing'
  | { kind: 'error'; message: string };

type Props = {
  onComplete: () => void;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 알 수 없는 앱 설치 설정 화면에서 돌아온 뒤 권한 재확인.
 * (콜드스타트에서 설정→복귀 타이밍이 어긋나 버튼이 먹통처럼 느껴지는 문제 완화)
 */
async function waitForInstallPermission(maxMs = 180_000): Promise<boolean> {
  const started = Date.now();
  let sawNonActive = AppState.currentState !== 'active';

  while (Date.now() - started < maxMs) {
    if (await canNrmInstallPackages()) return true;

    const state: AppStateStatus = AppState.currentState;
    if (state !== 'active') {
      sawNonActive = true;
    }

    if (sawNonActive && state === 'active') {
      await delay(400);
      if (await canNrmInstallPackages()) return true;
      return false;
    }

    await delay(400);
  }
  return canNrmInstallPackages();
}

async function warmAfterGatePass(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    const [yt, ff] = await Promise.all([
      import('@/lib/nrmInnertubeYoutube'),
      import('@/lib/nrmFfmpegPrefetch'),
    ]);
    await Promise.all([
      yt.warmInnertubeSessions().catch((e) => {
        logNrmRunError('apk-update.innertube_warm', e);
      }),
      ff.prefetchFfmpegOnDevice().catch(() => {
        /* optional */
      }),
    ]);
  } catch (e) {
    logNrmRunError('apk-update.post_gate_warm', e);
  }
}

/**
 * Android 앱 시작 시 GitHub Releases 공개 APK 자동 업데이트 게이트.
 * apkVersion.json(PAT 불필요)과 로컬 버전을 비교해 구버전이면 다운로드·설치 안내.
 * 업데이트가 필요할 때는 Innertube 워밍을 하지 않아 APK 대역폭을 독점한다.
 */
export function NrmApkUpdateGate({ onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>('checking');
  const [progress, setProgress] = useState(0);
  const [requiredVersion, setRequiredVersion] = useState('');
  const [busy, setBusy] = useState(false);
  const downloadUrlRef = useRef('');
  const peakProgressRef = useRef(0);
  const updateInFlightRef = useRef(false);

  const runCheck = useCallback(() => {
    setPhase('checking');
    setBusy(false);
    updateInFlightRef.current = false;
    void (async () => {
      const finishGate = async () => {
        const warmStartedAt = Date.now();
        // 업데이트 불필요일 때만 워밍 — APK 다운로드와 대역폭 경쟁 방지
        await warmAfterGatePass();
        logNrmDev('apk-update', {
          event: 'gate_complete_after_warm',
          warmWaitMs: Date.now() - warmStartedAt,
        });
        onComplete();
      };

      if (!isNrmApkUpdateNativeAvailable()) {
        await finishGate();
        return;
      }

      const result = await checkNrmApkUpdate();
      if (result.status === 'up_to_date') {
        await finishGate();
        return;
      }
      if (result.status === 'error') {
        setPhase({ kind: 'error', message: result.message });
        return;
      }

      downloadUrlRef.current = result.downloadUrl;
      setRequiredVersion(result.requiredVersion);
      setPhase('prompt');
    })();
  }, [onComplete]);

  useEffect(() => {
    runCheck();
  }, [runCheck]);

  const runDownloadAndInstall = useCallback(async () => {
    setPhase('downloading');
    peakProgressRef.current = 0;
    setProgress(0);
    const fileName = `NullReferenceMusic-v${requiredVersion}.apk`;
    const unsub = subscribeNrmApkDownloadProgress((ev) => {
      const next = Math.max(peakProgressRef.current, ev.progress);
      peakProgressRef.current = next;
      setProgress(next);
    });
    let apkPath: string;
    try {
      apkPath = await downloadNrmApkUpdate(downloadUrlRef.current, fileName);
    } finally {
      unsub();
    }

    setPhase('installing');
    await installNrmApkUpdate(apkPath);
  }, [requiredVersion]);

  const startUpdate = useCallback(() => {
    if (updateInFlightRef.current || busy) return;
    updateInFlightRef.current = true;
    setBusy(true);
    void (async () => {
      try {
        const canInstall = await canNrmInstallPackages();
        if (!canInstall) {
          setPhase('awaiting_install_permission');
          await openNrmInstallUnknownAppsSettings();
          const granted = await waitForInstallPermission();
          if (!granted) {
            setPhase({
              kind: 'error',
              message: '알 수 없는 앱 설치 권한을 허용한 뒤 다시 시도하세요.',
            });
            return;
          }
        }

        await runDownloadAndInstall();
      } catch (e) {
        logNrmRunError('apk-update.gate', e);
        const msg = e instanceof Error ? e.message : String(e);
        setPhase({ kind: 'error', message: msg });
      } finally {
        updateInFlightRef.current = false;
        setBusy(false);
      }
    })();
  }, [busy, runDownloadAndInstall]);

  if (phase === 'checking' || phase === 'awaiting_install_permission') {
    return (
      <View style={styles.root}>
        <ActivityIndicator size="large" color="#ffffff" style={styles.spinner} />
        <Text style={styles.loadingLabel}>
          {phase === 'awaiting_install_permission'
            ? '설치 권한 설정 후 돌아오면 이어집니다...'
            : '앱 준비중..'}
        </Text>
      </View>
    );
  }

  if (phase === 'prompt') {
    const current = getNrmAppVersion();
    return (
      <View style={styles.root}>
        <View style={styles.dialog}>
          <Text style={styles.dialogTitle}>업데이트 필요</Text>
          <Text style={styles.dialogBody}>
            {`현재 v${current} → 최신 v${requiredVersion}\n새 APK를 다운로드해 설치합니다.`}
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
            android_disableSound={false}
            style={({ pressed }) => [
              styles.primaryBtn,
              (pressed || busy) && { opacity: 0.85 },
            ]}
            onPress={startUpdate}>
            {busy ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.primaryBtnText}>업데이트</Text>
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={({ pressed }) => [styles.exitBtn, pressed && { opacity: 0.8 }]}
            onPress={() => BackHandler.exitApp()}>
            <Text style={styles.exitBtnText}>앱 종료</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (phase === 'downloading') {
    return (
      <View style={styles.root}>
        <ActivityIndicator size="large" color="#ffffff" style={styles.spinner} />
        <Text style={styles.loadingLabel}>APK 다운로드 중... {progress}%</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
      </View>
    );
  }

  if (phase === 'installing') {
    return (
      <View style={styles.root}>
        <View style={styles.dialog}>
          <Text style={styles.dialogTitle}>설치 안내</Text>
          <Text style={styles.dialogBody}>
            시스템 설치 화면에서 업데이트를 완료하세요.{'\n'}설치 후 앱을 다시 실행합니다.
          </Text>
          <Pressable
            accessibilityRole="button"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={({ pressed }) => [styles.exitBtn, pressed && { opacity: 0.8 }]}
            onPress={() => BackHandler.exitApp()}>
            <Text style={styles.exitBtnText}>앱 종료</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.dialog}>
        <Text style={styles.dialogTitle}>업데이트 오류</Text>
        <Text style={styles.dialogBody}>{phase.message}</Text>
        <Pressable
          accessibilityRole="button"
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
          style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
          onPress={runCheck}>
          <Text style={styles.primaryBtnText}>다시 시도</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={({ pressed }) => [styles.exitBtn, pressed && { opacity: 0.8 }]}
          onPress={() => BackHandler.exitApp()}>
          <Text style={styles.exitBtnText}>앱 종료</Text>
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
    marginBottom: nrmTokens.space.md,
  },
  loadingLabel: {
    marginTop: nrmTokens.space.lg,
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  progressTrack: {
    marginTop: nrmTokens.space.lg,
    width: '80%',
    maxWidth: 320,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: nrmTokens.color.primary,
  },
  dialog: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#1c1c1e',
    borderRadius: nrmTokens.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.15)',
    padding: nrmTokens.space.xl,
    alignItems: 'center',
    gap: nrmTokens.space.sm,
  },
  dialogTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  dialogBody: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: nrmTokens.space.md,
  },
  primaryBtn: {
    width: '100%',
    minHeight: 52,
    height: 52,
    borderRadius: nrmTokens.radius.pill,
    backgroundColor: nrmTokens.color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  exitBtn: {
    width: '100%',
    minHeight: 52,
    height: 52,
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
});
