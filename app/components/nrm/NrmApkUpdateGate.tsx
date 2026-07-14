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
  markNrmApkUpdateGateBlocking,
  markNrmApkUpdateGatePassed,
  runAfterNrmApkUpdateGate,
} from '@/lib/nrmApkUpdateStartup';
import {
  canNrmInstallPackages,
  downloadNrmApkUpdate,
  installNrmApkUpdate,
  isNrmApkUpdateNativeAvailable,
  openNrmInstallUnknownAppsSettings,
  subscribeNrmApkDownloadProgress,
} from '@/lib/nrmApkUpdateNative';
import { getNrmAppVersion } from '@/lib/nrmAppInfo';
import { nrmDeferUiWork } from '@/lib/nrmDeferUiWork';

/**
 * UI copy as ASCII \u escapes only.
 * Do not put raw Hangul literals in this file. Windows PowerShell Set-Content
 * has corrupted UTF-8 Korean into "??" and that text shipped to devices.
 */
const COPY = {
  checking: '\uC571 \uC900\uBE44\uC911..',
  awaitingPermission:
    '\uC124\uCE58 \uAD8C\uD55C \uC124\uC815 \uD6C4 \uB3CC\uC544\uC624\uBA74 \uC774\uC5B4\uC9D1\uB2C8\uB2E4...',
  installPermissionError:
    '\uC54C \uC218 \uC5C6\uB294 \uC571 \uC124\uCE58 \uAD8C\uD55C\uC744 \uD5C8\uC6A9\uD55C \uB4A4 \uB2E4\uC2DC \uC2DC\uB3C4\uD558\uC138\uC694.',
  promptTitle: '\uC5C5\uB370\uC774\uD2B8 \uD544\uC694',
  promptBody: (current: string, required: string) =>
    `\uD604\uC7AC v${current} \u2192 \uCD5C\uC2E0 v${required}\n\uC0C8 APK\uB97C \uB2E4\uC6B4\uB85C\uB4DC\uD574 \uC124\uCE58\uD569\uB2C8\uB2E4.`,
  update: '\uC5C5\uB370\uC774\uD2B8',
  exitApp: '\uC571 \uC885\uB8CC',
  downloading: (progress: number) => `APK \uB2E4\uC6B4\uB85C\uB4DC \uC911... ${progress}%`,
  downloadPreparing: '\uB2E4\uC6B4\uB85C\uB4DC \uC900\uBE44 \uC911...',
  installTitle: '\uC124\uCE58 \uC548\uB0B4',
  installBody:
    '\uC2DC\uC2A4\uD15C \uC124\uCE58 \uD654\uBA74\uC5D0\uC11C \uC5C5\uB370\uC774\uD2B8\uB97C \uC644\uB8CC\uD558\uC138\uC694.\n\uC124\uCE58 \uD6C4 \uC571\uC744 \uB2E4\uC2DC \uC2E4\uD589\uD569\uB2C8\uB2E4.',
  errorTitle: '\uC5C5\uB370\uC774\uD2B8 \uC624\uB958',
  retry: '\uB2E4\uC2DC \uC2DC\uB3C4',
} as const;

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

function schedulePostGateWarm(): void {
  runAfterNrmApkUpdateGate(() => {
    if (Platform.OS !== 'android') return;
    setTimeout(() => {
      void (async () => {
        const warmStartedAt = Date.now();
        try {
          const [yt, ff] = await Promise.all([
            import('@/lib/nrmInnertubeYoutube'),
            import('@/lib/nrmFfmpegPrefetch'),
          ]);
          await Promise.all([
            yt.warmInnertubeSessions().catch((e) => {
              logNrmRunError('apk-update.innertube_warm', e);
            }),
            ff.prefetchFfmpegOnDevice().catch(() => {}),
          ]);
        } catch (e) {
          logNrmRunError('apk-update.post_gate_warm', e);
        } finally {
          logNrmDev('apk-update', {
            event: 'post_gate_warm_done',
            warmWaitMs: Date.now() - warmStartedAt,
          });
        }
      })();
    }, 2500);
  });
}

export function NrmApkUpdateGate({ onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>('checking');
  const [progress, setProgress] = useState(0);
  const [requiredVersion, setRequiredVersion] = useState('');
  const downloadUrlRef = useRef('');
  const peakProgressRef = useRef(0);
  const updateInFlightRef = useRef(false);
  const canInstallPrefetchRef = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    markNrmApkUpdateGateBlocking();
  }, []);

  const finishGateWithoutBlockingWarm = useCallback(() => {
    onComplete();
    setTimeout(() => {
      markNrmApkUpdateGatePassed();
      schedulePostGateWarm();
    }, 0);
  }, [onComplete]);

  const runCheck = useCallback(() => {
    setPhase('checking');
    updateInFlightRef.current = false;
    canInstallPrefetchRef.current = null;
    markNrmApkUpdateGateBlocking();
    void (async () => {
      if (!isNrmApkUpdateNativeAvailable()) {
        finishGateWithoutBlockingWarm();
        return;
      }

      const result = await checkNrmApkUpdate();
      if (result.status === 'up_to_date') {
        finishGateWithoutBlockingWarm();
        return;
      }
      if (result.status === 'error') {
        setPhase({ kind: 'error', message: result.message });
        return;
      }

      downloadUrlRef.current = result.downloadUrl;
      setRequiredVersion(result.requiredVersion);
      setPhase('prompt');
      canInstallPrefetchRef.current = canNrmInstallPackages().catch(() => false);
    })();
  }, [finishGateWithoutBlockingWarm]);

  useEffect(() => {
    runCheck();
  }, [runCheck]);

  const runDownloadAndInstall = useCallback(async () => {
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
    if (updateInFlightRef.current) return;
    updateInFlightRef.current = true;

    setPhase('downloading');
    setProgress(0);
    peakProgressRef.current = 0;

    void (async () => {
      try {
        await nrmDeferUiWork();

        const canInstall = await (canInstallPrefetchRef.current ??
          canNrmInstallPackages().catch(() => false));
        canInstallPrefetchRef.current = null;

        if (!canInstall) {
          setPhase('awaiting_install_permission');
          await openNrmInstallUnknownAppsSettings();
          const granted = await waitForInstallPermission();
          if (!granted) {
            setPhase({
              kind: 'error',
              message: COPY.installPermissionError,
            });
            return;
          }
          setPhase('downloading');
          setProgress(0);
          await nrmDeferUiWork();
        }

        await runDownloadAndInstall();
      } catch (e) {
        logNrmRunError('apk-update.gate', e);
        const msg = e instanceof Error ? e.message : String(e);
        setPhase({ kind: 'error', message: msg });
      } finally {
        updateInFlightRef.current = false;
      }
    })();
  }, [runDownloadAndInstall]);

  if (phase === 'checking' || phase === 'awaiting_install_permission') {
    return (
      <View style={styles.root}>
        <ActivityIndicator size="large" color="#ffffff" style={styles.spinner} />
        <Text style={styles.loadingLabel}>
          {phase === 'awaiting_install_permission' ? COPY.awaitingPermission : COPY.checking}
        </Text>
      </View>
    );
  }

  if (phase === 'prompt') {
    const current = getNrmAppVersion();
    return (
      <View style={styles.root}>
        <View style={styles.dialog}>
          <Text style={styles.dialogTitle}>{COPY.promptTitle}</Text>
          <Text style={styles.dialogBody}>{COPY.promptBody(current, requiredVersion)}</Text>
          <Pressable
            accessibilityRole="button"
            hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
            style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
            onPress={startUpdate}>
            <Text style={styles.primaryBtnText}>{COPY.update}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={({ pressed }) => [styles.exitBtn, pressed && { opacity: 0.8 }]}
            onPress={() => BackHandler.exitApp()}>
            <Text style={styles.exitBtnText}>{COPY.exitApp}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (phase === 'downloading') {
    return (
      <View style={styles.root}>
        <ActivityIndicator size="large" color="#ffffff" style={styles.spinner} />
        <Text style={styles.loadingLabel}>
          {progress > 0 ? COPY.downloading(progress) : COPY.downloadPreparing}
        </Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.max(progress, 2)}%` }]} />
        </View>
      </View>
    );
  }

  if (phase === 'installing') {
    return (
      <View style={styles.root}>
        <View style={styles.dialog}>
          <Text style={styles.dialogTitle}>{COPY.installTitle}</Text>
          <Text style={styles.dialogBody}>{COPY.installBody}</Text>
          <Pressable
            accessibilityRole="button"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={({ pressed }) => [styles.exitBtn, pressed && { opacity: 0.8 }]}
            onPress={() => BackHandler.exitApp()}>
            <Text style={styles.exitBtnText}>{COPY.exitApp}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.dialog}>
        <Text style={styles.dialogTitle}>{COPY.errorTitle}</Text>
        <Text style={styles.dialogBody}>{phase.message}</Text>
        <Pressable
          accessibilityRole="button"
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
          style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
          onPress={runCheck}>
          <Text style={styles.primaryBtnText}>{COPY.retry}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={({ pressed }) => [styles.exitBtn, pressed && { opacity: 0.8 }]}
          onPress={() => BackHandler.exitApp()}>
          <Text style={styles.exitBtnText}>{COPY.exitApp}</Text>
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
