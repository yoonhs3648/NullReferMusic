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
  mapNrmApkUpdateErrorMessage,
  NRM_APK_UPDATE_COPY as COPY,
} from '@/lib/nrmApkUpdateCopy';
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
 * APK update gate UI.
 * All user-visible Korean MUST live in `nrmApkUpdateCopy.ts` as `\uXXXX` escapes.
 * Do not add Hangul literals here — see docs/NRM-UTF8-HANGUL-RULE.md.
 */

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

/** After APK gate: prefetch ffmpeg only. Innertube warms on first YouTube search. */
function schedulePostGateWarm(): void {
  runAfterNrmApkUpdateGate(() => {
    if (Platform.OS !== 'android') return;
    setTimeout(() => {
      void (async () => {
        const warmStartedAt = Date.now();
        try {
          const ff = await import('@/lib/nrmFfmpegPrefetch');
          await ff.prefetchFfmpegOnDevice().catch(() => {});
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
        setPhase({ kind: 'error', message: mapNrmApkUpdateErrorMessage(result.message) });
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
        setPhase({ kind: 'error', message: mapNrmApkUpdateErrorMessage(e) });
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
