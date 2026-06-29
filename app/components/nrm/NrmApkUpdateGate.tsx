import { useCallback, useEffect, useRef, useState } from 'react';
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
  | 'downloading'
  | 'installing'
  | { kind: 'error'; message: string };

type Props = {
  onComplete: () => void;
};

/**
 * Android 앱 시작 시 GitHub Releases 공개 APK 자동 업데이트 게이트.
 * apkVersion.json(PAT 불필요)과 로컬 버전을 비교해 구버전이면 다운로드·설치 안내.
 */
export function NrmApkUpdateGate({ onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>('checking');
  const [progress, setProgress] = useState(0);
  const [requiredVersion, setRequiredVersion] = useState('');
  const downloadUrlRef = useRef('');

  const runCheck = useCallback(() => {
    setPhase('checking');
    void (async () => {
      if (!isNrmApkUpdateNativeAvailable()) {
        onComplete();
        return;
      }

      const result = await checkNrmApkUpdate();
      if (result.status === 'up_to_date') {
        onComplete();
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

  const startUpdate = useCallback(() => {
    void (async () => {
      try {
        const canInstall = await canNrmInstallPackages();
        if (!canInstall) {
          await openNrmInstallUnknownAppsSettings();
          setPhase({
            kind: 'error',
            message: '알 수 없는 앱 설치 권한을 허용한 뒤 다시 시도하세요.',
          });
          return;
        }

        setPhase('downloading');
        setProgress(0);
        const fileName = `NullReferenceMusic-v${requiredVersion}.apk`;
        const unsub = subscribeNrmApkDownloadProgress((ev) => {
          setProgress(ev.progress);
        });
        let apkPath: string;
        try {
          apkPath = await downloadNrmApkUpdate(downloadUrlRef.current, fileName);
        } finally {
          unsub();
        }

        setPhase('installing');
        await installNrmApkUpdate(apkPath);
      } catch (e) {
        logNrmRunError('apk-update.gate', e);
        const msg = e instanceof Error ? e.message : String(e);
        setPhase({ kind: 'error', message: msg });
      }
    })();
  }, [requiredVersion]);

  if (phase === 'checking') {
    return (
      <View style={styles.root}>
        <ActivityIndicator size="large" color="#ffffff" style={styles.spinner} />
        <Text style={styles.loadingLabel}>버전 확인 중...</Text>
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
            style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
            onPress={startUpdate}>
            <Text style={styles.primaryBtnText}>업데이트</Text>
          </Pressable>
          <Pressable
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
          style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
          onPress={runCheck}>
          <Text style={styles.primaryBtnText}>다시 시도</Text>
        </Pressable>
        <Pressable
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
    height: 48,
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
});
