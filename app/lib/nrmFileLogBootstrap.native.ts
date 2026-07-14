import { Platform } from 'react-native';

import { appendNrmFileLog, getNrmLogFilePath } from '@/lib/nrmFileLog';
import { initNrmFileLoggingRuntime, isNrmFileLoggingActive } from '@/lib/nrmFileLoggingRuntime';
import { runAfterNrmApkUpdateGate } from '@/lib/nrmApkUpdateStartup';
import { reconcileStaleArtifactsOnColdStart } from '@/lib/nrmStartupArtifactCleanup';

void (async () => {
  if (Platform.OS !== 'android') return;

  await initNrmFileLoggingRuntime();

  if (isNrmFileLoggingActive()) {
    const Constants = (await import('expo-constants')).default;
    const { ExecutionEnvironment } = await import('expo-constants');

    function envLabel(): string {
      const env = Constants.executionEnvironment;
      if (env === ExecutionEnvironment.Standalone) return 'standalone';
      if (env === ExecutionEnvironment.Bare) return 'bare';
      if (env === ExecutionEnvironment.StoreClient) return 'expo-go';
      return String(env ?? 'unknown');
    }

    const logPath = await getNrmLogFilePath();
    appendNrmFileLog(
      'js-bootstrap',
      'info',
      JSON.stringify({
        phase: 'js_bundle_loaded',
        env: envLabel(),
        appVersion: Constants.expoConfig?.version ?? Constants.nativeAppVersion,
        nativeVersion: Constants.nativeAppVersion,
        nativeBuild: Constants.nativeBuildVersion,
        dev: typeof __DEV__ !== 'undefined' ? __DEV__ : null,
        logPath,
      }),
    );
  }

  // 캐시 정리·ffmpeg·Innertube는 APK 게이트 통과 후에만 (업데이트 창/다운로드와 경쟁 금지)
  runAfterNrmApkUpdateGate(() => {
    void reconcileStaleArtifactsOnColdStart();
  });
})();
