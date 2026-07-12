import { Platform } from 'react-native';

import { prefetchFfmpegOnDevice } from '@/lib/nrmFfmpegPrefetch';
import { appendNrmFileLog, getNrmLogFilePath } from '@/lib/nrmFileLog';
import { initNrmFileLoggingRuntime, isNrmFileLoggingActive } from '@/lib/nrmFileLoggingRuntime';
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

  void reconcileStaleArtifactsOnColdStart();
  void prefetchFfmpegOnDevice();
  // 콜드스타트 즉시 android Innertube 워밍 시작 (버전 확인 게이트와 병렬, web은 폴백 시에만)
  void import('@/lib/nrmInnertubeYoutube')
    .then((m) => m.warmInnertubeSessions())
    .catch(() => {
      /* optional warmup */
    });
})();
